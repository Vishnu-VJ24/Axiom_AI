// backend/src/agents/qa-agent.js
// The QA Agent: takes a plain-English test instruction, generates a Playwright
// test file via Google Gemini, executes it, and returns pass/fail + a plain-English summary.
//
// This demonstrates: manual testing → scripted automation → prompt-driven test generation.

import { GoogleGenAI } from '@google/genai';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, '../../../..', 'tests', 'generated');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// App context: selectors, routes, and behaviors Claude/Gemini uses to write accurate tests.
// This acts as the "API documentation" for the QA agent.
const APP_CONTEXT = `
APPLICATION UNDER TEST: Axiom Demo E-Commerce Store

BASE URL: http://localhost:5173

KEY PAGES & ROUTES:
- Home / Product Listing: http://localhost:5173/
- Cart is a slide-in sidebar, not a separate page

KEY UI SELECTORS (always use data-testid where available):
- Customer selector dropdown: [data-testid="customer-selector"]
- Individual customer option: [data-testid="customer-option-{id}"] (ids: 1, 2, 3, 4)
- Product card: [data-testid="product-card-{id}"]
- Add to cart button: [data-testid="add-to-cart-{id}"]
- Cart sidebar toggle button: [data-testid="cart-toggle"]
- Cart sidebar panel: [data-testid="cart-sidebar"]
- Cart item row: [data-testid="cart-item-{productId}"]
- Cart item quantity display: [data-testid="cart-qty-{productId}"]
- Cart item increase quantity: [data-testid="cart-qty-increase-{productId}"]
- Cart item decrease quantity: [data-testid="cart-qty-decrease-{productId}"]
- Remove cart item button: [data-testid="cart-remove-{productId}"]
- Cart total display: [data-testid="cart-total"]
- Badge pill on product card: [data-testid="badge-product-{id}"]
- Badge pill on cart: [data-testid="badge-cart"]
- Badge pill on customer header: [data-testid="badge-customer"]
- Customer header name display: [data-testid="customer-name"]
- Checkout button: [data-testid="checkout-btn"]
- QA agent input: [data-testid="qa-instruction-input"]
- QA agent submit button: [data-testid="qa-submit-btn"]
- QA results panel: [data-testid="qa-results"]

NOTABLE BEHAVIORS:
- Selecting a customer loads their cart and badges
- Adding items triggers badge re-evaluation (badges update within ~5 seconds)
- Cart total updates immediately on add/remove

SAMPLE DATA:
- Customer 1 (Vishnu Jayanth): 4 past orders, pre-loaded high-value cart ($379.98) → VIP + Big Spender badges
  - Customer 2 (Jamie Chen): 2 past orders, moderate cart
  - Products 1-10 available; product #2 = Ergonomic Chair ($249.99), #4 = Keyboard ($129.99)
`;

/**
 * Generates a Playwright test from a plain-English instruction, runs it, and summarizes results.
 */
export async function runQaAgent(instruction) {
  const db = getDb();

  // ── Step 1: Generate Playwright test via Gemini ───────────────────────────

  const generationPrompt = `You are a senior QA engineer. Generate a complete, runnable Playwright test file.

INSTRUCTION: ${instruction}

${APP_CONTEXT}

REQUIREMENTS:
- Use TypeScript
- Import only from '@playwright/test'  
- Use descriptive test names with comments on each step
- Use data-testid selectors from the list above
- Use waitForSelector or expect().toBeVisible() — never arbitrary waits
- The test must be fully self-contained
- If testing badge updates, allow up to 8000ms (badges poll every 4s)

OUTPUT: Return ONLY the raw TypeScript file content. No markdown, no code fences, no explanation.`;

  let generatedCode;
  try {
    const genResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: generationPrompt,
    });
    generatedCode = genResponse.text.trim();
    // Strip any markdown fences Gemini may add despite instructions
    generatedCode = generatedCode
      .replace(/^```(?:typescript|ts)?\n?/m, '')
      .replace(/\n?```$/m, '');
  } catch (err) {
    console.error('[qa-agent] Failed to generate test:', err.message);
    throw new Error(`Test generation failed: ${err.message}`);
  }

  // ── Step 2: Save to disk ──────────────────────────────────────────────────

  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const timestamp = Date.now();
  const sanitizedName = instruction.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const fileName = `gen-${sanitizedName}-${timestamp}.spec.ts`;
  const filePath = path.join(GENERATED_DIR, fileName);

  fs.writeFileSync(filePath, generatedCode, 'utf-8');
  console.log(`[qa-agent] Saved: ${fileName}`);

  // ── Step 3: Execute with Playwright ──────────────────────────────────────

  let rawOutput = '';
  let status = 'pass';
  const rootDir = path.join(__dirname, '../../../..');

  try {
    const cmd = `npx playwright test tests/generated/${fileName} --reporter=line --timeout=30000`;
    rawOutput = execSync(cmd, {
      cwd: rootDir,
      timeout: 90000,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (err) {
    rawOutput = (err.stdout || '') + (err.stderr || '');
    status = rawOutput.includes('Error:') && !rawOutput.includes('failed') ? 'error' : 'fail';
  }

  // ── Step 4: Summarize via Gemini ──────────────────────────────────────────

  let summary = '';
  try {
    const summaryPrompt = `A Playwright test was generated from this instruction: "${instruction}"

The test ${status === 'pass' ? 'PASSED ✅' : 'FAILED ❌'}.

Raw Playwright output:
${rawOutput.slice(0, 2000)}

Write a single paragraph (3-4 sentences) in plain English that:
1. States what was tested
2. States whether it passed or failed  
3. If failed, explains the likely cause in non-technical terms
4. Notes anything interesting

Be concise — this will be read by a non-technical stakeholder.`;

    const summaryResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: summaryPrompt,
    });
    summary = summaryResponse.text.trim();
  } catch {
    summary = `Test ${status === 'pass' ? 'passed' : 'failed'}. Unable to generate detailed summary.`;
  }

  // ── Step 5: Persist to DB ─────────────────────────────────────────────────

  const run = db.prepare(`
    INSERT INTO qa_runs (instruction, generated_file, generated_code, status, raw_output, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(instruction, fileName, generatedCode, status, rawOutput.slice(0, 5000), summary);

  // Keep only last 50 runs
  db.prepare(`
    DELETE FROM qa_runs WHERE id NOT IN (
      SELECT id FROM qa_runs ORDER BY run_at DESC LIMIT 50
    )
  `).run();

  console.log(`[qa-agent] Run complete. Status: ${status}`);

  return {
    id: run.lastInsertRowid,
    status,
    generatedCode,
    rawOutput,
    summary,
    filePath: fileName,
  };
}
