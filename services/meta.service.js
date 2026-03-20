const fs = require('fs');
const path = require('path');

const META_API_VERSION = 'v21.0';

/**
 * Send a text message via Meta Cloud API.
 */
async function sendTextMessage(phoneNumberId, waToken, to, text) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
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
    console.error('Meta send text error:', data);
  }
  return data;
}

/**
 * Send an image message via Meta Cloud API.
 */
async function sendImageMessage(phoneNumberId, waToken, to, imageUrl, caption) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
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
  const data = await response.json();
  if (!response.ok) {
    console.error('Meta send image error:', data);
  }
  return data;
}

/**
 * Download media from Meta Cloud API.
 * Meta media URLs expire in 24hrs — save immediately to /uploads/.
 */
async function downloadMedia(mediaId, waToken) {
  // Step 1: Get the media URL
  const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${waToken}` },
  });
  const metaData = await metaRes.json();
  if (!metaData.url) {
    console.error('Meta media URL not found:', metaData);
    return null;
  }

  // Step 2: Download the actual file
  const fileRes = await fetch(metaData.url, {
    headers: { Authorization: `Bearer ${waToken}` },
  });
  if (!fileRes.ok) {
    console.error('Meta media download failed:', fileRes.status);
    return null;
  }

  const contentType = fileRes.headers.get('content-type') || '';
  let ext = '.bin';
  if (contentType.includes('audio/ogg')) ext = '.ogg';
  else if (contentType.includes('audio/mpeg')) ext = '.mp3';
  else if (contentType.includes('audio')) ext = '.ogg';
  else if (contentType.includes('image/jpeg')) ext = '.jpg';
  else if (contentType.includes('image/png')) ext = '.png';
  else if (contentType.includes('image/webp')) ext = '.webp';
  else if (contentType.includes('video/mp4')) ext = '.mp4';
  else if (contentType.includes('application/pdf')) ext = '.pdf';

  const filename = `${mediaId}${ext}`;
  const filePath = path.join(__dirname, '..', 'uploads', filename);

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  console.log(`Media saved: ${filePath} (${buffer.length} bytes)`);
  return { filePath, filename, contentType, size: buffer.length };
}

/**
 * Mark a message as read in WhatsApp.
 */
async function markAsRead(phoneNumberId, waToken, messageId) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${waToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  }).catch((err) => console.error('Mark as read error:', err));
}

module.exports = { sendTextMessage, sendImageMessage, downloadMedia, markAsRead };
