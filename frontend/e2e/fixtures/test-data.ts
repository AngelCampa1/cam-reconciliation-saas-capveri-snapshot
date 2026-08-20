import type { Page } from '@playwright/test';

export async function createTestProperty(page: Page) {
  const timestamp = Date.now();
  const propertyName = `E2E Property ${timestamp}`;

  await page.goto('/properties/new');
  await page.fill('input[name="name"]', propertyName);
  await page.fill('input[name="address"]', `${timestamp} Test St, LA, CA 90001`);
  await page.fill('input[name="totalRentableArea"]', '10000');
  await page.fill('input[name="totalUsableArea"]', '9000');
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/properties\/[a-f0-9-]+/);

  const url = page.url();
  const propertyId = url.split('/').pop()!;

  return { propertyId, propertyName };
}

export async function createTestUnit(page: Page, unitNumber: string = 'Suite 101') {
  await page.click('button:has-text("Add Unit")');
  await page.fill('input[name="number"]', unitNumber);
  await page.fill('input[name="rentableArea"]', '2500');
  await page.fill('input[name="usableArea"]', '2250');
  await page.click('button[type="submit"]');

  await page.waitForSelector(`text=${unitNumber}`);

  return { unitNumber };
}

export async function createTestLease(page: Page, tenantName: string = 'E2E Tenant') {
  await page.click('button:has-text("Create Lease")');
  await page.fill('input[name="tenantName"]', tenantName);
  await page.fill('input[name="startDate"]', '2024-01-01');
  await page.fill('input[name="endDate"]', '2029-12-31');
  await page.fill('input[name="baseRent"]', '5000');
  await page.fill('input[name="proRataShare"]', '0.05');
  await page.click('button[type="submit"]');

  await page.waitForSelector('text=Lease created');

  return { tenantName };
}

export async function cleanupTestProperty(page: Page, propertyId: string) {
  await page.goto(`/properties/${propertyId}`);
  await page.click('button:has-text("Delete Property")');
  await page.click('button:has-text("Confirm")');
  await page.waitForURL('/properties');
}
