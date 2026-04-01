# NavyStore WhatsApp AI Agent — Read this before writing any code

## SERVER
- VPS: 147.93.97.186 (Hostinger Ubuntu 24.04)
- App folder: /var/www/wa-chat/
- App URL: https://wa.nodesurge.tech (port 4100)
- Admin URL: https://adm.nodesurge.tech (port 4201)
- Deploy: push to main branch = auto live in 60 seconds
- GitHub: eMarinersApp6013/whatsapp-platform
- DO NOT TOUCH: port 3000 (Chatwoot), port 4000 (old courier), port 5678 (n8n)

## PACKAGE.JSON SCRIPTS (critical — must use these exactly)
"start": "node index.js"
"dev": "nodemon index.js"
"build": "echo no build step"

## TECH STACK — use exactly these, no alternatives
- Backend: Node.js 20 + Express (NOT Next.js, NOT Fastify)
- Database: PostgreSQL port 5432 (already running on VPS)
- Realtime: Socket.io
- Queue: Bull + Redis port 6379 db=1 (already running on VPS)
- AI: OpenAI GPT-4o (model name: gpt-4o)
- Voice: OpenAI Whisper API
- WhatsApp: Meta Cloud API (NOT Chatwoot, NOT Twilio)
- Payments: Cashfree (default), Razorpay (backup)
- Shipping: Shiprocket API
- Invoice: Zoho Books REST API
- Email: Gmail SMTP via nodemailer
- Frontend: React 18 + Tailwind CSS (separate app on port 4201)
- Process manager: PM2 (already installed)

## FOLDER STRUCTURE — create exactly this
/var/www/wa-chat/
├── index.js
├── config/
│   ├── db.js          (PostgreSQL via pg library)
│   └── redis.js       (Redis connection)
├── routes/
│   ├── webhook.routes.js
│   ├── orders.routes.js
│   ├── products.routes.js
│   ├── clients.routes.js
│   ├── auth.routes.js
│   └── settings.routes.js
├── controllers/
│   ├── meta.controller.js
│   ├── ai.controller.js
│   ├── payment.controller.js
│   ├── shipping.controller.js
│   └── invoice.controller.js
├── services/
│   ├── meta.service.js
│   ├── openai.service.js
│   ├── cashfree.service.js
│   ├── shiprocket.service.js
│   ├── zoho.service.js
│   └── email.service.js
├── middleware/
│   ├── auth.middleware.js
│   └── tenant.middleware.js
├── models/
│   ├── tenant.model.js
│   ├── client.model.js
│   ├── order.model.js
│   ├── product.model.js
│   └── conversation.model.js
├── cron/
│   └── tracking.cron.js
├── utils/
│   ├── pincode.utils.js
│   └── image.utils.js
└── uploads/

## DATABASE TABLES — PostgreSQL, create all on startup
tenants: id, name, waba_id, phone_number_id, wa_token, plan, is_active
clients: id, tenant_id, phone, name, rank, address_json, created_at
products: id, tenant_id, sku, name, description, price, gst_rate, hsn_code, stock_qty, rank_tags[], image_urls[], weight_kg, is_active
orders: id, tenant_id, client_id, order_number, status, items_json, subtotal, gst_amount, shipping_charge, total, payment_method, payment_status, cashfree_order_id, address_json, zoho_invoice_id, invoice_approved, awb_number, courier_slip_approved, courier_partner
conversations: id, client_id, tenant_id, phone, role, message, message_type, created_at
courier_slips: id, order_id, tenant_id, status, weight_kg, dimensions_json, courier_partner, awb_number, label_url, approved_at
shipping_rates: id, tenant_id, zone, states[], rate_500g, rate_1kg, rate_2kg, per_kg_extra
staff_numbers: id, tenant_id, phone, name, is_active
support_tickets: id, order_id, client_id, tenant_id, issue_type, description, status

