// frontend/src/components/CartSidebar.jsx
// Slide-in cart panel showing items, quantities, AI cart badges, total, and checkout.

import React from 'react';
import BadgePill from './BadgePill.jsx';
import { api } from '../hooks/useApi.js';

export default function CartSidebar({ customerId, cart, cartBadges, onClose, onCartChange }) {
  const { items = [], total = 0 } = cart || {};

  async function updateQty(productId, delta) {
    const item = items.find(i => i.product_id === productId);
    if (!item) return;
    const newQty = item.quantity + delta;
    try {
      await api.patch(`/cart/${customerId}/items/${productId}`, { quantity: newQty });
      onCartChange();
    } catch (err) {
      console.error('Failed to update qty:', err);
    }
  }

  async function removeItem(productId) {
    try {
      await api.delete(`/cart/${customerId}/items/${productId}`);
      onCartChange();
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  }

  async function checkout() {
    try {
      await api.post(`/cart/${customerId}/checkout`, {});
      onCartChange();
      onClose();
    } catch (err) {
      console.error('Checkout error:', err);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="cart-overlay" onClick={onClose} />

      {/* Sidebar */}
      <div className="cart-sidebar" data-testid="cart-sidebar">
        {/* Header */}
        <div className="cart-header">
          <div className="cart-title">
            🛒 Cart
            {items.length > 0 && (
              <span className="cart-badge-count">{items.length}</span>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close cart">
            ✕
          </button>
        </div>

        {/* Items or empty state */}
        {items.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <div className="cart-empty-text">Your cart is empty.<br />Add some products to get started.</div>
          </div>
        ) : (
          <div className="cart-items-list">
            {items.map(item => (
              <div
                key={item.product_id}
                className="cart-item"
                data-testid={`cart-item-${item.product_id}`}
              >
                <div className="cart-item-emoji">{item.image_placeholder}</div>
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-price">
                    ${item.price.toFixed(2)} × {item.quantity} = ${item.line_total.toFixed(2)}
                  </div>
                </div>
                <div className="cart-item-controls">
                  <button
                    className="qty-btn"
                    data-testid={`cart-qty-decrease-${item.product_id}`}
                    onClick={() => updateQty(item.product_id, -1)}
                    aria-label="Decrease quantity"
                  >−</button>
                  <span
                    className="qty-display"
                    data-testid={`cart-qty-${item.product_id}`}
                  >
                    {item.quantity}
                  </span>
                  <button
                    className="qty-btn"
                    data-testid={`cart-qty-increase-${item.product_id}`}
                    onClick={() => updateQty(item.product_id, 1)}
                    aria-label="Increase quantity"
                  >+</button>
                  <button
                    className="btn btn-danger btn-icon btn-sm"
                    data-testid={`cart-remove-${item.product_id}`}
                    onClick={() => removeItem(item.product_id)}
                    aria-label="Remove item"
                    title="Remove"
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: badges + total + checkout */}
        {items.length > 0 && (
          <div className="cart-footer">
            {/* Cart AI Badges */}
            {cartBadges.length > 0 && (
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  🤖 AI Cart Badges
                </div>
                <div className="cart-badges-section" data-testid="badge-cart">
                  {cartBadges.map(badge => (
                    <BadgePill key={badge.id || badge.badge_name} badge={badge} />
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="cart-total-row">
              <span className="cart-total-label">Order Total</span>
              <span className="cart-total-value" data-testid="cart-total">
                ${total.toFixed(2)}
              </span>
            </div>

            {/* Checkout */}
            <button
              className="btn btn-primary"
              data-testid="checkout-btn"
              onClick={checkout}
              style={{ width: '100%' }}
            >
              ✓ Place Order
            </button>
          </div>
        )}
      </div>
    </>
  );
}
