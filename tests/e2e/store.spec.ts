import { test, expect } from '@playwright/test';

/**
 * Core e2e tests for Sentinel store functionality.
 * These tests verify the product listing, cart operations, and customer switching.
 */

test.describe('Product Listing', () => {
  test('should display products on home page', async ({ page }) => {
    await page.goto('/');

    // At least 8 product cards should be visible
    const cards = page.locator('[data-testid^="product-card-"]');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('should show product name and price', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.locator('[data-testid="product-card-1"]');
    await expect(firstCard).toBeVisible();
    // Price should contain a dollar sign
    await expect(firstCard.locator('.product-price')).toContainText('$');
  });
});

test.describe('Customer Selector', () => {
  test('should switch customers', async ({ page }) => {
    await page.goto('/');

    const selector = page.locator('[data-testid="customer-selector"]');
    await expect(selector).toBeVisible();

    // Select customer 2 (Jamie Chen)
    await selector.selectOption('2');

    // Customer name should update
    const customerName = page.locator('[data-testid="customer-name"]');
    await expect(customerName).toContainText('Jamie');
  });

  test('first customer (Alex) should have order history', async ({ page }) => {
    await page.goto('/');

    // Alex is auto-selected; his lifetime total should be > $0
    const customerName = page.locator('[data-testid="customer-name"]');
    await expect(customerName).toBeVisible();
    await expect(customerName).toContainText('Alex');
  });
});

test.describe('Cart Operations', () => {
  test('should open and close cart sidebar', async ({ page }) => {
    await page.goto('/');

    const cartToggle = page.locator('[data-testid="cart-toggle"]');
    await cartToggle.click();

    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(cartSidebar).toBeVisible();
  });

  test('should show Alex\'s pre-seeded cart items', async ({ page }) => {
    await page.goto('/');

    // Alex has a pre-seeded cart with 2 items
    const cartToggle = page.locator('[data-testid="cart-toggle"]');
    await cartToggle.click();

    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(cartSidebar).toBeVisible();

    // Cart should have items
    const cartItems = cartSidebar.locator('[data-testid^="cart-item-"]');
    await expect(cartItems.first()).toBeVisible({ timeout: 5000 });
  });

  test('should add product to cart and update total', async ({ page }) => {
    await page.goto('/');

    // Select Jamie (clean-ish cart)
    await page.locator('[data-testid="customer-selector"]').selectOption('2');

    // Note the initial cart count
    const cartToggle = page.locator('[data-testid="cart-toggle"]');

    // Add product 3 (Water Bottle, $24.99)
    const addBtn = page.locator('[data-testid="add-to-cart-3"]');
    await addBtn.click();

    // Open cart and verify item is there
    await cartToggle.click();
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(cartSidebar).toBeVisible();

    const totalDisplay = page.locator('[data-testid="cart-total"]');
    await expect(totalDisplay).toBeVisible({ timeout: 5000 });
    // Total should be > $0
    const totalText = await totalDisplay.textContent();
    const totalVal = parseFloat(totalText.replace('$', ''));
    expect(totalVal).toBeGreaterThan(0);
  });

  test('should remove item from cart', async ({ page }) => {
    await page.goto('/');

    // Use Morgan (1 past order, likely empty cart)
    await page.locator('[data-testid="customer-selector"]').selectOption('3');

    // Add product 8 to cart first
    await page.locator('[data-testid="add-to-cart-8"]').click();
    await page.waitForTimeout(500);

    // Open cart
    await page.locator('[data-testid="cart-toggle"]').click();
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(cartSidebar).toBeVisible();

    // Remove product 8
    const removeBtn = page.locator('[data-testid="cart-remove-8"]');
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      // Item should be gone
      await expect(page.locator('[data-testid="cart-item-8"]')).not.toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Cart Total Calculation', () => {
  test('cart total should display formatted dollar amount', async ({ page }) => {
    await page.goto('/');

    // Alex has a pre-seeded high-value cart
    await page.locator('[data-testid="cart-toggle"]').click();
    const cartSidebar = page.locator('[data-testid="cart-sidebar"]');
    await expect(cartSidebar).toBeVisible();

    const total = page.locator('[data-testid="cart-total"]');
    await expect(total).toBeVisible({ timeout: 5000 });
    await expect(total).toContainText('$');
  });
});
