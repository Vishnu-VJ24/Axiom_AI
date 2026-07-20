// frontend/src/App.jsx
// Root application component. Orchestrates:
//   - Customer selection (context for cart + badges)
//   - Product grid with AI product badges
//   - Cart sidebar with cart AI badges
//   - Badge polling (every 4 seconds — simple, no websockets needed for demo)
//   - QA Agent floating panel

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ProductCard from './components/ProductCard.jsx';
import CartSidebar from './components/CartSidebar.jsx';
import BadgePill from './components/BadgePill.jsx';
import QaPanel from './components/QaPanel.jsx';
import { api } from './hooks/useApi.js';

const BADGE_POLL_INTERVAL = 4000; // ms — poll for badge updates

export default function App() {
  // ── State ──────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({ items: [], total: 0 });

  // Badge state (refreshed by polling)
  const [badges, setBadges] = useState({ customer: [], cart: [], products: {} });

  const [cartOpen, setCartOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  const pollRef = useRef(null);

  // ── Data Loading ───────────────────────────────────────

  // Load products once on mount
  useEffect(() => {
    api.get('/products')
      .then(setProducts)
      .catch(err => console.error('Failed to load products:', err));
  }, []);

  // Load customers once on mount and auto-select the first
  useEffect(() => {
    api.get('/customers').then(data => {
      setCustomers(data);
      if (data.length > 0) {
        setSelectedCustomerId(data[0].id);
      }
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load customers:', err);
      setLoading(false);
    });
  }, []);

  // When customer changes: load their cart + customer details
  useEffect(() => {
    if (!selectedCustomerId) return;

    const customer = customers.find(c => c.id === selectedCustomerId);
    setSelectedCustomer(customer || null);

    refreshCart();
    refreshBadges();
  }, [selectedCustomerId, customers]);

  // ── Badge Polling ──────────────────────────────────────
  // Polls the /api/badges/bulk endpoint every BADGE_POLL_INTERVAL ms.
  // This keeps badges live after cart mutations trigger Claude evaluation on the backend.

  const refreshBadges = useCallback(async () => {
    if (!selectedCustomerId) return;
    try {
      const data = await api.get(`/badges/bulk?customer_id=${selectedCustomerId}`);
      setBadges(data);
    } catch (err) {
      // Silently fail on poll errors — don't toast on every poll cycle
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) return;

    // Clear existing poll
    if (pollRef.current) clearInterval(pollRef.current);

    // Start polling
    pollRef.current = setInterval(refreshBadges, BADGE_POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedCustomerId, refreshBadges]);

  // ── Cart Operations ────────────────────────────────────

  const refreshCart = useCallback(async () => {
    if (!selectedCustomerId) return;
    try {
      const data = await api.get(`/cart/${selectedCustomerId}`);
      setCart(data);
    } catch (err) {
      console.error('Failed to refresh cart:', err);
    }
  }, [selectedCustomerId]);

  async function addToCart(product) {
    if (!selectedCustomerId) return;
    try {
      const newCart = await api.post(`/cart/${selectedCustomerId}/items`, {
        product_id: product.id,
        quantity: 1,
      });
      setCart(newCart);
      showToast(`Added ${product.name.split(' ').slice(0, 3).join(' ')}… to cart 🛒`);
      // Trigger a badge refresh slightly after (badge eval is async on backend)
      setTimeout(refreshBadges, 3000);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  async function handleCartChange() {
    await refreshCart();
    setTimeout(refreshBadges, 3000);
  }

  // ── Toast Notifications ────────────────────────────────

  function showToast(message, type = 'info') {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  // ── Computed ───────────────────────────────────────────

  const cartItemIds = new Set(cart.items.map(i => i.product_id));
  const cartItemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  // ── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading Axiom…</div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">🛡️</div>
          <span className="header-brand-name">Axiom</span>
          <span className="header-brand-tag">AI-Powered Store</span>
        </div>

        <div className="header-actions">
          {/* Customer selector */}
          <div className="customer-selector-wrap">
            <select
              className="customer-selector"
              data-testid="customer-selector"
              value={selectedCustomerId || ''}
              onChange={e => setSelectedCustomerId(Number(e.target.value))}
              aria-label="Select customer"
            >
              {customers.map(c => (
                <option
                  key={c.id}
                  value={c.id}
                  data-testid={`customer-option-${c.id}`}
                >
                  {c.name}
                </option>
              ))}
            </select>
            <span className="customer-selector-arrow">▾</span>
          </div>

          {/* Cart toggle */}
          <button
            className="cart-toggle-btn"
            data-testid="cart-toggle"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
          >
            🛒
            {cartItemCount > 0 && (
              <span className="cart-badge-count">{cartItemCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────── */}
      <main className="main-content">
        {/* Customer Info Bar */}
        {selectedCustomer && (
          <div className="customer-bar">
            <div
              className="customer-avatar"
              style={{ background: selectedCustomer.avatar_color }}
            >
              {selectedCustomer.name.charAt(0)}
            </div>
            <div className="customer-info">
              <div className="customer-name" data-testid="customer-name">
                {selectedCustomer.name}
              </div>
              <div className="customer-stats">
                {selectedCustomer.order_count} order{selectedCustomer.order_count !== 1 ? 's' : ''} · 
                ${parseFloat(selectedCustomer.lifetime_total || 0).toFixed(2)} lifetime value
              </div>
            </div>

            {/* Customer AI Badges */}
            {badges.customer.length > 0 && (
              <div className="customer-badges-row" data-testid="badge-customer">
                <span className="ai-indicator" style={{ marginRight: 4 }}>
                  <span className="ai-dot" />
                  AI Badges
                </span>
                {badges.customer.map(badge => (
                  <BadgePill key={badge.id || badge.badge_name} badge={badge} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Products Grid */}
        <div className="section-header">
          <h1 className="section-title">
            📦 Products
            <span className="section-count">{products.length} items</span>
          </h1>
          <span className="ai-indicator">
            <span className="ai-dot" />
            Badges update live via Claude
          </span>
        </div>

        <div className="products-grid">
          {products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              badges={badges.products[product.id] || []}
              onAddToCart={addToCart}
              inCart={cartItemIds.has(product.id)}
            />
          ))}
        </div>
      </main>

      {/* ── Cart Sidebar ───────────────────────────────── */}
      {cartOpen && (
        <CartSidebar
          customerId={selectedCustomerId}
          cart={cart}
          cartBadges={badges.cart}
          onClose={() => setCartOpen(false)}
          onCartChange={handleCartChange}
        />
      )}

      {/* ── QA Agent FAB + Panel ───────────────────────── */}
      {qaOpen && (
        <QaPanel onClose={() => setQaOpen(false)} />
      )}
      <button
        className="qa-fab"
        onClick={() => setQaOpen(v => !v)}
        aria-label="Open QA Agent"
        title="Open QA Agent — prompt-driven test generation"
      >
        {qaOpen ? '✕ Close QA Agent' : '⚡ QA Agent'}
      </button>

      {/* ── Toasts ─────────────────────────────────────── */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className="toast">
            <span>{toast.type === 'error' ? '❌' : '✅'}</span>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
