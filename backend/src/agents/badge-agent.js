// backend/src/agents/badge-agent.js
// The Badge Agent: evaluates carts, products, and customers using Claude
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
//     - "Bundle Favorite"    → frequently appears alongside another product
//
//   CUSTOMER BADGES
//     - "VIP"                → 3+ completed orders
//     - "Big Spender"        → lifetime order total > $300
//     - "New Arrival"        → joined < 30 days ago
//     - "Loyal Explorer"     → purchased from 4+ different categories

import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/schema.js';

// Initialize Anthropic client — API key comes from .env via process.env
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Badge color map for consistent UI rendering
const BADGE_COLORS = {
  'High Value Cart': '#f59e0b',
  'Bulk Buyer': '#8b5cf6',
  'Cross-Category': '#06b6d4',
  'Deal Seeker': '#10b981',
  'Trending': '#ef4444',
  'Best Seller': '#f97316',
  'Hidden Gem': '#6366f1',
  'Bundle Favorite': '#ec4899',
  'VIP': '#eab308',
  'Big Spender': '#dc2626',
  'New Arrival': '#22c55e',
  'Loyal Explorer': '#14b8a6',
};

const DEFAULT_COLOR = '#6b7280';

/**
 * Evaluates badges for a given entity.
 * @param {string} entityType - 'cart' | 'product' | 'customer'
 * @param {number} entityId - The ID of the entity (customer_id for carts, product_id, or customer_id)
 */
export async function evaluateBadges(entityType, entityId) {
  const db = getDb();
  let context;

  // ── Build context payload for Claude ──────────────────────────────────────

  if (entityType === 'cart') {
    // Cart context: items, total, categories
    const cartItems = db.prepare(`
      SELECT ci.quantity, p.name, p.price, p.category,
             (ci.quantity * p.price) AS line_total
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.customer_id = ?
    `).all(entityId);

    if (cartItems.length === 0) {
      // Empty cart — clear existing badges and return
      db.prepare("DELETE FROM badges WHERE entity_type = 'cart' AND entity_id = ?").run(entityId);
      return [];
    }

    const total = cartItems.reduce((sum, item) => sum + item.line_total, 0);
    const categories = [...new Set(cartItems.map(i => i.category))];

    // Count how many other customers have each product in their cart (for "trending" signal in cart context)
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

    // How many carts contain this product?
    const cartFrequency = db.prepare(
      "SELECT COUNT(DISTINCT customer_id) as count FROM cart_items WHERE product_id = ?"
    ).get(entityId).count;

    // How many completed orders contain this product?
    const orderFrequency = db.prepare(
      "SELECT COUNT(DISTINCT order_id) as count FROM order_items WHERE product_id = ?"
    ).get(entityId).count;

    context = {
      entityType: 'product',
      product: { name: product.name, price: product.price, category: product.category },
      cartFrequency,   // number of customer carts containing this product
      orderFrequency,  // number of completed orders containing this product
    };

  } else if (entityType === 'customer') {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(entityId);
    if (!customer) return [];

    const orders = db.prepare(
      'SELECT id, total, item_count, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC'
    ).all(entityId);

    const lifetimeTotal = orders.reduce((sum, o) => sum + o.total, 0);

    // Categories purchased across all orders
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

  // ── Call Claude with the badge taxonomy and entity context ────────────────

  const systemPrompt = `You are the Sentinel Badge Agent for an e-commerce platform. 
Your job is to analyze entity data and assign behavioral badges from the approved taxonomy.

BADGE TAXONOMY:

CART BADGES (use when entityType = "cart"):
- "High Value Cart": cart total > $100
- "Bulk Buyer": any single item with quantity >= 3
- "Cross-Category": items span 3 or more different categories
- "Deal Seeker": cart contains at least one item priced under $25

PRODUCT BADGES (use when entityType = "product"):
- "Trending": added to 5 or more different customer carts
- "Best Seller": appears in 5 or more completed orders
- "Hidden Gem": price >= $80 AND cartFrequency < 3
- "Bundle Favorite": orderFrequency >= 3 AND price < $50

CUSTOMER BADGES (use when entityType = "customer"):
- "VIP": 3 or more completed orders
- "Big Spender": lifetime order total > $300
- "New Arrival": joined less than 30 days ago
- "Loyal Explorer": purchased from 4 or more different categories

RULES:
- Only assign badges where the condition is clearly met by the data
- A single entity can receive multiple badges
- If no badges apply, return an empty array
- Be precise and honest — don't assign a badge speculatively

Respond ONLY with valid JSON in this exact format:
{
  "badges": [
    {
      "badge_name": "Name from taxonomy",
      "reasoning": "One sentence explaining exactly why this badge applies, citing specific numbers."
    }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Evaluate this entity and return applicable badges as JSON:\n\n${JSON.stringify(context, null, 2)}`,
        },
      ],
    });

    // Parse Claude's JSON response
    const rawText = response.content[0].text.trim();
    const parsed = JSON.parse(rawText);
    const badgeList = parsed.badges || [];

    // ── Persist badges to the database ─────────────────────────────────────

    // First, clear old badges for this entity (we'll replace with fresh evaluation)
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

    console.log(`[badge-agent] Evaluated ${entityType} #${entityId}: ${badgeList.length} badge(s) assigned`);
    return badgeList;

  } catch (err) {
    console.error(`[badge-agent] Error evaluating ${entityType} #${entityId}:`, err.message);
    return [];
  }
}

/**
 * Triggers badge evaluation for all entity types.
 * Called on startup to pre-populate badges for seeded data.
 */
export async function evaluateAllBadges() {
  const db = getDb();

  const customers = db.prepare('SELECT id FROM customers').all();
  const products = db.prepare('SELECT id FROM products').all();

  console.log('[badge-agent] Running initial full badge evaluation...');

  // Evaluate customer badges
  for (const c of customers) {
    await evaluateBadges('customer', c.id);
  }

  // Evaluate cart badges for customers with active carts
  for (const c of customers) {
    const hasItems = db.prepare(
      'SELECT COUNT(*) as count FROM cart_items WHERE customer_id = ?'
    ).get(c.id).count;
    if (hasItems > 0) {
      await evaluateBadges('cart', c.id);
    }
  }

  // Evaluate product badges
  for (const p of products) {
    await evaluateBadges('product', p.id);
  }

  console.log('[badge-agent] ✅ Initial badge evaluation complete.');
}
