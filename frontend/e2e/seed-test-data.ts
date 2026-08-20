/**
 * E2E Test Data Seeding Script
 *
 * Seeds test data for E2E verification workflow tests.
 * Creates properties and documents with realistic extraction results.
 */
import { createClient, type User } from '@supabase/supabase-js'

// Supabase configuration - must match .env.test
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Test user credentials - must match setup.ts
const TEST_USER_EMAIL = 'e2e-test@capveri.com'

// Consistent UUID for the E2E test property - used by tests to reference it reliably
const TEST_PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

type SupabaseClient = ReturnType<typeof import('@supabase/supabase-js').createClient>

function calculationStep(
  stepOrder: number,
  stepName: string,
  inputValues: Record<string, unknown>,
  operation: string,
  outputValue: number | string,
  note: string | null = null
) {
  return {
    step_order: stepOrder,
    step_name: stepName,
    input_values: inputValues,
    operation,
    output_value: String(outputValue),
    note,
  }
}

/**
 * Seed GL entries for YoY comparison tests.
 *
 * Expense pools and pool mappings are already created once for this property in
 * Step 3a/3b (exact-code mappings in CONTROLLABLE_ACCOUNTS cover every GL code
 * used below), so this function does NOT re-create them — doing so would violate
 * `unique_pool_name_per_property`. GL entries are classified into pools at
 * calculation time via those mappings; they carry no pool foreign key here.
 *
 * Both import batches are named with a `__seed_` prefix so the per-test
 * cleanUploadBatches() helpers in the Patricia/MRI specs preserve them.
 *
 * Expected YoY variances (2023 → 2024):
 *   Taxes - Real Estate:     $95,000 → $125,003.60  (+$30,003.60)
 *   R&M - HVAC Repairs:       $1,200 →   $12,000.00  (+$10,800.00)
 *   Controllable Expenses:  $141,670 →  $154,650.00  (+$12,980.00)
 */
async function seedGLData(orgId: string, propertyId: string, supabase: SupabaseClient) {
  console.log('📊 Seeding GL entries for YoY testing...')

  const { data: batches, error: batchError } = await supabase.from('import_batches').insert([
    {
      organization_id: orgId,
      property_id: propertyId,
      file_name: '__seed_yardi_gl_2023_baseline.csv',
      file_hash: 'a'.repeat(64),
      source_system: 'yardi',
      status: 'completed',
      row_count: 10,
      error_count: 0,
      error_log: [],
    },
    {
      organization_id: orgId,
      property_id: propertyId,
      file_name: '__seed_yardi_gl_2024_with_errors.csv',
      file_hash: 'b'.repeat(64),
      source_system: 'yardi',
      status: 'completed',
      row_count: 10,
      error_count: 0,
      error_log: [],
    },
  ]).select()

  if (batchError) {
    console.warn(`⚠️  Import batches seed warning: ${batchError.message}`)
    return
  }

  const batchId2023 = batches![0].id
  const batchId2024 = batches![1].id

  const glRow = (batchId: string, year: number, month: number, code: string, desc: string, amount: number) => ({
    import_batch_id: batchId,
    property_id: propertyId,
    account_code: code,
    account_description: desc,
    amount,
    transaction_date: `${year}-${String(month).padStart(2, '0')}-15`,
    period_year: year,
    period_month: month,
    raw_row_data: {},
  })

  // 2023 baseline GL entries (total ctrl = $141,670)
  const entries2023 = [
    glRow(batchId2023, 2023,  9, '5800.10', 'Taxes - Real Estate',     95000.00),
    glRow(batchId2023, 2023,  3, '5300.15', 'R&M - HVAC Repairs',       1200.00),
    glRow(batchId2023, 2023,  1, '5100.10', 'Janitorial - Contract',   18000.00),
    glRow(batchId2023, 2023,  2, '5200.10', 'Utilities - Electricity',  27000.00),
    glRow(batchId2023, 2023,  7, '5500.10', 'Security - Guard Svc',    21000.00),
    glRow(batchId2023, 2023,  8, '5700.10', 'Insurance - Property',    42000.00),
    glRow(batchId2023, 2023, 10, '5900.10', 'Management Fees',         17500.00),
    glRow(batchId2023, 2023, 11, '5920.00', 'Payroll - Bldg Eng',       9500.00),
    glRow(batchId2023, 2023, 11, '5930.00', 'Trash Removal',            1670.00),
    glRow(batchId2023, 2023, 12, '5940.00', 'Legal & Professional',     5000.00),
  ]

  // 2024 GL entries with 3 seeded CAM errors (total ctrl = $154,650)
  const entries2024 = [
    glRow(batchId2024, 2024,  9, '5800.10', 'Taxes - Real Estate',    125003.60), // ERROR 1: grossed-up tax
    glRow(batchId2024, 2024,  3, '5300.15', 'R&M - HVAC Repairs',      12000.00), // ERROR 2: CapEx as OpEx
    glRow(batchId2024, 2024,  1, '5100.10', 'Janitorial - Contract',   18500.00),
    glRow(batchId2024, 2024,  2, '5200.10', 'Utilities - Electricity',  28450.00),
    glRow(batchId2024, 2024,  7, '5500.10', 'Security - Guard Svc',    22400.00),
    glRow(batchId2024, 2024,  8, '5700.10', 'Insurance - Property',    45000.00),
    glRow(batchId2024, 2024, 10, '5900.10', 'Management Fees',         18450.00),
    glRow(batchId2024, 2024, 11, '5920.00', 'Payroll - Bldg Eng',      14500.00), // ERROR 3 driver
    glRow(batchId2024, 2024, 11, '5930.00', 'Trash Removal',            1850.00),
    glRow(batchId2024, 2024, 12, '5940.00', 'Legal & Professional',     5500.00),
  ]

  const { error: glError } = await supabase.from('gl_entries').insert([...entries2023, ...entries2024])
  if (glError) {
    console.warn(`⚠️  GL entries seed warning: ${glError.message}`)
    return
  }

  console.log('✅ GL entries seeded (2023 baseline + 2024 with 3 CAM errors)')
  console.log('   Tax pool:  2023=$95,000 → 2024=$125,003.60 (+$30,003.60)')
  console.log('   HVAC pool: 2023=$1,200 → 2024=$12,000 (+$10,800)')
  console.log('   Ctrl pool: 2023=$141,670 → 2024=$154,650 (+$12,980)')
}