## API ENDPOINTS — build all of these
POST /webhook/meta          (receive WhatsApp messages)
GET  /webhook/meta          (Meta verification — return hub.challenge)
POST /webhook/cashfree      (payment status — verify HMAC signature first)
POST /webhook/shiprocket    (shipping updates)
POST /api/auth/login        (return JWT)
GET  /api/orders            (list with filters)
PATCH /api/orders/:id/approve-invoice   (trigger Zoho email to client)
PATCH /api/orders/:id/approve-courier   (generate AWB via Shiprocket)
GET  /api/products
POST /api/products
POST /api/products/import   (Excel bulk import)
GET  /api/clients
GET  /api/conversations/:phone
GET  /api/analytics/summary
PUT  /api/settings
POST /api/staff-numbers

## WHATSAPP MESSAGE FLOW
1. POST /webhook/meta received
2. Check staff_numbers table — if match go to staff flow, else client flow
3. Load client + last 10 conversation messages
4. Send to GPT-4o with system prompt + full product catalog
5. GPT-4o returns JSON: {intent, reply, action, products[], cart[]}
6. Execute action — send reply via Meta API — save to conversations table
7. buying_intent → ask rank → send product cards with images
8. confirmed_items → build quotation + shipping charge → ask address
9. address_given → generate Cashfree payment link → send to client
10. Cashfree webhook SUCCESS → create order → push to Zoho Books (DRAFT)
11. Admin approves invoice → send PDF to client
12. Admin approves courier → generate AWB → send tracking to client

## OPENAI SYSTEM PROMPT — build in openai.service.js
- Identity: NavyStore AI sales assistant
- Language: reply in same style as customer (English/Hinglish/Hindi in English script)
- Always ask rank before recommending products
- Inject: tenant store name, client name+rank, full product catalog JSON, last 10 messages
- Return JSON only: {intent, reply, action, products[], cart[]}
- intent values: greeting, query, buying_intent, address_given, complaint, order_status
- action values: none, send_products, build_quote, ask_address, send_payment, create_ticket
- NEVER make up prices — only use products from catalog
- NEVER confirm payment unless Cashfree webhook confirmed it

## STAFF WHATSAPP COMMANDS (from +917978839679)
orders              → list today's pending orders
order #ID           → full order details
approve invoice ID  → mark approved, send PDF to client
approve courier ID  → generate AWB, send tracking to client
shipped ID          → update status to DISPATCHED
report              → today's sales summary

## CRITICAL RULES — never break these
1. NEVER send invoice without invoice_approved = true in DB
2. NEVER send tracking without courier_slip_approved = true in DB
3. ALWAYS verify Cashfree webhook HMAC-SHA256 signature before processing
4. ALWAYS check staff_numbers table FIRST on every incoming message
5. ALWAYS save WhatsApp media to /uploads/ immediately — Meta URLs expire in 24hrs
6. NEVER put API keys in code — only in .env on VPS
7. ALWAYS filter every DB query by tenant_id
8. Port 4100 = WhatsApp backend only. Port 4201 = Admin panel only. Never mix.

## BUILD ORDER — phases in sequence
Phase 1: index.js + db.js + all tables + Meta webhook + JWT auth (BUILD THIS FIRST)
Phase 2: OpenAI integration — AI reads WA message, sends reply
Phase 3: Product catalog API + Excel import + AI product knowledge
Phase 4: Full order flow — quote, address, Cashfree payment, order confirmed
Phase 5: Zoho Books + Shiprocket + tracking updates
Phase 6: React admin panel — login, orders, approvals, inbox
Phase 7: Socket.io realtime inbox + AI take-over toggle
Phase 8: SaaS multi-tenant — tenant table, middleware, data isolation

## FIRST TASK — START HERE
Build Phase 1 only:
1. Create complete folder structure as shown above
2. index.js — Express on port 4100 with Socket.io
3. config/db.js — PostgreSQL connection on localhost:5432
4. Create all 9 database tables with correct columns
5. GET /webhook/meta — Meta verification endpoint
6. POST /webhook/meta — receive and save messages to conversations table
7. POST /api/auth/login — return JWT token
8. package.json with correct scripts
9. Commit everything to main branch

Do NOT build the frontend yet. Backend Phase 1 only.
