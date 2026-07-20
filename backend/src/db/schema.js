// backend/src/db/schema.js
// Initializes the SQLite database schema using Node.js built-in 'node:sqlite' module.
// Available in Node.js 22.5+ — no native compilation, no extra dependencies.
// API is nearly identical to better-sqlite3 (synchronous, prepare/run/get/all).

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../sentinel.db');

let db;

export function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);

    // WAL mode for safe concurrent reads; foreign keys enforced
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    -- Customers: seeded fake users, no auth needed for demo
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Products: the store catalog
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      image_placeholder TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Orders: completed purchases per customer
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      total REAL NOT NULL,
      item_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Order items: line items for each order
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      price_at_purchase REAL NOT NULL
    );

    -- Cart items: current active cart per customer (one cart per customer)
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(customer_id, product_id)
    );

    -- Badges: AI-assigned behavioral labels for carts, products, or customers
    -- entity_type: 'cart' | 'product' | 'customer'
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('cart', 'product', 'customer')),
      entity_id INTEGER NOT NULL,
      badge_name TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_id, badge_name) ON CONFLICT REPLACE
    );

    -- QA test runs: history of AI-generated test executions
    CREATE TABLE IF NOT EXISTS qa_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instruction TEXT NOT NULL,
      generated_file TEXT NOT NULL,
      generated_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'pass', 'fail', 'error')),
      raw_output TEXT,
      summary TEXT,
      run_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export default getDb;
