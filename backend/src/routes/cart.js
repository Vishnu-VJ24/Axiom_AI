// backend/src/routes/cart.js
// Cart routes: manage cart items and trigger badge evaluation on mutations.

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { evaluateBadges } from '../agents/badge-agent.js';

const router = Router();

// GET /api/cart/:customerId — get cart for a customer with product details
router.get('/:customerId', (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT ci.id, ci.quantity, ci.added_at,
           p.id as product_id, p.name, p.price, p.category, p.image_placeholder,
           (ci.quantity * p.price) as line_total
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.customer_id = ?
    ORDER BY ci.added_at DESC
  `).all(req.params.customerId);

  const total = items.reduce((sum, i) => sum + i.line_total, 0);
  res.json({ items, total: parseFloat(total.toFixed(2)) });
});

// POST /api/cart/:customerId/items — add or increment a product in the cart
router.post('/:customerId/items', async (req, res) => {
  const db = getDb();
  const { product_id, quantity = 1 } = req.body;
  const customerId = parseInt(req.params.customerId);

  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  const existing = db.prepare(
    'SELECT * FROM cart_items WHERE customer_id = ? AND product_id = ?'
  ).get(customerId, product_id);

  if (existing) {
    db.prepare(
      'UPDATE cart_items SET quantity = quantity + ? WHERE customer_id = ? AND product_id = ?'
    ).run(quantity, customerId, product_id);
  } else {
    db.prepare(
      'INSERT INTO cart_items (customer_id, product_id, quantity) VALUES (?, ?, ?)'
    ).run(customerId, product_id, quantity);
  }

  // Trigger badge evaluation asynchronously — don't block the cart response
  evaluateBadges('cart', customerId).catch(console.error);
  evaluateBadges('product', product_id).catch(console.error);

  const cart = getCartData(db, customerId);
  res.json(cart);
});

// PATCH /api/cart/:customerId/items/:productId — update quantity
router.patch('/:customerId/items/:productId', async (req, res) => {
  const db = getDb();
  const { quantity } = req.body;
  const customerId = parseInt(req.params.customerId);
  const productId = parseInt(req.params.productId);

  if (quantity < 1) {
    // Remove item if quantity drops to 0
    db.prepare(
      'DELETE FROM cart_items WHERE customer_id = ? AND product_id = ?'
    ).run(customerId, productId);
  } else {
    db.prepare(
      'UPDATE cart_items SET quantity = ? WHERE customer_id = ? AND product_id = ?'
    ).run(quantity, customerId, productId);
  }

  evaluateBadges('cart', customerId).catch(console.error);

  const cart = getCartData(db, customerId);
  res.json(cart);
});

// DELETE /api/cart/:customerId/items/:productId — remove item
router.delete('/:customerId/items/:productId', async (req, res) => {
  const db = getDb();
  const customerId = parseInt(req.params.customerId);
  const productId = parseInt(req.params.productId);

  db.prepare(
    'DELETE FROM cart_items WHERE customer_id = ? AND product_id = ?'
  ).run(customerId, productId);

  evaluateBadges('cart', customerId).catch(console.error);

  const cart = getCartData(db, customerId);
  res.json(cart);
});

// POST /api/cart/:customerId/checkout — place order from current cart
router.post('/:customerId/checkout', async (req, res) => {
  const db = getDb();
  const customerId = parseInt(req.params.customerId);

  const cartItems = db.prepare(`
    SELECT ci.quantity, p.id as product_id, p.price
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.customer_id = ?
  `).all(customerId);

  if (cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const total = cartItems.reduce((sum, i) => sum + i.quantity * i.price, 0);
  const order = db.prepare(
    'INSERT INTO orders (customer_id, total, item_count) VALUES (?, ?, ?)'
  ).run(customerId, total, cartItems.length);

  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)'
  );
  for (const item of cartItems) {
    insertItem.run(order.lastInsertRowid, item.product_id, item.quantity, item.price);
  }

  // Clear cart after checkout
  db.prepare('DELETE FROM cart_items WHERE customer_id = ?').run(customerId);

  // Re-evaluate customer badges (order count may trigger VIP/Big Spender)
  evaluateBadges('customer', customerId).catch(console.error);

  res.json({ success: true, orderId: order.lastInsertRowid, total });
});

function getCartData(db, customerId) {
  const items = db.prepare(`
    SELECT ci.quantity, p.id as product_id, p.name, p.price, p.category, p.image_placeholder,
           (ci.quantity * p.price) as line_total
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.customer_id = ?
    ORDER BY ci.added_at DESC
  `).all(customerId);
  const total = items.reduce((sum, i) => sum + i.line_total, 0);
  return { items, total: parseFloat(total.toFixed(2)) };
}

export default router;
