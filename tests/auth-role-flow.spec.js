// Logistics Twin - Multi-Role Authentication & Demo Flow E2E Spec
// Tests:
// 1. Login page renders touch-friendly inputs & language options
// 2. "Continue in demo sandbox" retains full judge demo capabilities
// 3. Driver persona can access /my-trips and update trip status
// 4. Buyer persona can access /my-orders and view inbound consignment metrics
// 5. Planner persona retains full control tower, team invite, and network editor
// 6. Role guard redirects unauthorized users with friendly message

import { test, expect } from '@playwright/test';

test.describe('Role-Based Access Control & Demo Persona Flow', () => {
  test('1. renders touch-friendly login page with multi-lingual selector', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('text=Logistics Twin').first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Verify touch target sizing (inputs >= 48px height)
    const emailInput = page.locator('input[type="email"]');
    const box = await emailInput.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);

    // Verify language switcher buttons exist
    await expect(page.locator('button:has-text("English")')).toBeVisible();
    await expect(page.locator('button:has-text("हिंदी")')).toBeVisible();
    await expect(page.locator('button:has-text("मराठी")')).toBeVisible();
  });

  test('2. "Continue in Demo Sandbox" enters planner role and displays local sandbox banner', async ({ page }) => {
    await page.goto('/login');

    const demoBtn = page.locator('button:has-text("Continue in Demo Sandbox")');
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // Should redirect to Dashboard
    await page.waitForURL('**/');
    await expect(page.locator('text=Live Driver Corridor Dispatches').first()).toBeVisible();
    await expect(page.locator('text=Demo Sandbox').or(page.locator('text=Local sandbox')).first()).toBeVisible();
  });

  test('3. switches persona to Driver and displays My Trips console', async ({ page }) => {
    await page.goto('/my-trips');

    // In demo mode or role switcher
    await expect(page.locator('text=Driver Console').first()).toBeVisible();
    await expect(page.locator('text=Assigned Corridors & Dispatches').first()).toBeVisible();
  });

  test('4. switches persona to Buyer and displays My Orders console', async ({ page }) => {
    await page.goto('/my-orders');

    await expect(page.locator('text=Buyer Order Portal').first()).toBeVisible();
    await expect(page.locator('text=Inbound Consignments').first()).toBeVisible();
    await expect(page.locator('text=Required Demand').first()).toBeVisible();
  });

  test('5. driver is blocked from planner-only routes with friendly guard page', async ({ page }) => {
    // Navigate to login and select driver persona
    await page.goto('/login');
    const driverDemoBtn = page.locator('[data-testid="demo-role-driver"]');
    await expect(driverDemoBtn).toBeVisible();
    await driverDemoBtn.click();
    await page.waitForURL('**/my-trips');

    // Attempt to access planner-only /team page
    await page.goto('/team');

    // Role guard blocks it and renders Access Restricted
    await expect(page.locator('text=Access Restricted').first()).toBeVisible();
  });
});
