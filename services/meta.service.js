// Meta Cloud API service — send WhatsApp messages

async function sendTextMessage(phoneNumberId, waToken, to, text) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${waToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('Meta API error:', data);
  }
  return data;
}

async function sendImageMessage(phoneNumberId, waToken, to, imageUrl, caption) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${waToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl, caption },
    }),
  });
  return response.json();
}

module.exports = { sendTextMessage, sendImageMessage };
