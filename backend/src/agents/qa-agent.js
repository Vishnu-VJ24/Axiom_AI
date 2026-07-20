// backend/src/agents/qa-agent.js
// The QA Agent: takes a plain-English test instruction, generates a Playwright
// test file via Claude, executes it, and returns pass/fail + a natural-language summary.
//
// This demonstrates: manual testing → scripted automation → prompt-driven test generation.

import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, '../../../..', 'tests', 'generated');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// App context: key selectors and routes that Claude needs to generate accurate tests.
// This acts as the "API documentation" Claude uses to write Playwright tests.
const APP_CONTEXT = `
APPLICATION UNDER TEST: Sentinel Demo E-Commerce Store

BASE URL: http://localhost:5173

KEY PAGES & ROUTES:
- Home / Product Listing: http://localhost:5173/
- Cart is a slide-in sidebar, not a separate page

KEY UI SELECTORS (use these in your tests):
- Customer selector dropdown: [data-testid="customer-selector"]
- Individual customer option: [data-testid="customer-option-{id}"] (ids: 1, 2, 3, 4)
- Product card: [data-testid="product-card-{id}"]
- Add to cart button on product card: [data-testid="add-to-cart-{id}"]
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
- The QA agent panel is accessible via a floating button in the bottom-right corner

SAMPLE DATA:
- Customer 1 (Alex Rivera) has 4 past orders and a pre-loaded high-value cart → expect VIP + Big Spender badges
- Customer 2 (Jamie Chen) has 2 past orders
- Products 1-10 are available; product #2 (Ergonomic Chair, $249.99) and #4 (Keyboard, $129.99) are in Alex's cart
`;

/**
 * Generates a Playwright test from a plain-English instruction, runs it, and summarizes results.
 * @param {string} instruction - Plain-English description of what to test
 * @returns {object} { status, generatedCode, rawOutput, summary, filePath }
 */
export async function runQaAgent(instruction) {
  const db = getDb();

  // ── Step 1: Generate Playwright test via Claude ───────────────────────────

  const generationPrompt = `You are a senior QA engineer. Generate a complete, runnable Playwright test for the following instruction:

INSTRUCTION: ${instruction}

${APP_CONTEXT}

REQUIREMENTS FOR YOUR TEST:
- Use TypeScript
- Import from '@playwright/test'
- Use descriptive test names
- Add brief comments explaining each step
- Use data-testid selectors where available (listed above)
- Use waitForSelector or expect().toBeVisible() instead of arbitrary waits
- The test must be self-contained (no imports beyond @playwright/test)
- Include error handling with meaningful assertions
- If testing badge updates, wait up to 8000ms as they update via polling

Respond ONLY with the complete TypeScript test file content. No markdown fences, no explanation — just the raw .ts file content.`;

  let generatedCode;
  try {
    const genResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: generationPrompt }],
    });
    generatedCode = genResponse.content[0].text.trim();
    // Strip markdown fences if Claude added them despite instructions
    generatedCode = generatedCode.replace(/^```typescript\n?/, '').replace(/^```ts\n?/, '').replace(/\n?```$/, '');
  } catch (err) {
    console.error('[qa-agent] Failed to generate test:', err.message);
    throw new Error(`Test generation failed: ${err.message}`);
  }

  // ── Step 2: Save generated test to disk ──────────────────────────────────

  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const timestamp = Date.now();
  const sanitizedName = instruction.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const fileName = `gen-${sanitizedName}-${timestamp}.spec.ts`;
  const filePath = path.join(GENERATED_DIR, fileName);

  fs.writeFileSync(filePath, generatedCode, 'utf-8');
  console.log(`[qa-agent] Saved generated test: ${filePath}`);

  // ── Step 3: Execute the test with Playwright ─────────────────────────────

  let rawOutput = '';
  let status = 'pass';

  const rootDir = path.join(__dirname, '../../../..');
  try {
    // Run only the generated file; use -- to separate playwright args from file path
    const cmd = `npx playwright test tests/generated/${fileName} --reporter=line --timeout=30000`;
    rawOutput = execSync(cmd, {
      cwd: rootDir,
      timeout: 90000,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (err) {
    // execSync throws on non-zero exit code (test failure)
    rawOutput = (err.stdout || '') + (err.stderr || '');
    status = rawOutput.includes('Error:') && !rawOutput.includes('failed') ? 'error' : 'fail';
  }

  // ── Step 4: Summarize results via Claude ─────────────────────────────────

  let summary = '';
  try {
    const summaryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `A Playwright test was generated from this instruction: "${instruction}"

The test ${status === 'pass' ? 'PASSED ✅' : 'FAILED ❌'}.

Raw output:
${rawOutput.slice(0, 2000)}

Write a single paragraph (3-4 sentences) in plain English that:
1. States what was tested
2. States whether it passed or failed
3. If it failed, explains the likely cause in non-technical terms
4. Notes anything interesting observed

Be concise and clear — this will be read by a non-technical stakeholder.`,
        },
      ],
    });
    summary = summaryResponse.content[0].text.trim();
  } catch (err) {
    summary = `Test ${status === 'pass' ? 'passed' : 'failed'}. Unable to generate detailed summary.`;
  }

  // ── Step 5: Persist to DB ────────────────────────────────────────────────

  const run = db.prepare(`
    INSERT INTO qa_runs (instruction, generated_file, generated_code, status, raw_output, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(instruction, fileName, generatedCode, status, rawOutput.slice(0, 5000), summary);

  // Keep only the last 50 runs in the DB
  db.prepare(`
    DELETE FROM qa_runs WHERE id NOT IN (
      SELECT id FROM qa_runs ORDER BY run_at DESC LIMIT 50
    )
  `).run();

  console.log(`[qa-agent] Test run complete. Status: ${status}`);

  return {
    id: run.lastInsertRowid,
    status,
    generatedCode,
    rawOutput,
    summary,
    filePath: fileName,
  };
}
