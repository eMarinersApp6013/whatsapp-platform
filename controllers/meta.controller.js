const { pool } = require('../config/db');

// GET /webhook/meta — Meta verification
exports.verify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_VERIFY_TOKEN || 'navystore_verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Meta webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// POST /webhook/meta — receive WhatsApp messages
exports.receive = async (req, res) => {
  try {
    // Always respond 200 quickly to Meta
    res.sendStatus(200);

    const body = req.body;
    if (!body.object || body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages || [];

        // Look up tenant by phone_number_id
        const tenantResult = await pool.query(
          'SELECT * FROM tenants WHERE phone_number_id = $1 AND is_active = true',
          [phoneNumberId]
        );
        if (tenantResult.rows.length === 0) {
          console.warn('No tenant found for phone_number_id:', phoneNumberId);
          continue;
        }
        const tenant = tenantResult.rows[0];

        for (const msg of messages) {
          const senderPhone = msg.from;
          const msgType = msg.type || 'text';
          let messageText = '';

          if (msgType === 'text') {
            messageText = msg.text?.body || '';
          } else if (msgType === 'image' || msgType === 'audio' || msgType === 'video' || msgType === 'document') {
            messageText = `[${msgType}] ${msg[msgType]?.id || ''}`;
          } else if (msgType === 'interactive') {
            messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
          }

          // Check if staff
          const staffResult = await pool.query(
            'SELECT * FROM staff_numbers WHERE tenant_id = $1 AND phone = $2 AND is_active = true',
            [tenant.id, senderPhone]
          );
          const isStaff = staffResult.rows.length > 0;

          // Find or create client
          let clientId = null;
          if (!isStaff) {
            const clientResult = await pool.query(
              'SELECT id FROM clients WHERE tenant_id = $1 AND phone = $2',
              [tenant.id, senderPhone]
            );
            if (clientResult.rows.length > 0) {
              clientId = clientResult.rows[0].id;
            } else {
              const newClient = await pool.query(
                'INSERT INTO clients (tenant_id, phone, name) VALUES ($1, $2, $3) RETURNING id',
                [tenant.id, senderPhone, value.contacts?.[0]?.profile?.name || senderPhone]
              );
              clientId = newClient.rows[0].id;
            }
          }

          // Save to conversations
          await pool.query(
            `INSERT INTO conversations (client_id, tenant_id, phone, role, message, message_type)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [clientId, tenant.id, senderPhone, isStaff ? 'staff' : 'client', messageText, msgType]
          );

          console.log(`[${tenant.name}] ${isStaff ? 'STAFF' : 'CLIENT'} ${senderPhone}: ${messageText}`);

          // TODO Phase 2: route to AI controller for processing
        }
      }
    }
  } catch (err) {
    console.error('Webhook receive error:', err);
  }
};
