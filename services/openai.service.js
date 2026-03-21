const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

let _openai;
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * Build system prompt for GPT-4o with tenant context, client info, product catalog, and history.
 */
function buildSystemPrompt(tenant, client, products, history) {
  const productCatalog = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    price: parseFloat(p.price),
    gst_rate: parseFloat(p.gst_rate),
    hsn_code: p.hsn_code,
    stock_qty: p.stock_qty,
    rank_tags: p.rank_tags,
    weight_kg: parseFloat(p.weight_kg),
    image_urls: p.image_urls,
  }));

  return `You are the AI sales assistant for "${tenant.name}".

## Your Identity
- You are a friendly, helpful sales assistant on WhatsApp.
- You speak in the same style as the customer — English, Hinglish, or Hindi written in English script.
- You are warm and conversational, not robotic.

## Current Customer
- Name: ${client.name || 'Unknown'}
- Phone: ${client.phone}
- Rank: ${client.rank || 'Not set yet'}
- VIP: ${client.is_vip ? 'YES — this is a VIP customer with ' + (client.order_count || 0) + ' previous orders (₹' + (parseFloat(client.total_spent) || 0).toFixed(0) + ' total spent). Greet them warmly by name!' : 'No'}${client.is_vip && parseFloat(tenant.loyalty_discount_pct) > 0 ? '\n- Loyalty discount available: ' + tenant.loyalty_discount_pct + '% off — offer this to VIP customers!' : ''}

## Rules — NEVER break these
1. ALWAYS ask the customer's rank (designation/role) before recommending products if rank is not set.
2. NEVER make up prices — ONLY use prices from the product catalog below.
3. NEVER confirm a payment has been received — only the Cashfree webhook can confirm payment.
4. Keep replies short and conversational — this is WhatsApp, not email.
5. When recommending products, pick items that match the customer's rank from rank_tags.
6. If the customer wants to buy, collect: which products, quantities, then ask for delivery address.
7. If the customer has a complaint or wants order status, create a support ticket.
8. When customer shares an address, set intent to "address_given" and parse the address into the "address" object.
9. When customer confirms items and quantities, set action to "build_quote" with the cart array.

## Product Catalog (JSON)
${JSON.stringify(productCatalog, null, 2)}

## Conversation History (last messages)
${history.map((m) => `${m.role}: ${m.message}`).join('\n')}

## Response Format — ALWAYS return valid JSON only, no markdown, no explanation:
{
  "intent": "greeting|query|buying_intent|address_given|complaint|order_status",
  "reply": "Your WhatsApp reply text to the customer",
  "action": "none|send_products|build_quote|ask_address|send_payment|create_ticket",
  "products": [{"id": 1, "name": "...", "price": 100}],
  "cart": [{"product_id": 1, "name": "...", "qty": 1, "price": 100}],
  "client_rank": null,
  "address": null,
  "raw_address": null
}

Only include "products" array when action is "send_products". Use exact product IDs from the catalog.
Only include "cart" array when action is "build_quote" or "ask_address".
When intent is "address_given", parse the address and set:
  "address": {"name": "...", "flat": "...", "area": "...", "city": "...", "pincode": "123456", "state": "..."}
  "raw_address": "the full address text as the customer typed it"
Always include "intent", "reply", and "action".
If the customer mentions their rank/designation, set "client_rank" to that value (e.g. "Captain", "Officer"). Otherwise set it to null.`;
}

/**
 * Call GPT-4o with the full context and return parsed JSON response.
 */
async function chat(tenant, client, products, history, userMessage) {
  const systemPrompt = buildSystemPrompt(tenant, client, products, history);

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch (err) {
    console.error('GPT-4o returned invalid JSON:', content);
    return {
      intent: 'query',
      reply: 'Sorry, I had trouble processing that. Could you say that again?',
      action: 'none',
      products: [],
      cart: [],
    };
  }
}

/**
 * Transcribe audio file using OpenAI Whisper API.
 */
async function transcribeAudio(filePath) {
  const response = await getClient().audio.transcriptions.create({
    model: 'whisper-1',
    file: fs.createReadStream(filePath),
    language: 'en',
  });
  return response.text;
}

module.exports = { chat, transcribeAudio, buildSystemPrompt };
