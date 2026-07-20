// backend/src/routes/badges.js
import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { evaluateBadges } from '../agents/badge-agent.js';

const router = Router();

// GET /api/badges?entity_type=cart&entity_id=1 — get badges for an entity
router.get('/', (req, res) => {
  const { entity_type, entity_id } = req.query;
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }

  const db = getDb();
  const badges = db.prepare(
    'SELECT * FROM badges WHERE entity_type = ? AND entity_id = ? ORDER BY assigned_at DESC'
  ).all(entity_type, entity_id);

  res.json(badges);
});

// GET /api/badges/bulk — get all badges at once for the UI
// Query: ?customer_id=1 → returns cart, customer, and all product badges
router.get('/bulk', (req, res) => {
  const { customer_id } = req.query;
  const db = getDb();

  const result = {
    customer: [],
    cart: [],
    products: {},
  };

  if (customer_id) {
    result.customer = db.prepare(
      "SELECT * FROM badges WHERE entity_type = 'customer' AND entity_id = ?"
    ).all(customer_id);

    result.cart = db.prepare(
      "SELECT * FROM badges WHERE entity_type = 'cart' AND entity_id = ?"
    ).all(customer_id);
  }

  // Get all product badges
  const productBadges = db.prepare(
    "SELECT * FROM badges WHERE entity_type = 'product' ORDER BY entity_id"
  ).all();

  for (const badge of productBadges) {
    if (!result.products[badge.entity_id]) {
      result.products[badge.entity_id] = [];
    }
    result.products[badge.entity_id].push(badge);
  }

  res.json(result);
});

// POST /api/badges/evaluate — manually trigger badge evaluation
router.post('/evaluate', async (req, res) => {
  const { entity_type, entity_id } = req.body;
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }

  try {
    const badges = await evaluateBadges(entity_type, entity_id);
    res.json({ success: true, badges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
