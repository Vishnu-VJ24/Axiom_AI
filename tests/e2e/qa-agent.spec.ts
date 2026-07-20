import { test, expect } from '@playwright/test';

/**
 * Tests for the QA Agent panel.
 * Verifies the UI is functional; full generation tests require ANTHROPIC_API_KEY.
 */

test.describe('QA Agent Panel', () => {
  test('should open and close the QA Agent panel', async ({ page }) => {
    await page.goto('/');

    // Click the FAB
    const fab = page.locator('.qa-fab');
    await expect(fab).toBeVisible();
    await fab.click();

    // Panel should appear
    const panel = page.locator('.qa-panel');
    await expect(panel).toBeVisible();

    // Close it
    await fab.click();
    await expect(panel).not.toBeVisible();
  });

  test('should show instruction input and example chips', async ({ page }) => {
    await page.goto('/');
    await page.locator('.qa-fab').click();

    const input = page.locator('[data-testid="qa-instruction-input"]');
    await expect(input).toBeVisible();

    // Example chips should be present
    const chip = page.locator('.qa-example-chip').first();
    await expect(chip).toBeVisible();
  });

  test('clicking example chip should populate input', async ({ page }) => {
    await page.goto('/');
    await page.locator('.qa-fab').click();

    // Click the first example chip
    const firstChip = page.locator('.qa-example-chip').first();
    const chipText = await firstChip.textContent();
    await firstChip.click();

    const input = page.locator('[data-testid="qa-instruction-input"]');
    await expect(input).toHaveValue(chipText);
  });

  test('submit button should be disabled when input is empty', async ({ page }) => {
    await page.goto('/');
    await page.locator('.qa-fab').click();

    const submitBtn = page.locator('[data-testid="qa-submit-btn"]');
    await expect(submitBtn).toBeDisabled();
  });

  test('submit button should be enabled when input has text', async ({ page }) => {
    await page.goto('/');
    await page.locator('.qa-fab').click();

    const input = page.locator('[data-testid="qa-instruction-input"]');
    await input.fill('Add an item to cart and verify the total');

    const submitBtn = page.locator('[data-testid="qa-submit-btn"]');
    await expect(submitBtn).toBeEnabled();
  });
});
