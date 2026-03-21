/**
 * Zoho Books integration — only used when tenant.zoho_enabled = true.
 * Default invoice provider is builtin PDF generator.
 */

let _accessToken = null;
let _tokenExpiry = 0;

/**
 * Refresh OAuth access token using refresh token.
 */
async function refreshToken() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Zoho credentials not configured');
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(`https://accounts.zoho.in/oauth/v2/token?${params}`, {
    method: 'POST',
  });

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Zoho token refresh failed: ' + JSON.stringify(data));
  }

  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _accessToken;
}

async function getToken() {
  if (!_accessToken || Date.now() >= _tokenExpiry - 60000) {
    await refreshToken();
  }
  return _accessToken;
}

/**
 * Create a draft invoice in Zoho Books.
 */
async function createInvoice(order, tenant) {
  const token = await getToken();
  const orgId = process.env.ZOHO_ORG_ID;

  const items = (order.items_json || []).map((item) => ({
    name: item.name,
    quantity: item.qty || 1,
    rate: parseFloat(item.price || 0),
    tax_percentage: parseFloat(item.gst_rate || 0),
    hsn_or_sac: item.hsn_code || '',
  }));

  const address = typeof order.address_json === 'string' ? JSON.parse(order.address_json) : (order.address_json || {});

  const payload = {
    customer_name: order.client_name || 'Customer',
    reference_number: order.order_number,
    line_items: items,
    shipping_charge: parseFloat(order.shipping_charge || 0),
    notes: `Order ${order.order_number} — ${tenant.name}`,
    billing_address: {
      address: [address.flat, address.area].filter(Boolean).join(', '),
      city: address.city || '',
      state: address.state || '',
      zip: address.pincode || '',
      country: 'India',
    },
    status: 'draft',
  };

  const response = await fetch(`https://www.zohoapis.in/books/v3/invoices?organization_id=${orgId}`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (data.code !== 0) {
    console.error('Zoho createInvoice error:', data);
    throw new Error(data.message || 'Zoho invoice creation failed');
  }

  return data.invoice;
}

/**
 * Email an approved invoice from Zoho Books.
 */
async function emailInvoice(zohoInvoiceId) {
  const token = await getToken();
  const orgId = process.env.ZOHO_ORG_ID;

  const response = await fetch(
    `https://www.zohoapis.in/books/v3/invoices/${zohoInvoiceId}/email?organization_id=${orgId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ send_from_org_email_id: true }),
    }
  );

  const data = await response.json();
  if (data.code !== 0) {
    console.error('Zoho emailInvoice error:', data);
    throw new Error(data.message || 'Zoho email failed');
  }

  return data;
}

module.exports = { refreshToken, createInvoice, emailInvoice };
