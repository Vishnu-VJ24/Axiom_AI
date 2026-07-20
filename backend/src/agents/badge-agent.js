// backend/src/agents/badge-agent.js
// The Badge Agent: evaluates carts, products, and customers using Google Gemini
// and assigns structured behavioral badges with reasoning.
//
// Badge Taxonomy:
//   CART BADGES
//     - "High Value Cart"    → cart total > $100
//     - "Bulk Buyer"         → any single item with quantity >= 3
//     - "Cross-Category"     → items from 3+ different categories
//     - "Deal Seeker"        → cart contains items under $25
//
//   PRODUCT BADGES
//     - "Trending"           → added to 5+ different customer carts
//     - "Best Seller"        → appears in 5+ completed orders
//     - "Hidden Gem"         → high price ($80+), low cart frequency (< 3)
//     - "Bundle Favorite"    → frequently appears alongside other products
//
//   CUSTOMER BADGES
//     - "VIP"                → 3+ completed orders
//     - "Big Spender"        → lifetime order total > $300
//     - "New Arrival"        → joined < 30 days ago
//     - "Loyal Explorer"     → purchased from 4+ different categories

import OpenAI from 'openai';
import { getDb } from '../db/schema.js';

// Initialize OpenAI client pointing to Nvidia NIM
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// Badge color map for consistent UI rendering
const BADGE_COLORS = {
  'High Value Cart':  '#f59e0b',
  'Bulk Buyer':       '#8b5cf6',
  'Cross-Category':   '#06b6d4',
  'Deal Seeker':      '#10b981',
  'Trending':         '#ef4444',
  'Best Seller':      '#f97316',
  'Hidden Gem':       '#6366f1',
  'Bundle Favorite':  '#ec4899',
  'VIP':              '#eab308',
  'Big Spender':      '#dc2626',
  'New Arrival':      '#22c55e',
  'Loyal Explorer':   '#14b8a6',
};

const DEFAULT_COLOR = '#6b7280';

/**
 * Evaluates badges for a given entity.
 * @param {'cart'|'product'|'customer'} entityType
 * @param {number} entityId
 */
