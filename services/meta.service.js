'use strict'
const axios = require('axios')

const BASE = 'https://graph.facebook.com/v19.0'

let _token = ''
let _phoneId = ''

// Called by webhook to use DB credentials (overrides env vars)
exports.configure = (token, phoneId) => {
  if (token)   _token   = token
  if (phoneId) _phoneId = phoneId
}

function getToken()   { return _token   || process.env.META_WHATSAPP_TOKEN   || '' }
function getPhoneId() { return _phoneId || process.env.META_PHONE_NUMBER_ID  || '' }

async function send(payload) {
  const token = getToken()
  const phoneId = getPhoneId()
  if (!token || token === 'FILL_LATER') throw new Error('META_WHATSAPP_TOKEN not set')
  return axios.post(`${BASE}/${phoneId}/messages`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  })
}

exports.sendText = async (to, text) => send({
  messaging_product: 'whatsapp', to,
  type: 'text', text: { body: text, preview_url: false }
})

exports.sendImage = async (to, imageUrl, caption = '') => send({
  messaging_product: 'whatsapp', to,
  type: 'image', image: { link: imageUrl, caption }
})

exports.sendDocument = async (to, docUrl, filename = 'document') => send({
  messaging_product: 'whatsapp', to,
  type: 'document', document: { link: docUrl, filename }
})

exports.sendButtons = async (to, body, buttons) => send({
  messaging_product: 'whatsapp', to, type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: body },
    action: { buttons: buttons.map((b, i) => ({ type: 'reply', reply: { id: b.id || `btn_${i}`, title: b.title } })) }
  }
})

exports.sendList = async (to, header, body, footer, buttonText, sections) => send({
  messaging_product: 'whatsapp', to, type: 'interactive',
  interactive: {
    type: 'list',
    header: { type: 'text', text: header },
    body: { text: body },
    footer: { text: footer },
    action: { button: buttonText, sections }
  }
})

exports.sendProductCards = async (to, products) => {
  // Send up to 3 products as image messages with buttons
  const slice = products.slice(0, 3)
  for (const p of slice) {
    const imgUrl = p.image_urls?.[0] || `https://placehold.co/400x400?text=${encodeURIComponent(p.name)}`
    const caption = `*${p.name}*\n💰 ₹${p.price}${p.compare_price > p.price ? ` ~~₹${p.compare_price}~~` : ''}\n📦 Stock: ${p.stock_qty > 0 ? `${p.stock_qty} left` : 'Out of stock'}\n\n${p.description?.slice(0, 100) || ''}`
    await exports.sendImage(to, imgUrl, caption)
  }
}

exports.sendCartSummary = async (to, cart) => {
  const items = cart.items || []
  if (!items.length) {
    return exports.sendText(to, '🛒 Your cart is empty!\n\nBrowse our catalog and type the product name to add items.')
  }
  let text = '🛒 *Your Cart:*\n\n'
  items.forEach((item, i) => {
    text += `${i + 1}. ${item.name} x${item.qty} = ₹${(item.price * item.qty).toFixed(0)}\n`
  })
  text += `\n💰 *Total: ₹${cart.total?.toFixed(0) || cart.subtotal?.toFixed(0)}*`
  text += '\n\nReply "CHECKOUT" to place order or "CLEAR CART" to start fresh.'
  return exports.sendText(to, text)
}
