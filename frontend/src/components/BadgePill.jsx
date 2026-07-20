// frontend/src/components/BadgePill.jsx
// Renders a single AI-assigned badge as a colored pill with tooltip reasoning.

import React, { useState } from 'react';

export default function BadgePill({ badge, isNew = false }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const style = {
    backgroundColor: `${badge.color}22`,
    borderColor: `${badge.color}55`,
    color: badge.color,
  };

  const dotStyle = { backgroundColor: badge.color };

  return (
    <span
      className={`badge-pill ${isNew ? 'new-badge' : ''}`}
      style={style}
      data-testid={`badge-pill-${badge.badge_name.replace(/\s+/g, '-').toLowerCase()}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={badge.reasoning}
    >
      <span className="badge-dot" style={dotStyle} />
      {badge.badge_name}
      {showTooltip && (
        <span style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e1e24',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '0.72rem',
          color: '#a1a1aa',
          whiteSpace: 'normal',
          width: '200px',
          lineHeight: '1.5',
          zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#8b5cf6', fontWeight: 600, display: 'block', marginBottom: 3 }}>
            🤖 AI Reasoning
          </span>
          {badge.reasoning}
        </span>
      )}
    </span>
  );
}
