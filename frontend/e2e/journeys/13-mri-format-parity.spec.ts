/**
 * Journey 13: MRI Format Parity
 *
 * Real-backend counterpart of Yardi T6.
 * Proves MRI parser produces correct account codes so the YoY engine
 * surfaces the same 3 CAM errors regardless of GL source format.
 *
 * Uses a DEDICATED property "MRI Parity HOU-01" (not the shared
 * "Test Plaza Shopping Center") so it is fully self-contained and does
 * not interfere with the seeded 2023+2024 Yardi data used by journeys
 * 07, patricia-audit-mri, and patricia-audit-yardi.
 *
 * Requires: MRI parser fix (dtype=str) in mri.py
 */
import { test, expect } from '../fixtures'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_USER_EMAIL = 'e2e-test@capveri.com'
const DEDICATED_PROPERTY_NAME = 'MRI Parity HOU-01'

// All controllable account codes present in the MRI fixture
const MRI_CONTROLLABLE_ACCOUNTS = [
  '5100.10', '5100.20', '5110.00', '5120.00',
  '5200.10', '5200.20', '5200.30',
  '5300.10', '5310.00', '5320.00', '5330.00', '5340.00', '5350.00',
  '5400.10', '5400.20', '5410.00', '5420.00',
  '5500.10', '5500.20', '5510.00',
  '5600.00',
  '5700.10', '5700.20',
  '5900.10', '5910.00', '5920.00', '5930.00', '5940.00',
]

async function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getOrgId(): Promise<string> {
  const admin = await getAdminClient()
  const { data: user } = await admin
    .from('users')
    .select('organization_id')
    .eq('email', TEST_USER_EMAIL)
    .maybeSingle()
  if (!user?.organization_id) throw new Error('Test user org not found')
  return user.organization_id
}

/**
 * Create the dedicated MRI parity property with expense pools, pool
 * mappings, and a 2023 baseline GL batch.
 *
 * 2023 baseline account amounts are identical to the MRI 2024 fixture
 * EXCEPT:
 *   - Taxes (5800.10):       95,000.00   → 2024 fixture = 125,003.60 (+30,003.60)
 *   - HVAC (5300.15):         1,200.00   → 2024 fixture =  12,000.00 (+10,800.00)
 *   - Payroll (5920.00):      1,520.00   → 2024 fixture =  14,500.00 (+12,980 ctrl delta)
 *
 * Ctrl 2023 total = 191,907.42; Ctrl 2024 total = 204,887.42; delta = +12,980.
 */
