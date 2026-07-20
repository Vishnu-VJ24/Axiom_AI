// frontend/src/components/ProductCard.jsx
// Displays a product with its price, details, badges, and add-to-cart button.

import React from 'react';
import BadgePill from './BadgePill.jsx';

export default function ProductCard({ product, badges = [], onAddToCart, inCart }) {
  return (
    <div
      className="product-card"
      data-testid={`product-card-${product.id}`}
    >
      {/* Product image area (emoji placeholder) */}
      <div className="product-image">
        <span style={{ zIndex: 1, position: 'relative' }}>
          {product.image_placeholder}
        </span>
      </div>

      {/* Product details */}
      <div className="product-body">
        <div className="product-category">{product.category}</div>
        <div className="product-name">{product.name}</div>
        <div className="product-description">{product.description}</div>
      </div>

      {/* AI Badges for this product */}
      {badges.length > 0 && (
        <div className="product-badges" data-testid={`badge-product-${product.id}`}>
          {badges.map(badge => (
            <BadgePill key={badge.id || badge.badge_name} badge={badge} />
          ))}
        </div>
      )}

      {/* Price + Add to Cart */}
      <div className="product-footer">
        <span className="product-price">${product.price.toFixed(2)}</span>
        <button
          className={`btn btn-sm ${inCart ? 'btn-secondary' : 'btn-primary'}`}
          data-testid={`add-to-cart-${product.id}`}
          onClick={() => onAddToCart(product)}
          title={inCart ? 'Already in cart — click to add another' : 'Add to cart'}
        >
          {inCart ? '+ Add Again' : '+ Add to Cart'}
        </button>
      </div>
    </div>
  );
}
