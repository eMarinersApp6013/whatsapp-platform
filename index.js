require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { initTables } = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Middleware
app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    // Capture raw body for webhook signature verification (Cashfree HMAC)
    req.rawBody = buf.toString();
  },
}));
app.use(express.urlencoded({ extended: true }));

// Make io accessible in routes
app.set('io', io);

// Routes
app.use('/webhook', require('./routes/webhook.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/orders', require('./routes/orders.routes'));
app.use('/api/products', require('./routes/products.routes'));
app.use('/api/clients', require('./routes/clients.routes'));
app.use('/api/settings', require('./routes/settings.routes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Admin connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Admin disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 4100;

async function start() {
  try {
    await initTables();
    server.listen(PORT, () => {
      console.log(`WhatsApp Platform running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
