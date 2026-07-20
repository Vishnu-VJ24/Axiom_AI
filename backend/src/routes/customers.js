// backend/src/routes/customers.js
import { Router } from 'express';
import { getDb } from '../db/schema.js';

const router = Router();

// GET /api/customers — all customers with order counts
router.get('/', (req, res) => {
  const db = getDb();
  const customers = db.prepare(`
    SELECT c.*, COUNT(o.id) as order_count,
           COALESCE(SUM(o.total), 0) as lifetime_total
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  res.json(customers);
});

// GET /api/customers/:id — single customer with full order history
router.get('/:id', (req, res) => {
  const db = getDb();
  const customer = db.prepare(`
    SELECT c.*, COUNT(o.id) as order_count,
           COALESCE(SUM(o.total), 0) as lifetime_total
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

export default router;
