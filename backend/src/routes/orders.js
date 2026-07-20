// backend/src/routes/orders.js
import { Router } from 'express';
import { getDb } from '../db/schema.js';

const router = Router();

// GET /api/orders/:customerId — order history for a customer
router.get('/:customerId', (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT o.id, o.total, o.item_count, o.created_at,
           json_group_array(
             json_object(
               'product_id', oi.product_id,
               'name', p.name,
               'quantity', oi.quantity,
               'price', oi.price_at_purchase
             )
           ) as items
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    WHERE o.customer_id = ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all(req.params.customerId);

  // Parse the JSON items string from SQLite's json_group_array
  const parsed = orders.map(o => ({
    ...o,
    items: JSON.parse(o.items),
  }));

  res.json(parsed);
});

export default router;
