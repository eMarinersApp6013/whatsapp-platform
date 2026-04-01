'use strict';
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const path       = require('path');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'wa-chat', ts: new Date() }));

// ── Routes ─────────────────────────────────────────────────────────────────────
const authRoutes     = require('./routes/auth.routes');
const dashRoutes     = require('./routes/dashboard.routes');
const clientRoutes   = require('./routes/clients.routes');
const productRoutes  = require('./routes/products.routes');
const settingsRoutes = require('./routes/settings.routes');
const webhookRoutes  = require('./routes/webhook.routes');
const ordersRoutes   = require('./routes/orders.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const invoiceRoutes   = require('./routes/invoice.routes');
const catalogRoutes   = require('./routes/catalog.routes');
const chatRoutes            = require('./routes/chat.routes');
const agentsRoutes          = require('./routes/agents.routes');
const apiKeysRoutes         = require('./routes/apikeys.routes');
const outgoingWebhookRoutes = require('./routes/outgoing-webhooks.routes');
const publicApiRoutes       = require('./routes/public-api.routes');

app.use('/api/auth',      authRoutes);
app.use('/api/dashboard', dashRoutes);
app.use('/api/clients',   clientRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/orders',    ordersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/invoice',   invoiceRoutes);
app.use('/api/catalog',   catalogRoutes);
app.use('/api/chat',      chatRoutes);
app.use('/api/agents',    agentsRoutes);
app.use('/api/apikeys',   apiKeysRoutes);
app.use('/api/webhooks',  outgoingWebhookRoutes);
app.use('/v1',            publicApiRoutes);   // Public REST API (X-Api-Key auth)
app.use('/webhook',       webhookRoutes);

// ── Socket.io: real-time messaging ────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Socket] client connected:', socket.id);

  socket.on('join_conversation', (conversationId) => {
    socket.join(`conv_${conversationId}`);
  });

  socket.on('send_message', (data) => {
    io.to(`conv_${data.conversation_id}`).emit('new_message', data);
  });

  // Agent joins their personal room for targeted notifications
  socket.on('agent_connect', (agentId) => {
    socket.join(`agent_${agentId}`);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Static admin panel ────────────────────────────────────────────────────────
const buildPath = path.join(__dirname, 'admin-panel', 'build');
app.use(express.static(buildPath));
app.get(/^(?!\/(api|webhook|health|socket\.io)).*/, (_req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// ── Start automation (keep-in-touch jobs) ─────────────────────────────────────
try {
  const { startAutomation } = require('./cron/automation');
  startAutomation();
} catch (err) {
  console.warn('[automation] could not start (Redis unavailable?):', err.message);
}

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4100;
server.listen(PORT, () => {
  console.log(`[NavyStore WA-Chat] running on port ${PORT}`);
});
