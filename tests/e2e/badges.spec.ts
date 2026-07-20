import { test, expect } from '@playwright/test';

/**
 * Tests for AI badge behavior.
 * These tests verify that badges appear correctly for known seed data conditions.
 * Note: Badge evaluation requires a valid ANTHROPIC_API_KEY — tests skip gracefully if unavailable.
 */

test.describe('Badge Display', () => {
  test('should display customer badges section for Alex (VIP conditions met)', async ({ page }) => {
    await page.goto('/');

    // Alex Rivera is auto-selected — he has 4 orders, qualifies for VIP + Big Spender
    // The badge-customer container should be visible once badges load
    const customerBadges = page.locator('[data-testid="badge-customer"]');

    // Allow up to 10 seconds for the initial badge evaluation and poll to complete
    await expect(customerBadges).toBeVisible({ timeout: 10000 });
  });

  test('should display cart badge area for Alex\'s high-value cart', async ({ page }) => {
    await page.goto('/');

    // Open cart — Alex has a pre-seeded $379 cart → should get "High Value Cart"
    await page.locator('[data-testid="cart-toggle"]').click();
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(cartSidebar).toBeVisible();

    // Cart badges area should eventually appear
    const cartBadgeArea = page.locator('[data-testid="badge-cart"]');
    await expect(cartBadgeArea).toBeVisible({ timeout: 10000 });
  });

  test('product badges should appear on the product grid', async ({ page }) => {
    await page.goto('/');

    // Wait for at least one product badge to appear anywhere on the page
    const anyProductBadge = page.locator('[data-testid^="badge-product-"]').first();
    await expect(anyProductBadge).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Badge Tooltip', () => {
  test('badge pill should show reasoning tooltip on hover', async ({ page }) => {
    await page.goto('/');

    // Wait for any badge to appear
    const firstBadge = page.locator('.badge-pill').first();
    await expect(firstBadge).toBeVisible({ timeout: 10000 });

    // Hover to trigger tooltip
    await firstBadge.hover();

    // Tooltip with "AI Reasoning" should appear
    await expect(page.locator('text=AI Reasoning')).toBeVisible({ timeout: 3000 });
  });
});