export async function evaluateBadges(entityType, entityId) {
  const db = getDb();
  let context;

  // ── Build context payload for Gemini ─────────────────────────────────────

  if (entityType === 'cart') {
    const cartItems = db.prepare(`
      SELECT ci.quantity, p.name, p.price, p.category,
             (ci.quantity * p.price) AS line_total
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.customer_id = ?
    `).all(entityId);

    if (cartItems.length === 0) {
      db.prepare("DELETE FROM badges WHERE entity_type = 'cart' AND entity_id = ?").run(entityId);
      return [];
    }

    const total = cartItems.reduce((sum, item) => sum + item.line_total, 0);
    const categories = [...new Set(cartItems.map(i => i.category))];

    context = {
      entityType: 'cart',
      cartTotal: total.toFixed(2),
      itemCount: cartItems.length,
      categories,
      items: cartItems.map(i => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        category: i.category,
      })),
    };

  } else if (entityType === 'product') {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(entityId);
    if (!product) return [];

    const cartFrequency = db.prepare(
      'SELECT COUNT(DISTINCT customer_id) as count FROM cart_items WHERE product_id = ?'
    ).get(entityId).count;

    const orderFrequency = db.prepare(
      'SELECT COUNT(DISTINCT order_id) as count FROM order_items WHERE product_id = ?'
    ).get(entityId).count;

    context = {
      entityType: 'product',
      product: { name: product.name, price: product.price, category: product.category },
      cartFrequency,
      orderFrequency,
    };

  } else if (entityType === 'customer') {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(entityId);
    if (!customer) return [];

    const orders = db.prepare(
      'SELECT id, total, item_count, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC'
    ).all(entityId);

    const lifetimeTotal = orders.reduce((sum, o) => sum + o.total, 0);

    const categoriesResult = db.prepare(`
      SELECT DISTINCT p.category
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.customer_id = ?
    `).all(entityId);

    const daysSinceJoined = Math.floor(
      (Date.now() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    context = {
      entityType: 'customer',
      customerName: customer.name,
      orderCount: orders.length,
      lifetimeTotal: lifetimeTotal.toFixed(2),
      categoriesPurchased: categoriesResult.map(r => r.category),
      daysSinceJoined,
    };
  }

  // ── Build the prompt ──────────────────────────────────────────────────────

  const prompt = `You are the Axiom Badge Agent for an e-commerce platform.
Analyze the entity data below and assign behavioral badges from the approved taxonomy.

BADGE TAXONOMY:

CART BADGES (entityType = "cart"):
- "High Value Cart": cart total > $100
- "Bulk Buyer": any single item with quantity >= 3
- "Cross-Category": items span 3 or more different categories
- "Deal Seeker": cart contains at least one item priced under $25

PRODUCT BADGES (entityType = "product"):
- "Trending": cartFrequency >= 5 (in 5+ customer carts)
- "Best Seller": orderFrequency >= 5 (in 5+ completed orders)
- "Hidden Gem": price >= $80 AND cartFrequency < 3
- "Bundle Favorite": orderFrequency >= 3 AND price < $50

CUSTOMER BADGES (entityType = "customer"):
- "VIP": orderCount >= 3
- "Big Spender": lifetimeTotal > $300
- "New Arrival": daysSinceJoined < 30
- "Loyal Explorer": categoriesPurchased has 4 or more distinct values

RULES:
- Only assign badges where the condition is clearly met by the data
- A single entity can receive multiple badges
- If no badges apply, return empty array
- Cite specific numbers in your reasoning

Entity data:
${JSON.stringify(context, null, 2)}

Respond ONLY with this JSON structure (no extra text):
{
  "badges": [
    {
      "badge_name": "Name from taxonomy",
      "reasoning": "One sentence citing specific numbers from the data."
    }
  ]
}`;

  // ── Call Gemini ───────────────────────────────────────────────────────────

  try {
    const response = await openai.chat.completions.create({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const rawText = response.choices[0].message.content.trim();
    const parsed = JSON.parse(rawText);
    const badgeList = parsed.badges || [];

    // ── Persist badges to the database ───────────────────────────────────

    db.prepare(
      'DELETE FROM badges WHERE entity_type = ? AND entity_id = ?'
    ).run(entityType, entityId);

    const insertBadge = db.prepare(`
      INSERT INTO badges (entity_type, entity_id, badge_name, reasoning, color)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const badge of badgeList) {
      const color = BADGE_COLORS[badge.badge_name] || DEFAULT_COLOR;
      insertBadge.run(entityType, entityId, badge.badge_name, badge.reasoning, color);
    }

    console.log(`[badge-agent] ${entityType} #${entityId}: ${badgeList.length} badge(s) assigned`);
    return badgeList;

  } catch (err) {
    console.error(`[badge-agent] Error evaluating ${entityType} #${entityId}:`, err.message);
    return [];
  }
}

/**
 * Runs badge evaluation for all entities on startup.
 * Uses 4-second delays between calls to stay within Gemini free-tier rate limits.
 */
export async function evaluateAllBadges() {
  const db = getDb();
  const customers = db.prepare('SELECT id FROM customers').all();
  const products = db.prepare('SELECT id FROM products').all();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  console.log('[badge-agent] Running initial full badge evaluation (staggered for rate limits)...');

  for (const c of customers) {
    await evaluateBadges('customer', c.id);
    await sleep(4000); // 4s gap = safe under 15 RPM free tier
  }

  for (const c of customers) {
    const hasItems = db.prepare(
      'SELECT COUNT(*) as count FROM cart_items WHERE customer_id = ?'
    ).get(c.id).count;
    if (hasItems > 0) {
      await evaluateBadges('cart', c.id);
      await sleep(4000);
    }
  }

  for (const p of products) {
    await evaluateBadges('product', p.id);
    await sleep(4000);
  }

  console.log('[badge-agent] \u2705 Initial badge evaluation complete.');
}
