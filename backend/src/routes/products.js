// backend/src/routes/products.js
import { Router } from 'express';
import { getDb } from '../db/schema.js';

const router = Router();

// GET /api/products — return all products
router.get('/', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  res.json(products);
});

// GET /api/products/:id — single product
router.get('/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

export default router;