/**
 * Seed test data for E2E tests
 */
async function seedTestData() {
  console.log('🌱 Seeding test data for E2E tests...')

  // Create admin client (bypasses RLS)
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    // Step 1: Get test user's organization
    console.log('📝 Finding test user organization...')
    const { data: user, error: userError } = await adminClient
      .from('users')
      .select('id, organization_id')
      .eq('email', TEST_USER_EMAIL)
      .single()

    if (userError || !user) {
      throw new Error(`Test user not found: ${userError?.message}`)
    }

    const organizationId = user.organization_id
    console.log(`✅ Found organization: ${organizationId}`)

    // Grant the seeded org full entitlement access (active subscription) so
    // require_full_access-gated endpoints (upload, exports, demand letter,
    // compliance, NOI board PDF) return 200 in E2E. has_full_access() grants
    // access for status active/trialing on the 'subscription' billing model.
    const { error: subError } = await adminClient.from('subscriptions').upsert(
      {
        organization_id: organizationId,
        status: 'active',
        // 'defend' is the top paid tier; the billing UI reads the plan directly
        // from Supabase (use-subscription.ts), so this drives the displayed
        // plan name in billing E2E (e.g. "Defend").
        plan: 'defend',
        current_period_end: '2099-01-01T00:00:00Z',
        cancel_at_period_end: false,
      },
      { onConflict: 'organization_id' }
    )
    if (subError) {
      throw new Error(`Failed to seed subscription: ${subError.message}`)
    }
    console.log('✅ Active subscription seeded for org')

    // Step 2: Clean up existing test data (for idempotent seeding)
    console.log('🧹 Cleaning up existing test data...')

    // Delete ALL documents for this organization (aggressive cleanup for E2E)
    const { error: docDeleteError } = await adminClient
      .from('documents')
      .delete()
      .eq('organization_id', organizationId)

    if (docDeleteError) {
      console.warn(`⚠️  Document cleanup warning: ${docDeleteError.message}`)
    } else {
      console.log('✅ All documents deleted')
    }

    // Delete reconciliation snapshots (must happen before deleting properties due to FK)
    // We need to delete via property_id since snapshots don't have organization_id
    const { data: existingProperties } = await adminClient
      .from('properties')
      .select('id')
      .eq('organization_id', organizationId)

    if (existingProperties && existingProperties.length > 0) {
      const propertyIds = existingProperties.map(p => p.id)

      const { error: sb1103DeleteError } = await adminClient
        .from('sb1103_requests')
        .delete()
        .in('property_id', propertyIds)

      if (sb1103DeleteError) {
        console.warn(`⚠️  SB 1103 cleanup warning: ${sb1103DeleteError.message}`)
      } else {
        console.log('✅ All SB 1103 requests deleted')
      }

      const { error: snapshotDeleteError } = await adminClient
        .from('reconciliation_snapshots')
        .delete()
        .in('property_id', propertyIds)

      if (snapshotDeleteError) {
        console.warn(`⚠️  Snapshot cleanup warning: ${snapshotDeleteError.message}`)
      } else {
        console.log('✅ All reconciliation snapshots deleted')
      }
    }

    // Delete GL data in reverse FK order (must happen before properties)
    const { data: existingBatches } = await adminClient
      .from('import_batches')
      .select('id')
      .eq('property_id', TEST_PROPERTY_ID)
    if (existingBatches && existingBatches.length > 0) {
      const batchIds = existingBatches.map((b: { id: string }) => b.id)
      await adminClient.from('gl_entries').delete().in('import_batch_id', batchIds)
    }
    const { data: existingPools } = await adminClient
      .from('expense_pools')
      .select('id')
      .eq('property_id', TEST_PROPERTY_ID)
    if (existingPools && existingPools.length > 0) {
      const poolIds = existingPools.map((p: { id: string }) => p.id)
      await adminClient.from('pool_mappings').delete().in('expense_pool_id', poolIds)
    }
    await adminClient.from('expense_pools').delete().eq('property_id', TEST_PROPERTY_ID)
    await adminClient.from('import_batches').delete().eq('property_id', TEST_PROPERTY_ID)
    console.log('✅ GL data cleaned up')

    // Delete ALL properties for this organization
    const { error: propDeleteError } = await adminClient
      .from('properties')
      .delete()
      .eq('organization_id', organizationId)

    if (propDeleteError) {
      console.warn(`⚠️  Property cleanup warning: ${propDeleteError.message}`)
    } else {
      console.log('✅ All properties deleted')
    }

    console.log('✅ Cleanup complete')

    // Step 3: Create test property
    console.log('🏢 Creating test property...')

    const { data: property, error: propertyError} = await adminClient
      .from('properties')
      .insert({
        id: TEST_PROPERTY_ID,
        organization_id: organizationId,
        name: 'Test Plaza Shopping Center',
        address_line1: '123 Test Street',
        address_line2: 'Suite 100',
        city: 'Test City',
        state: 'CA',
        postal_code: '90210',
        total_rentable_sqft: 50000,
        total_usable_sqft: 45000,
        common_area_sqft: 5000,
        target_occupancy: 0.95,
      })
      .select()
      .single()

    if (propertyError) {
      throw new Error(`Failed to create property: ${propertyError.message}`)
    }

    console.log(`✅ Property created: ${property.id}`)

    // Step 3a: Create expense pools for YoY analysis
    console.log('💰 Creating expense pools...')

    const CONTROLLABLE_ACCOUNTS = [
      '5100.10', '5100.20', '5110.00', '5120.00',
      '5200.10', '5200.20', '5200.30',
      '5300.10', '5310.00', '5320.00', '5330.00', '5340.00', '5350.00',
      '5400.10', '5400.20', '5410.00', '5420.00',
      '5500.10', '5500.20', '5510.00',
      '5600.00',
      '5700.10', '5700.20',
      '5900.10', '5910.00', '5920.00', '5930.00', '5940.00',
    ]

    const { data: poolTax, error: poolTaxError } = await adminClient
      .from('expense_pools')
      .insert({
        property_id: property.id,
        name: 'Taxes - Real Estate',
        pool_type: 'tax',
        is_gross_up_applicable: false,
      })
      .select('id')
      .single()
    if (poolTaxError) throw new Error(`Failed to create tax pool: ${poolTaxError.message}`)

    const { data: poolHvac, error: poolHvacError } = await adminClient
      .from('expense_pools')
      .insert({
        property_id: property.id,
        name: 'R&M - HVAC Repairs',
        pool_type: 'operating',
        is_gross_up_applicable: true,
      })
      .select('id')
      .single()
    if (poolHvacError) throw new Error(`Failed to create HVAC pool: ${poolHvacError.message}`)

    const { data: poolCtrl, error: poolCtrlError } = await adminClient
      .from('expense_pools')
      .insert({
        property_id: property.id,
        name: 'Controllable Expenses',
        pool_type: 'operating',
        is_gross_up_applicable: true,
      })
      .select('id')
      .single()
    if (poolCtrlError) throw new Error(`Failed to create controllable pool: ${poolCtrlError.message}`)

    console.log('✅ Expense pools created')

    // Step 3b: Create pool mappings (exact account codes — no overlapping patterns)
    console.log('🗺️  Creating pool mappings...')

    const poolMappings = [
      // Taxes - Real Estate
      { expense_pool_id: poolTax.id, gl_account_pattern: '5800.10', allocation_percentage: 1.0, priority: 10 },
      // R&M - HVAC Repairs
      { expense_pool_id: poolHvac.id, gl_account_pattern: '5300.15', allocation_percentage: 1.0, priority: 10 },
      // Controllable Expenses — all remaining account codes from the Yardi fixture
      ...CONTROLLABLE_ACCOUNTS.map((code) => ({
        expense_pool_id: poolCtrl.id,
        gl_account_pattern: code,
        allocation_percentage: 1.0,
        priority: 1,
      })),
    ]

    const { error: mappingError } = await adminClient.from('pool_mappings').insert(poolMappings)
    if (mappingError) throw new Error(`Failed to create pool mappings: ${mappingError.message}`)
    console.log(`✅ Created ${poolMappings.length} pool mappings`)

    // Step 3c: The full 2023 baseline + 2024 YoY GL dataset is seeded by
    // seedGLData() near the end of this routine (under `__seed_`-prefixed
    // batches). That single source of truth produces the variances the YoY
    // specs assert (+$30,003.60 tax / +$10,800 HVAC / +$12,980 controllable),
    // so no separate 2023 stub is created here.

    // Step 4: Create test leases
    console.log('📝 Creating test leases...')

    const { data: lease1, error: lease1Error } = await adminClient
      .from('leases')
      .insert({
        property_id: property.id,
        tenant_name: 'Test Tenant 101',
        status: 'active',
        start_date: '2023-01-01',
        end_date: '2028-12-31',
        recovery_profile: {
          base_year: 2023,
          base_year_amount: null,
          gross_up_base_year: false,
          pro_rata_share: '0.0485',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.15',
          excluded_pools: [],
        },
      })
      .select()
      .single()

    if (lease1Error) {
      throw new Error(`Failed to create lease 1: ${lease1Error.message}`)
    }
    console.log(`✅ Lease 1 created: ${lease1.id}`)

    const { data: lease2, error: lease2Error} = await adminClient
      .from('leases')
      .insert({
        property_id: property.id,
        tenant_name: 'Test Tenant 205',
        status: 'active',
        start_date: '2023-01-01',
        end_date: '2028-12-31',
        recovery_profile: {
          base_year: null,
          base_year_amount: null,
          gross_up_base_year: true,
          pro_rata_share: '0.062',
          cap_type: 'cumulative',
          cap_rate: '0.05',
          admin_fee_percentage: '0.15',
          excluded_pools: [],
        },
      })
      .select()
      .single()

    if (lease2Error) {
      throw new Error(`Failed to create lease 2: ${lease2Error.message}`)
    }
    console.log(`✅ Lease 2 created: ${lease2.id}`)

    const { data: lease3, error: lease3Error } = await adminClient
      .from('leases')
      .insert({
        property_id: property.id,
        tenant_name: 'Test Tenant 310',
        status: 'active',
        start_date: '2023-01-01',
        end_date: '2028-12-31',
        recovery_profile: {
          base_year: 2024,
          base_year_amount: null,
          gross_up_base_year: false,
          pro_rata_share: '0.0325',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.10',
          excluded_pools: [],
        },
      })
      .select()
      .single()

    if (lease3Error) {
      throw new Error(`Failed to create lease 3: ${lease3Error.message}`)
    }
    console.log(`✅ Lease 3 created: ${lease3.id}`)

    // Step 5: Upload test PDFs to Supabase Storage
    console.log('📄 Uploading test PDF files to Supabase Storage...')

    const pdfFiles = [
      { filename: 'suite-101-lease.pdf', lease: lease1 },
      { filename: 'suite-205-lease.pdf', lease: lease2 },
      { filename: 'suite-310-lease.pdf', lease: lease3 },
    ]

    const uploadedFiles: Record<string, { path: string; url: string; size: number }> = {}

    for (const file of pdfFiles) {
      const filePath = `e2e/fixtures/pdfs/${file.filename}`
      const storagePath = `${organizationId}/${property.id}/${file.filename}`

      // Read PDF file from local fixtures
      const fs = await import('fs/promises')
      const pdfBuffer = await fs.readFile(filePath)

      // Upload to Supabase Storage (documents bucket)
      const { data: uploadData, error: uploadError } = await adminClient.storage
        .from('documents')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true, // Overwrite if exists
        })

      if (uploadError) {
        console.warn(`⚠️  Failed to upload ${file.filename}: ${uploadError.message}`)
        continue
      }

      // Get public URL
      const { data: urlData } = adminClient.storage
        .from('documents')
        .getPublicUrl(storagePath)

      uploadedFiles[file.filename] = {
        path: uploadData.path,
        url: urlData.publicUrl,
        size: pdfBuffer.length,
      }

      console.log(`✅ Uploaded ${file.filename} (${pdfBuffer.length} bytes)`)
    }

    // Step 6: Create test documents with extraction results
    // Skip if PDF uploads failed (e.g., in test environment without storage bucket)
    if (Object.keys(uploadedFiles).length === 0) {
      console.log('⚠️  Skipping document creation (no PDFs uploaded)')
    } else {
      console.log('📄 Creating test document records with extraction results...')

    // Document 1: Lease with base year recovery
    const doc1ExtractionResult = {
      profile: {
        base_year: 2023,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: '0.0485',
        cap_type: 'cumulative',
        cap_rate: '0.05',
        admin_fee_percentage: '0.15',
        excluded_pools: [],
      },
      confidence_scores: {
        base_year: 0.98,
        pro_rata_share: 0.87,
        admin_fee_percent: 0.92,
        gross_up_target: 0.75,
        cap_type: 0.88,
        cap_rate: 0.91,
      },
      bounding_boxes: {
        base_year: {
          page: 1,
          left: 0.15,
          top: 0.35,
          width: 0.1,
          height: 0.02,
        },
        pro_rata_share: {
          page: 2,
          left: 0.25,
          top: 0.52,
          width: 0.12,
          height: 0.025,
        },
        cap_type: {
          page: 3,
          left: 0.18,
          top: 0.68,
          width: 0.2,
          height: 0.03,
        },
      },
    }

    const doc1File = uploadedFiles['suite-101-lease.pdf']
    const { error: doc1Error } = await adminClient.from('documents').insert({
      organization_id: organizationId,
      property_id: property.id,
      lease_id: lease1.id,
      filename: 'Suite_101_Lease_Agreement.pdf',
      storage_key: doc1File.path,
      storage_bucket: 'documents',
      content_type: 'application/pdf',
      file_size_bytes: doc1File.size,
      document_type: 'lease',
      status: 'ready_for_review',
      extraction_result: doc1ExtractionResult,
      processed_at: new Date().toISOString(),
    })

    if (doc1Error) {
      console.warn(`⚠️  Document 1 may already exist: ${doc1Error.message}`)
    } else {
      console.log('✅ Document 1 created (Suite 101 - Base Year)')
    }

    // Document 2: Lease with gross-up recovery
    const doc2ExtractionResult = {
      profile: {
        base_year: null,
        base_year_amount: null,
        gross_up_base_year: true,
        pro_rata_share: '0.062',
        cap_type: 'non_cumulative',
        cap_rate: '0.03',
        admin_fee_percentage: '0.12',
        excluded_pools: [],
      },
      confidence_scores: {
        pro_rata_share: 0.95,
        admin_fee_percent: 0.89,
        gross_up_target: 0.68,
        cap_type: 0.92,
        cap_rate: 0.94,
      },
      bounding_boxes: {
        pro_rata_share: {
          page: 1,
          left: 0.22,
          top: 0.44,
          width: 0.11,
          height: 0.022,
        },
        gross_up_target: {
          page: 2,
          left: 0.28,
          top: 0.59,
          width: 0.09,
          height: 0.02,
        },
      },
    }

    const doc2File = uploadedFiles['suite-205-lease.pdf']
    const { error: doc2Error } = await adminClient.from('documents').insert({
      organization_id: organizationId,
      property_id: property.id,
      lease_id: lease2.id,
      filename: 'Suite_205_Lease_Agreement.pdf',
      storage_key: doc2File.path,
      storage_bucket: 'documents',
      content_type: 'application/pdf',
      file_size_bytes: doc2File.size,
      document_type: 'lease',
      status: 'ready_for_review',
      extraction_result: doc2ExtractionResult,
      processed_at: new Date().toISOString(),
    })

    if (doc2Error) {
      console.warn(`⚠️  Document 2 may already exist: ${doc2Error.message}`)
    } else {
      console.log('✅ Document 2 created (Suite 205 - Gross Up)')
    }

    // Document 3: Lease with low confidence fields
    const doc3ExtractionResult = {
      profile: {
        base_year: 2022,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: '0.0325',
        cap_type: 'none',
        cap_rate: null,
        admin_fee_percentage: '0.15',
        excluded_pools: [],
      },
      confidence_scores: {
        base_year: 0.62, // Low confidence
        pro_rata_share: 0.58, // Low confidence
        admin_fee_percent: 0.91,
        gross_up_target: 0.88,
        cap_type: 0.65, // Low confidence
      },
      bounding_boxes: {
        base_year: {
          page: 1,
          left: 0.14,
          top: 0.38,
          width: 0.12,
          height: 0.025,
        },
        pro_rata_share: {
          page: 1,
          left: 0.26,
          top: 0.51,
          width: 0.1,
          height: 0.02,
        },
      },
    }

    const doc3File = uploadedFiles['suite-310-lease.pdf']
    const { error: doc3Error } = await adminClient.from('documents').insert({
      organization_id: organizationId,
      property_id: property.id,
      lease_id: lease3.id,
      filename: 'Suite_310_Lease_Agreement.pdf',
      storage_key: doc3File.path,
      storage_bucket: 'documents',
      content_type: 'application/pdf',
      file_size_bytes: doc3File.size,
      document_type: 'lease',
      status: 'ready_for_review',
      extraction_result: doc3ExtractionResult,
      processed_at: new Date().toISOString(),
    })

    if (doc3Error) {
      console.warn(`⚠️  Document 3 may already exist: ${doc3Error.message}`)
    } else {
      console.log('✅ Document 3 created (Suite 310 - Low Confidence)')
    }
    } // Close else block from line 232 (PDF uploads check)

    // Step 7: Create finalized reconciliation snapshots for 2023 and 2024
    console.log('📊 Creating reconciliation snapshots for year-over-year testing...')

    const snapshots = []

    // Create snapshots for each lease for years 2023 and 2024
    const leases = [lease1, lease2, lease3]
    const years = [2023, 2024]

    for (const year of years) {
      for (const lease of leases) {
        const snapshot = {
          property_id: property.id,
          lease_id: lease.id,
          period_start_date: `${year}-01-01`,
          period_end_date: `${year}-12-31`,
          status: 'finalized',

          // Realistic calculated values (varies by year for variance testing)
          total_operating_expenses: year === 2023 ? 50000.00 : 55000.00,
          grossed_up_expenses: year === 2023 ? 52631.58 : 57894.74,
          base_year_amount: 50000.00,
          tenant_share_before_cap: year === 2023 ? 2500.00 : 2750.00,
          tenant_share_after_cap: year === 2023 ? 2500.00 : 2750.00,
          admin_fee: year === 2023 ? 375.00 : 412.50,
          total_recovery: year === 2023 ? 2875.00 : 3162.50,

          // Calculation trace for audit
          calculation_trace: [
            calculationStep(
              1,
              'Operating Expenses',
              { year, recoverable_expenses: year === 2023 ? 50000.00 : 55000.00 },
              'sum_recoverable_operating_expenses',
              year === 2023 ? 50000.00 : 55000.00
            ),
            calculationStep(
              2,
              'Apply Gross-Up',
              {
                operating_expenses: year === 2023 ? 50000.00 : 55000.00,
                gross_up_factor: 1.0526,
              },
              'operating_expenses * gross_up_factor',
              year === 2023 ? 52631.58 : 57894.74
            ),
            calculationStep(
              3,
              'Calculate Tenant Share',
              {
                grossed_up_expenses: year === 2023 ? 52631.58 : 57894.74,
                pro_rata_share: 0.05,
              },
              'grossed_up_expenses * pro_rata_share',
              year === 2023 ? 2631.58 : 2894.74
            ),
            calculationStep(
              4,
              'Apply Base Year Deduction',
              {
                tenant_share: year === 2023 ? 2631.58 : 2894.74,
                base_year_amount: 50000.00,
              },
              'apply_base_year_deduction',
              year === 2023 ? 2631.58 : 2894.74
            ),
            calculationStep(
              5,
              'Apply Cap',
              {
                billable_amount: year === 2023 ? 2631.58 : 2894.74,
                cap_type: 'cumulative',
              },
              'apply_cap',
              year === 2023 ? 2500.00 : 2750.00
            ),
            calculationStep(
              6,
              'Add Admin Fee',
              {
                tenant_share_after_cap: year === 2023 ? 2500.00 : 2750.00,
                admin_fee_rate: 0.15,
              },
              'tenant_share_after_cap * admin_fee_rate',
              year === 2023 ? 375.00 : 412.50
            ),
            calculationStep(
              7,
              'Total Recovery',
              {
                tenant_share_after_cap: year === 2023 ? 2500.00 : 2750.00,
                admin_fee: year === 2023 ? 375.00 : 412.50,
              },
              'tenant_share_after_cap + admin_fee',
              year === 2023 ? 2875.00 : 3162.50
            ),
          ],

          finalized_at: `${year}-12-31T23:59:59Z`,
          finalized_by_user_id: user.id,
        }

        snapshots.push(snapshot)
      }
    }

    const { error: snapshotError } = await adminClient
      .from('reconciliation_snapshots')
      .insert(snapshots)

    if (snapshotError) {
      console.warn(`⚠️  Reconciliation snapshots may already exist: ${snapshotError.message}`)
    } else {
      console.log(`✅ Created ${snapshots.length} finalized reconciliation snapshots (2023-2024)`)
    }

    // Step 7b: Seed recovery profiles on leases for recovery profile persistence tests
    console.log('📋 Seeding recovery profiles on leases...')

    // Recovery configuration lives in the `recovery_profile` JSONB column, not
    // flat lease columns. There is no `gross_up_enabled`/`gross_up_target` on a
    // lease (gross-up is configured per expense pool); the lease profile carries
    // `gross_up_base_year` plus the pro-rata/cap/admin-fee terms.
    const { error: lease2ProfileError } = await adminClient
      .from('leases')
      .update({
        recovery_profile: {
          base_year: null,
          base_year_amount: null,
          gross_up_base_year: true,
          pro_rata_share: '0.062',
          cap_type: 'cumulative',
          cap_rate: '0.05',
          admin_fee_percentage: '0.15',
          excluded_pools: [],
        },
      })
      .eq('id', lease2.id)

    if (lease2ProfileError) {
      console.warn(`⚠️  Lease 2 profile warning: ${lease2ProfileError.message}`)
    } else {
      console.log('✅ Lease 2 (Tenant 205) recovery profile set')
    }

    // Step 7c: Seed 2024 billing error (leakage detection test data)
    // Tenant 101: correct share $22,000, billed $28,000, leakage $6,000
    console.log('💸 Seeding 2024 billing error data for leakage detection...')

    // The "correct" recovery is the reconciliation snapshot's computed total.
    // `billed_amount`/`correct_amount` are not columns on reconciliation_snapshots —
    // the actual billed figure lives in the `actual_billed_amounts` table, and
    // leakage = actual_billed − correct_recovery is derived from the two.
    const { error: correctRecoveryError } = await adminClient
      .from('reconciliation_snapshots')
      .update({
        total_recovery: 22000.00,
        tenant_share_after_cap: 22000.00,
      })
      .eq('property_id', TEST_PROPERTY_ID)
      .eq('lease_id', lease1.id)
      .eq('period_start_date', '2024-01-01')

    if (correctRecoveryError) {
      console.warn(`⚠️  Correct-recovery snapshot update warning: ${correctRecoveryError.message}`)
    }

    const { error: actualBilledError } = await adminClient
      .from('actual_billed_amounts')
      .insert({
        organization_id: organizationId,
        property_id: TEST_PROPERTY_ID,
        lease_id: lease1.id,
        tenant_name: 'Test Tenant 101',
        period_start_date: '2024-01-01',
        period_end_date: '2024-12-31',
        billed_amount: 28000.00,
        source_type: 'manual',
      })

    if (actualBilledError) {
      console.warn(`⚠️  Actual billed amount seed warning: ${actualBilledError.message}`)
    } else {
      console.log('✅ 2024 billing error seeded: billed $28,000 vs correct $22,000 = $6,000 leakage')
    }

    // Step 7d: Create non-finalized (draft) snapshots for 2025 to support editable-cell and finalize tests
    console.log('📊 Creating draft reconciliation snapshots for year 2025...')

    // 2025 GL dataset (matches test-gl-2025.csv):
    //   Recoverable pool: $450,000 | Actual occupancy: 90% | Gross-up target: 95%
    //   Grossed-up pool: $473,684.21
    //   Tenant 101 (pro-rata 0.0485): $22,973.68
    //   Tenant 205 (pro-rata 0.0620): $29,368.42  [cumulative cap 5%]
    //   Tenant 310 (pro-rata 0.0325): $15,394.74
    const draftSnapshots = [
      // Lease 1 (Tenant 101) - 2025 draft
      {
        property_id: property.id,
        lease_id: lease1.id,
        period_start_date: '2025-01-01',
        period_end_date: '2025-12-31',
        status: 'draft',
        total_operating_expenses: 500000.00,
        grossed_up_expenses: 473684.21,
        // No base-year stop for these gross-up leases; column is NOT NULL so seed 0.
        base_year_amount: 0.00,
        tenant_share_before_cap: 22973.68,
        tenant_share_after_cap: 22973.68,
        admin_fee: 0.00,
        total_recovery: 22973.68,
        calculation_trace: [
          calculationStep(
            1,
            'CAM Pool',
            { total_cam_expenses: 500000.00 },
            'sum_cam_expenses',
            500000.00
          ),
          calculationStep(
            2,
            'Exclude Non-Recoverable',
            { cam_pool: 500000.00, non_recoverable_expenses: 50000.00 },
            'cam_pool - non_recoverable_expenses',
            450000.00
          ),
          calculationStep(
            3,
            'Apply Gross-Up',
            { recoverable_pool: 450000.00, occupancy: 0.90, gross_up_target: 0.95 },
            'recoverable_pool / occupancy * gross_up_target',
            473684.21
          ),
          calculationStep(
            4,
            'Calculate Tenant Share',
            { grossed_up_expenses: 473684.21, pro_rata_share: 0.0485 },
            'grossed_up_expenses * pro_rata_share',
            22973.68
          ),
          calculationStep(
            5,
            'Total Recovery',
            { tenant_share_after_cap: 22973.68, admin_fee: 0.00 },
            'tenant_share_after_cap + admin_fee',
            22973.68
          ),
        ],
        finalized_at: null,
        finalized_by_user_id: null,
      },
      // Lease 2 (Tenant 205) - 2025 draft [cumulative cap 5%]
      {
        property_id: property.id,
        lease_id: lease2.id,
        period_start_date: '2025-01-01',
        period_end_date: '2025-12-31',
        status: 'draft',
        total_operating_expenses: 500000.00,
        grossed_up_expenses: 473684.21,
        // No base-year stop for these gross-up leases; column is NOT NULL so seed 0.
        base_year_amount: 0.00,
        tenant_share_before_cap: 29368.42,
        tenant_share_after_cap: 29368.42,
        admin_fee: 0.00,
        total_recovery: 29368.42,
        calculation_trace: [
          calculationStep(
            1,
            'CAM Pool',
            { total_cam_expenses: 500000.00 },
            'sum_cam_expenses',
            500000.00
          ),
          calculationStep(
            2,
            'Exclude Non-Recoverable',
            { cam_pool: 500000.00, non_recoverable_expenses: 50000.00 },
            'cam_pool - non_recoverable_expenses',
            450000.00
          ),
          calculationStep(
            3,
            'Apply Gross-Up',
            { recoverable_pool: 450000.00, occupancy: 0.90, gross_up_target: 0.95 },
            'recoverable_pool / occupancy * gross_up_target',
            473684.21
          ),
          calculationStep(
            4,
            'Calculate Tenant Share',
            { grossed_up_expenses: 473684.21, pro_rata_share: 0.0620 },
            'grossed_up_expenses * pro_rata_share',
            29368.42
          ),
          calculationStep(
            5,
            'Apply Cap',
            { tenant_share_before_cap: 29368.42, cap_type: 'cumulative', cap_rate: 0.05 },
            'apply_cap',
            29368.42
          ),
          calculationStep(
            6,
            'Total Recovery',
            { tenant_share_after_cap: 29368.42, admin_fee: 0.00 },
            'tenant_share_after_cap + admin_fee',
            29368.42
          ),
        ],
        finalized_at: null,
        finalized_by_user_id: null,
      },
      // Lease 3 (Tenant 310) - 2025 draft
      {
        property_id: property.id,
        lease_id: lease3.id,
        period_start_date: '2025-01-01',
        period_end_date: '2025-12-31',
        status: 'draft',
        total_operating_expenses: 500000.00,
        grossed_up_expenses: 473684.21,
        // No base-year stop for these gross-up leases; column is NOT NULL so seed 0.
        base_year_amount: 0.00,
        tenant_share_before_cap: 15394.74,
        tenant_share_after_cap: 15394.74,
        admin_fee: 0.00,
        total_recovery: 15394.74,
        calculation_trace: [
          calculationStep(
            1,
            'CAM Pool',
            { total_cam_expenses: 500000.00 },
            'sum_cam_expenses',
            500000.00
          ),
          calculationStep(
            2,
            'Exclude Non-Recoverable',
            { cam_pool: 500000.00, non_recoverable_expenses: 50000.00 },
            'cam_pool - non_recoverable_expenses',
            450000.00
          ),
          calculationStep(
            3,
            'Apply Gross-Up',
            { recoverable_pool: 450000.00, occupancy: 0.90, gross_up_target: 0.95 },
            'recoverable_pool / occupancy * gross_up_target',
            473684.21
          ),
          calculationStep(
            4,
            'Calculate Tenant Share',
            { grossed_up_expenses: 473684.21, pro_rata_share: 0.0325 },
            'grossed_up_expenses * pro_rata_share',
            15394.74
          ),
          calculationStep(
            5,
            'Total Recovery',
            { tenant_share_after_cap: 15394.74, admin_fee: 0.00 },
            'tenant_share_after_cap + admin_fee',
            15394.74
          ),
        ],
        finalized_at: null,
        finalized_by_user_id: null,
      },
    ]

    const { error: draftSnapshotError } = await adminClient
      .from('reconciliation_snapshots')
      .insert(draftSnapshots)

    if (draftSnapshotError) {
      console.warn(`⚠️  Draft snapshot warning: ${draftSnapshotError.message}`)
    } else {
      console.log(`✅ Created ${draftSnapshots.length} draft reconciliation snapshots (2025)`)
    }

    // Step 8: Create E2E tenant user and seed disputes
    console.log('👤 Creating E2E tenant user...')

    const TEST_TENANT_EMAIL = 'e2e-tenant@capveri.com'
    const TEST_TENANT_PASSWORD = 'TestPassword123!'

    const { data: tenantAuthList } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    let tenantAuthUser = tenantAuthList?.users?.find((u: User) => u.email === TEST_TENANT_EMAIL)
    let tenantAuthWasCreated = false

    if (!tenantAuthUser) {
      const { data: newTenantAuth, error: tenantAuthError } =
        await adminClient.auth.admin.createUser({
          email: TEST_TENANT_EMAIL,
          password: TEST_TENANT_PASSWORD,
          email_confirm: true,
        })
      if (tenantAuthError) {
        if (tenantAuthError.message.toLowerCase().includes('already been registered')) {
          const { data: refreshedTenantAuthList } = await adminClient.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          })
          tenantAuthUser =
            refreshedTenantAuthList?.users?.find((u: User) => u.email === TEST_TENANT_EMAIL)
        }
        if (!tenantAuthUser) {
          throw new Error(`Failed to create tenant auth user: ${tenantAuthError.message}`)
        }
      }
      if (!tenantAuthError) {
        tenantAuthUser = newTenantAuth.user
        tenantAuthWasCreated = true
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      console.log(
        tenantAuthWasCreated
          ? `✅ Tenant auth user created: ${tenantAuthUser!.id}`
          : `✅ Tenant auth user found after create conflict: ${tenantAuthUser!.id}`
      )
    } else {
      console.log(`✅ Tenant auth user already exists: ${tenantAuthUser.id}`)
    }

    const { error: tenantUpdateError } = await adminClient.auth.admin.updateUserById(
      tenantAuthUser!.id,
      {
        password: TEST_TENANT_PASSWORD,
        email_confirm: true,
      }
    )
    if (tenantUpdateError) {
      throw new Error(`Failed to update tenant auth user: ${tenantUpdateError.message}`)
    }

    const { data: tenantPublicUser, error: tenantPublicError } = await adminClient
      .from('users')
      .select('id')
      .eq('id', tenantAuthUser!.id)
      .single()

    if (tenantPublicError || !tenantPublicUser) {
      throw new Error(`Tenant public user not found: ${tenantPublicError?.message}`)
    }
    console.log(`✅ Tenant public user found: ${tenantPublicUser.id}`)

    // The signup trigger defaults public.users.role to 'owner'. The tenant
    // portal login gate requires role='tenant', so demote the seeded tenant
    // here; otherwise the tenant portal cannot be exercised on a fresh seed.
    const { error: tenantRoleError } = await adminClient
      .from('users')
      .update({ role: 'tenant' })
      .eq('id', tenantPublicUser.id)
    if (tenantRoleError) {
      throw new Error(`Failed to set tenant role: ${tenantRoleError.message}`)
    }
    console.log('✅ Tenant public user role set to tenant')

    const { data: existingTenantUser } = await adminClient
      .from('tenant_users')
      .select('id')
      .eq('user_id', tenantPublicUser.id)
      .maybeSingle()

    if (existingTenantUser) {
      await adminClient.from('disputes').delete().eq('tenant_user_id', existingTenantUser.id)
      await adminClient
        .from('tenant_lease_links')
        .delete()
        .eq('tenant_user_id', existingTenantUser.id)
      await adminClient.from('tenant_users').delete().eq('id', existingTenantUser.id)
    }

    const { data: tenantUser, error: tenantUserError } = await adminClient
      .from('tenant_users')
      .insert({
        user_id: tenantPublicUser.id,
        organization_id: organizationId,
        contact_name: 'E2E Tenant User',
        contact_email: TEST_TENANT_EMAIL,
      })
      .select()
      .single()

    if (tenantUserError) {
      throw new Error(`Failed to create tenant_users record: ${tenantUserError.message}`)
    }
    console.log(`✅ tenant_users record created: ${tenantUser.id}`)

    const { error: linkError } = await adminClient.from('tenant_lease_links').insert([
      { tenant_user_id: tenantUser.id, lease_id: lease1.id },
      { tenant_user_id: tenantUser.id, lease_id: lease2.id },
    ])
    if (linkError) {
      console.warn(`⚠️  Tenant lease link warning: ${linkError.message}`)
    } else {
      console.log('✅ Tenant linked to lease1 and lease2')
    }

    const { data: seededSnapshots } = await adminClient
      .from('reconciliation_snapshots')
      .select('id')
      .eq('property_id', TEST_PROPERTY_ID)
      .limit(2)

    if (seededSnapshots && seededSnapshots.length >= 2) {
      const disputes = [
        {
          tenant_user_id: tenantUser.id,
          statement_id: seededSnapshots[0].id,
          organization_id: organizationId,
          category: 'calculation_error',
          status: 'open',
          description:
            'The CAM charges for Q3 appear excessive. Please review the HVAC allocation methodology.',
        },
        {
          tenant_user_id: tenantUser.id,
          statement_id: seededSnapshots[1].id,
          organization_id: organizationId,
          category: 'billing_question',
          status: 'under_review',
          description:
            'Management fee should be excluded per Section 7.3 of the lease agreement.',
        },
      ]
      const { error: disputeError } = await adminClient.from('disputes').insert(disputes)
      if (disputeError) {
        console.warn(`⚠️  Dispute seed warning: ${disputeError.message}`)
      } else {
        console.log(`✅ Seeded ${disputes.length} test disputes`)
      }
    } else {
      console.warn('⚠️  Not enough snapshots to seed disputes')
    }

    // Step 9: Seed GL data for YoY testing
    await seedGLData(organizationId, TEST_PROPERTY_ID, adminClient)

    console.log('✅ Test data seeding complete!')
  } catch (error) {
    console.error('❌ Failed to seed test data:', error)
    throw error
  }
}

// Export for use as Playwright globalSetup or standalone script
export default seedTestData

// Allow running as standalone script (ES module compatible check)
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTestData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