async function setupDedicatedProperty(): Promise<string> {
  const admin = await getAdminClient()
  const orgId = await getOrgId()

  // Idempotent: delete any leftover property from a prior run
  await teardownDedicatedProperty()

  const { data: prop, error: propErr } = await admin
    .from('properties')
    .insert({
      organization_id: orgId,
      name: DEDICATED_PROPERTY_NAME,
      address_line1: '1 MRI Test Blvd',
      city: 'Houston',
      state: 'TX',
      postal_code: '77001',
      total_rentable_sqft: 50000,
      total_usable_sqft: 45000,
      common_area_sqft: 5000,
      target_occupancy: 0.95,
    })
    .select('id')
    .single()
  if (propErr || !prop) throw new Error(`Failed to create dedicated property: ${propErr?.message}`)
  const propertyId = prop.id

  // Expense pools
  const { data: poolTax, error: eTax } = await admin
    .from('expense_pools')
    .insert({ property_id: propertyId, name: 'Taxes - Real Estate', pool_type: 'tax', is_gross_up_applicable: false })
    .select('id').single()
  if (eTax) throw new Error(`Tax pool: ${eTax.message}`)

  const { data: poolHvac, error: eHvac } = await admin
    .from('expense_pools')
    .insert({ property_id: propertyId, name: 'R&M - HVAC Repairs', pool_type: 'operating', is_gross_up_applicable: true })
    .select('id').single()
  if (eHvac) throw new Error(`HVAC pool: ${eHvac.message}`)

  const { data: poolCtrl, error: eCtrl } = await admin
    .from('expense_pools')
    .insert({ property_id: propertyId, name: 'Controllable Expenses', pool_type: 'operating', is_gross_up_applicable: true })
    .select('id').single()
  if (eCtrl) throw new Error(`Ctrl pool: ${eCtrl.message}`)

  // Pool mappings
  const mappings = [
    { expense_pool_id: poolTax.id, gl_account_pattern: '5800.10', allocation_percentage: 1.0, priority: 10 },
    { expense_pool_id: poolHvac.id, gl_account_pattern: '5300.15', allocation_percentage: 1.0, priority: 10 },
    ...MRI_CONTROLLABLE_ACCOUNTS.map((code) => ({
      expense_pool_id: poolCtrl.id,
      gl_account_pattern: code,
      allocation_percentage: 1.0,
      priority: 1,
    })),
  ]
  const { error: eMaps } = await admin.from('pool_mappings').insert(mappings)
  if (eMaps) throw new Error(`Pool mappings: ${eMaps.message}`)

  // 2023 baseline import batch
  const { data: batch, error: eBatch } = await admin
    .from('import_batches')
    .insert({
      organization_id: orgId,
      property_id: propertyId,
      file_name: '__seed_mri_parity_2023_baseline.csv',
      file_hash: 'c'.repeat(64),
      source_system: 'mri',
      status: 'completed',
      row_count: 29,
      error_count: 0,
      error_log: [],
    })
    .select('id')
    .single()
  if (eBatch || !batch) throw new Error(`2023 batch: ${eBatch?.message}`)

  const glRow = (year: number, month: number, code: string, desc: string, amount: number) => ({
    import_batch_id: batch.id,
    property_id: propertyId,
    account_code: code,
    account_description: desc,
    amount,
    transaction_date: `${year}-${String(month).padStart(2, '0')}-15`,
    period_year: year,
    period_month: month,
    raw_row_data: {},
  })

  // 2023 baseline GL — matches 2024 MRI fixture amounts EXCEPT the 3 error accounts.
  // Ctrl 2023 total = 191,907.42  (2024 = 204,887.42, delta = +12,980)
  const entries2023 = [
    glRow(2023,  1, '5100.10', 'Janitorial - Contract',      18500.00),
    glRow(2023,  1, '5100.20', 'Janitorial - Supplies',       3240.55),
    glRow(2023,  2, '5110.00', 'Window Washing',               4150.00),
    glRow(2023,  2, '5200.10', 'Utilities - Electricity',     28450.30),
    glRow(2023,  2, '5200.20', 'Utilities - Water/Sewer',      4890.12),
    glRow(2023,  3, '5200.30', 'Utilities - Gas',              1120.00),
    glRow(2023,  3, '5300.10', 'R&M - HVAC Contract',          5500.00),
    glRow(2023,  3, '5300.15', 'R&M - HVAC Chiller',           1200.00), // 2024 = 12000 (+10800)
    glRow(2023,  4, '5310.00', 'R&M - Elevator Contract',      6200.00),
    glRow(2023,  4, '5320.00', 'R&M - Plumbing',                850.00),
    glRow(2023,  5, '5330.00', 'R&M - Electrical',             1420.75),
    glRow(2023,  5, '5400.10', 'Landscaping - Contract',       2100.00),
    glRow(2023,  5, '5400.20', 'Landscaping - Extras',          850.00),
    glRow(2023,  6, '5410.00', 'Parking Lot Sweeping',          650.00),
    glRow(2023,  6, '5420.00', 'Parking Lot R&M',              3200.00),
    glRow(2023,  7, '5500.10', 'Security - Guard Service',     22400.00),
    glRow(2023,  7, '5500.20', 'Security - Systems',            1150.00),
    glRow(2023,  8, '5600.00', 'Fire & Life Safety',            2400.00),
    glRow(2023,  8, '5700.10', 'Insurance - Property',         45000.00),
    glRow(2023,  9, '5700.20', 'Insurance - Liability',         8500.00),
    glRow(2023,  9, '5800.10', 'Taxes - Real Estate',          95000.00), // 2024 = 125003.60 (+30003.60)
    glRow(2023, 10, '5900.10', 'Management Fees',              18450.00),
    glRow(2023, 10, '5910.00', 'Admin / Office Expense',         125.50),
    glRow(2023, 11, '5920.00', 'Payroll - Building Eng',        1520.00), // 2024 = 14500 (ctrl delta driver)
    glRow(2023, 11, '5930.00', 'Trash Removal',                 1850.00),
    glRow(2023, 12, '5340.00', 'R&M - Roof',                    2200.00),
    glRow(2023, 12, '5350.00', 'R&M - General Bldg',             450.20),
    glRow(2023, 12, '5120.00', 'Pest Control',                    350.00),
    glRow(2023, 12, '5510.00', 'Access Control',                  890.00),
    glRow(2023, 12, '5940.00', 'Legal & Professional',           5500.00),
  ]

  const { error: eGL } = await admin.from('gl_entries').insert(entries2023)
  if (eGL) throw new Error(`2023 GL entries: ${eGL.message}`)

  // The YoY available-years endpoint and the compare backend require finalized
  // snapshots. Create a minimal lease then seed one finalized snapshot per year
  // so the year checkboxes appear. Pool amounts come from GL entries at compare time.
  const { data: orgUser } = await admin
    .from('users')
    .select('id')
    .eq('email', TEST_USER_EMAIL)
    .maybeSingle()
  const userId = orgUser?.id ?? null

  const { data: lease, error: eLease } = await admin
    .from('leases')
    .insert({
      property_id: propertyId,
      tenant_name: 'MRI Parity Tenant',
      status: 'active',
      start_date: '2023-01-01',
      end_date: '2028-12-31',
      recovery_profile: {
        base_year: 2023,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: '0.05',
        cap_type: 'none',
        cap_rate: null,
        admin_fee_percentage: '0.00',
        excluded_pools: [],
      },
    })
    .select('id')
    .single()
  if (eLease || !lease) throw new Error(`Lease: ${eLease?.message}`)

  const snapshots = [2023, 2024].map((year) => ({
    property_id: propertyId,
    lease_id: lease.id,
    period_start_date: `${year}-01-01`,
    period_end_date: `${year}-12-31`,
    status: 'finalized',
    total_operating_expenses: 0,
    grossed_up_expenses: 0,
    base_year_amount: 0,
    tenant_share_before_cap: 0,
    tenant_share_after_cap: 0,
    admin_fee: 0,
    total_recovery: 0,
    calculation_trace: [],
    finalized_at: `${year}-12-31T23:59:59Z`,
    finalized_by_user_id: userId,
  }))

  const { error: eSnap } = await admin.from('reconciliation_snapshots').insert(snapshots)
  if (eSnap) throw new Error(`Snapshots: ${eSnap.message}`)

  return propertyId
}

