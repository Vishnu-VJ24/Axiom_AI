// frontend/src/components/QaPanel.jsx
// The QA Agent panel: plain-English test generation → Playwright execution → summary.
// Demonstrates: manual testing → scripted automation → prompt-driven test generation.

import React, { useState, useEffect } from 'react';
import { api } from '../hooks/useApi.js';

const EXAMPLE_INSTRUCTIONS = [
  'Add 2 items to cart and verify the total updates',
  'Check that Alex Rivera has VIP badge',
  'Add a product and verify cart badge appears',
  'Switch between customers and verify cart changes',
];

export default function QaPanel({ onClose }) {
  const [instruction, setInstruction] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showCode, setShowCode] = useState(false);

  // Load history on mount
  useEffect(() => {
    api.get('/qa/history?limit=5')
      .then(setHistory)
      .catch(() => {});
  }, []);

  async function runTest() {
    if (!instruction.trim() || isRunning) return;
    setIsRunning(true);
    setLastResult(null);
    try {
      const result = await api.post('/qa/run', { instruction });
      setLastResult(result);
      // Refresh history
      const newHistory = await api.get('/qa/history?limit=5');
      setHistory(newHistory);
    } catch (err) {
      setLastResult({ status: 'error', summary: `Failed: ${err.message}` });
    } finally {
      setIsRunning(false);
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      runTest();
    }
  }

  const statusClass = {
    pass: 'qa-result-pass',
    fail: 'qa-result-fail',
    error: 'qa-result-error',
  };

  const statusIcon = { pass: '✅', fail: '❌', error: '⚠️' };
  const statusLabel = { pass: 'PASSED', fail: 'FAILED', error: 'ERROR' };

  return (
    <div className="qa-panel" role="dialog" aria-label="QA Agent Panel">
      {/* Panel Header */}
      <div className="qa-panel-header">
        <div>
          <div className="qa-panel-title">
            <span style={{ fontSize: '1.1rem' }}>⚡</span>
            QA Agent
            <span className="ai-indicator">
              <span className="ai-dot" />
              Claude-powered
            </span>
          </div>
          <div className="qa-panel-subtitle">
            Type what you want tested — Claude writes the Playwright code and runs it live.
          </div>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close QA panel">
          ✕
        </button>
      </div>

      {/* Panel Body */}
      <div className="qa-panel-body">
        {/* Instruction Input */}
        <div className="qa-instruction-wrap">
          <label className="qa-instruction-label" htmlFor="qa-instruction">
            Test Instruction
          </label>
          <textarea
            id="qa-instruction"
            className="qa-instruction-input"
            data-testid="qa-instruction-input"
            placeholder="e.g. &quot;Add 3 items to cart and verify the total updates correctly&quot;"
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
          />
        </div>

        {/* Example chips */}
        <div className="qa-examples">
          {EXAMPLE_INSTRUCTIONS.map(ex => (
            <button
              key={ex}
              className="qa-example-chip"
              onClick={() => setInstruction(ex)}
              disabled={isRunning}
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Run button */}
        <button
          className="btn btn-primary"
          data-testid="qa-submit-btn"
          onClick={runTest}
          disabled={isRunning || !instruction.trim()}
          style={{ width: '100%' }}
        >
          {isRunning ? '⏳ Generating & Running...' : '▶ Generate & Run Test'}
        </button>

        {/* Running indicator */}
        {isRunning && (
          <div className="qa-running-indicator">
            <div className="spinner" />
            <span>
              Claude is generating a Playwright test and executing it live. This takes ~15–30 seconds…
            </span>
          </div>
        )}

        {/* Latest result */}
        {lastResult && !isRunning && (
          <div className="qa-result" data-testid="qa-results">
            <div className={`qa-result-header ${statusClass[lastResult.status]}`}>
              <span>{statusIcon[lastResult.status]} Test {statusLabel[lastResult.status]}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCode(v => !v)}
                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
              >
                {showCode ? 'Hide Code' : 'View Generated Code'}
              </button>
            </div>
            <div className="qa-result-body">
              <p>{lastResult.summary}</p>
              {showCode && lastResult.generatedCode && (
                <div className="qa-code-block">{lastResult.generatedCode}</div>
              )}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="qa-history">
            <div className="qa-history-title">Recent Runs</div>
            {history.map(run => (
              <div key={run.id} className="qa-history-item">
                <span className={`qa-history-status status-${run.status}`}>
                  {run.status.toUpperCase()}
                </span>
                <div>
                  <div className="qa-history-instruction">{run.instruction}</div>
                  <div className="qa-history-time">
                    {new Date(run.run_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
