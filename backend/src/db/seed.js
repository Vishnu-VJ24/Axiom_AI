// backend/src/db/seed.js
// Seeds the database with realistic demo data so badge triggers fire on first load.
// Run with: node src/db/seed.js (or automatically on first startup)

import path from 'path';
import { getDb } from './schema.js';

const PRODUCTS = [
  { name: 'Wireless Noise-Canceling Headphones', price: 89.99, category: 'Electronics', description: 'Premium sound, 30h battery, foldable design.', image_placeholder: '🎧' },
  { name: 'Ergonomic Office Chair', price: 249.99, category: 'Furniture', description: 'Lumbar support, adjustable armrests, breathable mesh.', image_placeholder: '🪑' },
  { name: 'Stainless Steel Water Bottle', price: 24.99, category: 'Kitchen', description: 'Keeps drinks cold 24h, hot 12h. 32oz.', image_placeholder: '🫙' },
  { name: 'Mechanical Keyboard', price: 129.99, category: 'Electronics', description: 'TKL layout, Cherry MX Blue switches, RGB backlit.', image_placeholder: '⌨️' },
  { name: 'Yoga Mat Pro', price: 39.99, category: 'Fitness', description: 'Non-slip, 6mm thick, carry strap included.', image_placeholder: '🧘' },
  { name: 'Portable Bluetooth Speaker', price: 59.99, category: 'Electronics', description: 'IP67 waterproof, 20h battery, 360° sound.', image_placeholder: '🔊' },
  { name: 'Smart LED Desk Lamp', price: 44.99, category: 'Home', description: 'Touch control, USB charging, 5 color temps.', image_placeholder: '💡' },
  { name: 'Vitamin D3 + K2 Supplement', price: 18.99, category: 'Health', description: 'High potency 5000 IU D3 with MK-7 K2. 90 caps.', image_placeholder: '💊' },
  { name: 'Insulated Lunch Box', price: 29.99, category: 'Kitchen', description: 'Leakproof, keeps food warm 5h. 1.5L capacity.', image_placeholder: '🧺' },
  { name: '4K Webcam', price: 109.99, category: 'Electronics', description: 'Ultra-HD, autofocus, built-in ring light, plug-and-play.', image_placeholder: '📷' },
];

const CUSTOMERS = [
  { name: 'Vishnu Jayanth', email: 'vishnu@demo.axiom', avatar_color: '#6366f1' },
  { name: 'Jamie Chen', email: 'jamie@demo.axiom', avatar_color: '#ec4899' },
  { name: 'Morgan Patel', email: 'morgan@demo.axiom', avatar_color: '#10b981' },
  { name: 'Taylor Kim', email: 'taylor@demo.axiom', avatar_color: '#f59e0b' },
];

export function seed() {
  const db = getDb();

  // Only seed if the tables are empty
  const existingProducts = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (existingProducts.count > 0) {
    console.log('[seed] Database already seeded, skipping.');
    return;
  }

  console.log('[seed] Seeding database...');

  // Insert products
  const insertProduct = db.prepare(
    'INSERT INTO products (name, price, category, description, image_placeholder) VALUES (?, ?, ?, ?, ?)'
  );
  for (const p of PRODUCTS) {
    insertProduct.run(p.name, p.price, p.category, p.description, p.image_placeholder);
  }

  // Insert customers
  const insertCustomer = db.prepare(
    'INSERT INTO customers (name, email, avatar_color) VALUES (?, ?, ?)'
  );
  for (const c of CUSTOMERS) {
    insertCustomer.run(c.name, c.email, c.avatar_color);
  }

  // Seed order history so VIP badges trigger on load
  // Alex has 4 orders (VIP: 3+ orders)
  // Jamie has 2 orders (approaching VIP)
  // Morgan has 1 order
  const insertOrder = db.prepare(
    'INSERT INTO orders (customer_id, total, item_count, created_at) VALUES (?, ?, ?, ?)'
  );
  const insertOrderItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)'
  );

  const alexOrders = [
    { total: 129.99, items: [{ pid: 1, qty: 1, price: 89.99 }, { pid: 3, qty: 1, price: 24.99 }, { pid: 8, qty: 1, price: 18.99 }], date: '2024-11-15 10:00:00' },
    { total: 249.99, items: [{ pid: 2, qty: 1, price: 249.99 }], date: '2024-12-02 14:30:00' },
    { total: 184.98, items: [{ pid: 4, qty: 1, price: 129.99 }, { pid: 7, qty: 1, price: 44.99 }], date: '2025-01-10 09:15:00' },
    { total: 59.99, items: [{ pid: 6, qty: 1, price: 59.99 }], date: '2025-02-20 16:45:00' },
  ];

  for (const o of alexOrders) {
    const result = insertOrder.run(1, o.total, o.items.length, o.date);
    for (const item of o.items) {
      insertOrderItem.run(result.lastInsertRowid, item.pid, item.qty, item.price);
    }
  }

  const jamieOrders = [
    { total: 39.99, items: [{ pid: 5, qty: 1, price: 39.99 }], date: '2025-01-05 11:00:00' },
    { total: 134.98, items: [{ pid: 4, qty: 1, price: 129.99 }, { pid: 3, qty: 1, price: 24.99 }], date: '2025-03-18 13:20:00' },
  ];

  for (const o of jamieOrders) {
    const result = insertOrder.run(2, o.total, o.items.length, o.date);
    for (const item of o.items) {
      insertOrderItem.run(result.lastInsertRowid, item.pid, item.qty, item.price);
    }
  }

  const morganOrders = [
    { total: 44.99, items: [{ pid: 7, qty: 1, price: 44.99 }], date: '2025-04-01 08:30:00' },
  ];
  for (const o of morganOrders) {
    const result = insertOrder.run(3, o.total, o.items.length, o.date);
    for (const item of o.items) {
      insertOrderItem.run(result.lastInsertRowid, item.pid, item.qty, item.price);
    }
  }

  // Seed a pre-loaded cart for Alex — high-value cart ($250+) to trigger "High Value Cart" badge on load
  const insertCartItem = db.prepare(
    'INSERT OR IGNORE INTO cart_items (customer_id, product_id, quantity) VALUES (?, ?, ?)'
  );
  // Alex's pre-seeded cart: Ergonomic Chair ($249.99) + Keyboard ($129.99) = $379.98 → triggers High Value Cart
  insertCartItem.run(1, 2, 1); // Ergonomic Office Chair
  insertCartItem.run(1, 4, 1); // Mechanical Keyboard

  // Seed a cart for Jamie: headphones + speaker = $149.98
  insertCartItem.run(2, 1, 1); // Wireless Headphones
  insertCartItem.run(2, 6, 1); // Portable Bluetooth Speaker

  console.log('[seed] ✅ Database seeded successfully.');
  console.log('[seed]   - 10 products');
  console.log('[seed]   - 4 customers');
  console.log('[seed]   - 7 historical orders (Alex: 4, Jamie: 2, Morgan: 1)');
  console.log('[seed]   - 2 pre-loaded carts (Alex: high-value, Jamie: moderate)');
}

// Allow running directly: node src/db/seed.js
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  seed();
}
