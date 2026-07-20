// backend/src/index.js
// Main Express server entry point.
// On startup: initializes DB, seeds data if empty, runs initial badge evaluation,
// then serves all REST API routes.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from './db/schema.js';
import { seed } from './db/seed.js';
import { evaluateAllBadges } from './agents/badge-agent.js';

import productsRouter from './routes/products.js';
import customersRouter from './routes/customers.js';
import cartRouter from './routes/cart.js';
import ordersRouter from './routes/orders.js';
import badgesRouter from './routes/badges.js';
import qaRouter from './routes/qa.js';

const PORT = process.env.PORT || 3001;

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Request logging for development
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/badges', badgesRouter);
app.use('/api/qa', qaRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Startup ────────────────────────────────────────────────────────────────
async function start() {
  // Ensure DB schema exists and data is seeded
  getDb(); // Initializes schema
  seed();  // Idempotent seed

  app.listen(PORT, () => {
    console.log(`\n🛡️  Axiom Backend running at http://localhost:${PORT}`);
    console.log(`   API health: http://localhost:${PORT}/api/health\n`);
  });

  // Run badge evaluation after a short delay so the server is responsive first
  if (process.env.NVIDIA_API_KEY) {
    setTimeout(() => {
      // Disable badge agent on startup to prevent hitting Nvidia NIM rate limits
      // console.log('[startup] Triggering initial badge evaluation...');
      // evaluateAllBadges().catch(err => console.error('[startup] Badge evaluation error:', err.message));
    }, 2000);
  } else {
    console.warn('[startup] ⚠️  NVIDIA_API_KEY not set — badge and QA agents will not function.');
    console.warn('[startup]    Copy .env.example to .env and add your API key.');
  }
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