async function teardownDedicatedProperty(): Promise<void> {
  const admin = await getAdminClient()
  const orgId = await getOrgId()

  // Find the property by name
  const { data: props } = await admin
    .from('properties')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', DEDICATED_PROPERTY_NAME)
  if (!props || props.length === 0) return

  for (const p of props) {
    // Delete reconciliation snapshots (FK: property_id and lease_id)
    await admin.from('reconciliation_snapshots').delete().eq('property_id', p.id)
    // Delete leases (after snapshots to avoid FK violation)
    await admin.from('leases').delete().eq('property_id', p.id)
    // Delete import batches (CASCADE removes gl_entries)
    await admin.from('import_batches').delete().eq('property_id', p.id)
    // Delete pool mappings via expense_pools
    const { data: pools } = await admin.from('expense_pools').select('id').eq('property_id', p.id)
    if (pools && pools.length > 0) {
      await admin.from('pool_mappings').delete().in('expense_pool_id', pools.map((x: { id: string }) => x.id))
    }
    await admin.from('expense_pools').delete().eq('property_id', p.id)
    await admin.from('properties').delete().eq('id', p.id)
  }
}

test.describe('Journey 13 — MRI Format Parity', () => {
  test.setTimeout(120_000)

  test.beforeAll(async () => {
    await setupDedicatedProperty()
  })

  test.afterAll(async () => {
    await teardownDedicatedProperty()
  })

  test('MRI-T6: Upload MRI GL → YoY → discover all 3 CAM errors', async ({
    authenticatedPage: page,
  }) => {
    // Scope to desktop sidebar to avoid strict-mode violation with mobile sidebar
    const sidebar = page.locator('[data-testid="sidebar-desktop"]')

    // Step 1: Navigate to GL upload via sidebar
    await sidebar.locator('[data-testid="nav-item-documents"]').click()
    await sidebar.locator('[data-testid="nav-item-documents-upload-gl"]').click()
    await page.waitForLoadState('networkidle')

    // Step 2: Select dedicated property and upload MRI GL file
    const propertySelect = page.locator('#property-select')
      .or(page.getByRole('combobox', { name: /property/i }))
      .first()
    await expect(propertySelect).toBeVisible({ timeout: 10000 })
    await propertySelect.click()
    await page.getByRole('option', { name: DEDICATED_PROPERTY_NAME }).click()
    await page.locator('input[type="file"]').setInputFiles('./e2e/fixtures/mri_gl_hou01_2024.csv')

    // Step 3: Source detected as MRI — click Continue to process
    await expect(page.getByText(/MRI/i)).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByText(/30 rows imported|30 records|success|imported/i)).toBeVisible({
      timeout: 30000,
    })

    // Step 4: Navigate to Year-over-Year via sidebar
    await sidebar.locator('[data-testid="nav-item-analysis"]').click()
    await sidebar.locator('[data-testid="nav-item-analysis-yoy"]').click()

    // Property filter — use data-testid to target the YoY page's Select specifically
    const propertyFilter = page.locator('[data-testid="property-select-trigger"]')
    await expect(propertyFilter).toBeVisible({ timeout: 15000 })
    await propertyFilter.click()
    await page.getByRole('option', { name: DEDICATED_PROPERTY_NAME }).click()

    // Year checkboxes appear after property selection
    await expect(page.getByLabel('2023')).toBeVisible({ timeout: 15000 })
    await page.getByLabel('2023').check()
    await page.getByLabel('2024').check()
    await page.getByRole('button', { name: 'Compare', exact: true }).click()

    await expect(page.getByText('2023').first()).toBeVisible({ timeout: 15000 })

    // Step 5: All 3 CAM errors — same dollar amounts as Yardi T6
    await expect(page.getByText('Taxes - Real Estate')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/\+\$30,003/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('R&M - HVAC Repairs')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/\+\$10,800/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Controllable Expenses')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/\+\$12,9[0-9][0-9]/)).toBeVisible({ timeout: 10000 })
  })
})
