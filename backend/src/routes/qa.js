// backend/src/routes/qa.js
// QA Agent routes — test generation and execution history

import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { runQaAgent } from '../agents/qa-agent.js';

const router = Router();

// POST /api/qa/run — generate and execute a test from plain-English instruction
router.post('/run', async (req, res) => {
  const { instruction } = req.body;
  if (!instruction || instruction.trim().length < 5) {
    return res.status(400).json({ error: 'A test instruction is required (min 5 chars)' });
  }

  try {
    // This can take 20-45 seconds (generation + execution)
    const result = await runQaAgent(instruction.trim());
    res.json(result);
  } catch (err) {
    console.error('[qa route] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qa/history — last N test runs
router.get('/history', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  const runs = db.prepare(`
    SELECT id, instruction, generated_file, status, summary, run_at,
           LENGTH(generated_code) as code_length
    FROM qa_runs
    ORDER BY run_at DESC
    LIMIT ?
  `).all(limit);
  res.json(runs);
});

// GET /api/qa/runs/:id — full details of a test run (includes generated code)
router.get('/runs/:id', (req, res) => {
  const db = getDb();
  const run = db.prepare('SELECT * FROM qa_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

export default router;
