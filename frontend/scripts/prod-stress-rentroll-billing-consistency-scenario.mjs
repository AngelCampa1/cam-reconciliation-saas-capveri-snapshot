// Production E2E stress scenario: cross-surface data consistency for
// rent-roll import -> property/units/leases -> actual billed -> reconciliation
// variance -> landlord-facing list/detail/leakage/comparison surfaces.
//
// Edge cases exercised:
// - tenant names with unicode / apostrophes / commas (byte-exact round trip)
// - a unit with 0 sqft (row-level exclusion probe: preview warns, import skips the row)
// - an already-expired lease (imported as-is; excluded from recon + billing match)
// - a month-to-month row (no lease end date -> occupied unit, no lease row)
// - overlapping lease dates on one unit (duplicate unit number -> skipped w/ warning)
// - post-finalize billing mutation guard (409 actual_billed_period_finalized)
// - penny-exact variance identities across snapshots / actual-billed / leakage / comparison
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')

const env = {
  ...(await readEnv(resolve(repoRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.production.local'))),
}

const required = [
  'E2E_PROD_EMAIL',
  'E2E_PROD_PASSWORD',
  'E2E_PROD_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-stress-rentroll-billing-consistency-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  observations: [],
  cleanup: [],
  auth: {},
}

let token
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((check) => check.ok)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Consistency Tower ${suffix}`
  const probePropertyName = `[PROD-TEST] ZeroSqft Probe ${suffix}`
  const obrienName = `[PROD-TEST] O'Brien & Sons, LLC ${suffix}`
  const cafeName = `[PROD-TEST] Café München GmbH ${suffix}`
  const mtmName = `[PROD-TEST] MTM Traders ${suffix}`
  const dupName = `[PROD-TEST] Overlap Duplicate ${suffix}`
  const ghostName = `[PROD-TEST] Ghost Billing ${suffix}`
  const periodStart = '2026-01-01'
  const periodEnd = '2026-12-31'
  const created = {
    propertyId: null,
    probePropertyId: null,
    unitIds: [],
    leaseIds: [],
    poolIds: [],
    mappingIds: [],
    batchId: null,
    jobId: null,
    snapshotIds: [],
    actualBilledIds: [],
  }
  report.generated = {
    suffix,
    propertyName,
    probePropertyName,
    tenantNames: { obrienName, cafeName, mtmName, dupName, ghostName },
    periodStart,
    periodEnd,
    created,
  }
  await writeFixture(`rent-roll-main-${suffix}.csv`, mainRentRollCsv())
  await writeFixture(`rent-roll-zero-sqft-${suffix}.csv`, zeroSqftCsv())

  function mainRentRollCsv() {
    return [
      'Yardi Voyager Rent Roll',
      `Property: ${propertyName}`,
      'Address: 742 Consistency Loop, Austin, TX 78702',
      '',
      'Unit Number,Rentable SF,Usable SF,Floor,Tenant,Lease Start,Lease End,Monthly Rent,CAM %',
      csvRow(['100', '4,000.00', '3,600.00', '1', obrienName, '01/01/2026', '12/31/2030', '$10,000.00', '25%']),
      csvRow(['200', '2000', '1800', '2', cafeName, '2020-01-01', '2024-12-31', '8000', '12.5%']),
      csvRow(['300', '2000', '1800', '3', mtmName, '03/01/2026', '', '7000', '10%']),
      csvRow(['300', '1200', '1000', '3', dupName, '04/01/2026', '03/31/2031', '5000', '8%']),
      '500,1000,900,5,,,,0,',
      'Total,9000,8100,,,,,,',
    ].join('\n')
  }

  function zeroSqftCsv() {
    return [
      'Yardi Voyager Rent Roll',
      `Property: ${probePropertyName}`,
      'Address: 743 Consistency Loop, Austin, TX 78702',
      '',
      'Unit Number,Rentable SF,Usable SF,Floor,Tenant,Lease Start,Lease End,Monthly Rent,CAM %',
      csvRow(['Z100', '0', '0', '1', `[PROD-TEST] Zero Sqft LLC ${suffix}`, '01/01/2026', '12/31/2030', '1000', '5%']),
      csvRow(['Z200', '1500', '1350', '1', `[PROD-TEST] Zero Neighbor LLC ${suffix}`, '01/01/2026', '12/31/2030', '2000', '9%']),
    ].join('\n')
  }

  try {
    // --- Probe: zero-sqft unit -------------------------------------------
    const probePreview = await uploadRentRoll('/api/v1/rent-roll/preview', {
      fileName: `zero-sqft-probe-${suffix}.csv`,
      csv: zeroSqftCsv(),
      status: 200,
    })
    check(
      'zero-sqft probe: preview excludes the 0.00 sqft row with an error + warning',
      {
        success: probePreview.success,
        row_count: probePreview.row_count,
        error_count: probePreview.error_count,
        zero_unit_present: probePreview.units.some(
          (u) => u.unit_number === 'Z100'
        ),
        warned: (probePreview.warnings ?? []).some((w) =>
          w.includes('Rentable sqft must be positive, got 0.00')
        ),
      },
      {
        success: true,
        row_count: 1,
        error_count: 1,
        zero_unit_present: false,
        warned: true,
      }
    )

    const probeImport = await uploadRentRollRaw('/api/v1/rent-roll/import', {
      fileName: `zero-sqft-probe-${suffix}.csv`,
      csv: zeroSqftCsv(),
      fields: {
        property_name: probePropertyName,
        address: '743 Consistency Loop',
        city: 'Austin',
        state: 'TX',
        postal_code: '78702',
      },
    })
    if (probeImport.status === 201) {
      created.probePropertyId = probeImport.body?.property_id ?? null
    }
    check(
      'zero-sqft probe: import succeeds, excluding only the 0-sqft row',
      { status: probeImport.status },
      { status: 201 }
    )
    check(
      'zero-sqft probe: property persisted with only the valid unit',
      { persisted: await propertyNameExists(probePropertyName) },
      { persisted: true }
    )
    observe(
      'zero-sqft row-level rejection (fixed)',
      'Parser now excludes non-positive-sqft rows per row (error_count + warning), matching the Python oracle; import proceeds with the remaining valid rows instead of a whole-file 400 rollback.'
    )

    // --- Main import ------------------------------------------------------
    const preview = await uploadRentRoll('/api/v1/rent-roll/preview', {
      fileName: `rent-roll-consistency-${suffix}.csv`,
      csv: mainRentRollCsv(),
      status: 200,
    })
    check(
      'preview parses edge-case rows: unicode names byte-exact, dup skipped, MTM no end date',
      {
        success: preview.success,
        source_system: preview.source_system,
        property_name: preview.property_metadata.name,
        row_count: preview.row_count,
        error_count: preview.error_count,
        total_units: preview.total_units,
        occupied_units: preview.occupied_units,
        unit_numbers: preview.units.map((u) => u.unit_number),
        tenant_names: preview.units.map((u) => u.tenant_name),
        obrien_fields: pick(
          preview.units.find((u) => u.unit_number === '100') ?? {},
          ['rentable_sqft', 'usable_sqft', 'lease_start', 'lease_end', 'cam_share']
        ),
        cafe_fields: pick(
          preview.units.find((u) => u.unit_number === '200') ?? {},
          ['lease_start', 'lease_end', 'cam_share']
        ),
        mtm_fields: pick(
          preview.units.find((u) => u.unit_number === '300') ?? {},
          ['lease_start', 'lease_end', 'cam_share']
        ),
        has_duplicate_warning: preview.warnings.some((w) =>
          w.includes("Duplicate unit number '300'")
        ),
      },
      {
        success: true,
        source_system: 'yardi_rent_roll',
        property_name: propertyName,
        row_count: 4,
        error_count: 0,
        total_units: 4,
        occupied_units: 3,
        unit_numbers: ['100', '200', '300', '500'],
        tenant_names: [obrienName, cafeName, mtmName, null],
        obrien_fields: {
          rentable_sqft: '4000.00',
          usable_sqft: '3600.00',
          lease_start: '2026-01-01',
          lease_end: '2030-12-31',
          cam_share: '0.2500',
        },
        cafe_fields: {
          lease_start: '2020-01-01',
          lease_end: '2024-12-31',
          cam_share: '0.1250',
        },
        mtm_fields: {
          lease_start: '2026-03-01',
          lease_end: null,
          cam_share: '0.1000',
        },
        has_duplicate_warning: true,
      }
    )

    const imported = await uploadRentRoll('/api/v1/rent-roll/import', {
      fileName: `rent-roll-consistency-${suffix}.csv`,
      csv: mainRentRollCsv(),
      status: 201,
      fields: {
        property_name: propertyName,
        address: '742 Consistency Loop',
        city: 'Austin',
        state: 'TX',
        postal_code: '78702',
      },
    })
    created.propertyId = imported.property_id
    check(
      'import creates 4 units and 2 leases (MTM row yields occupied unit with no lease)',
      {
        success: imported.success,
        property_name: imported.property_name,
        units_created: imported.units_created,
        leases_created: imported.leases_created,
      },
      {
        success: true,
        property_name: propertyName,
        units_created: 4,
        leases_created: 2,
      }
    )
    observe(
      'month-to-month row creates no lease',
      'Rent-roll rows with a tenant + start date but no end date create an occupied unit but NO lease (importRentRoll requires tenant_name && lease_start && lease_end). Month-to-month tenants silently drop out of reconciliation. By-design per cloudflare-backend/src/adapters/db/rent-roll.ts:130.'
    )

    const property = await expectJson(
      `/api/v1/properties/${imported.property_id}`,
      { status: 200 }
    )
    check(
      'property detail totals are penny-exact sums of imported unit sqft',
      pick(property, [
        'name',
        'address_line1',
        'city',
        'state',
        'postal_code',
        'total_rentable_sqft',
        'total_usable_sqft',
        'common_area_sqft',
        'target_occupancy',
      ]),
      {
        name: propertyName,
        address_line1: '742 Consistency Loop',
        city: 'Austin',
        state: 'TX',
        postal_code: '78702',
        total_rentable_sqft: '9000.00',
        total_usable_sqft: '8100.00',
        common_area_sqft: '900.00',
        target_occupancy: '0.9500',
      }
    )

    const units = await expectJson(
      `/api/v1/properties/${imported.property_id}/units?skip=0&limit=20`,
      { status: 200 }
    )
    created.unitIds.push(...units.data.map((u) => u.id))
    check(
      'unit list round-trips sqft/floor/status exactly',
      units.data
        .map((u) =>
          pick(u, ['unit_number', 'rentable_sqft', 'usable_sqft', 'floor', 'status'])
        )
        .sort((a, b) => a.unit_number.localeCompare(b.unit_number)),
      [
        { unit_number: '100', rentable_sqft: '4000.00', usable_sqft: '3600.00', floor: 1, status: 'occupied' },
        { unit_number: '200', rentable_sqft: '2000.00', usable_sqft: '1800.00', floor: 2, status: 'occupied' },
        { unit_number: '300', rentable_sqft: '2000.00', usable_sqft: '1800.00', floor: 3, status: 'occupied' },
        { unit_number: '500', rentable_sqft: '1000.00', usable_sqft: '900.00', floor: 5, status: 'vacant' },
      ]
    )
    // property total vs sum of unit rows (cross-surface arithmetic)
    check(
      'property total_rentable_sqft equals the sum of unit list rentable_sqft',
      {
        property_total: cents(property.total_rentable_sqft),
        unit_sum: sumCents(units.data.map((u) => u.rentable_sqft)),
      },
      {
        property_total: cents('9000.00'),
        unit_sum: cents('9000.00'),
      }
    )

    const leases = await expectJson(
      `/api/v1/leases?property_id=${imported.property_id}&skip=0&limit=20`,
      { status: 200 }
    )
    created.leaseIds.push(...leases.data.map((l) => l.id))
    const obrienLease = leases.data.find((l) => l.tenant_name === obrienName)
    const cafeLease = leases.data.find((l) => l.tenant_name === cafeName)
    check(
      'lease list round-trips byte-exact unicode/apostrophe/comma names, dates, shares',
      leases.data
        .map((l) => ({
          tenant_name: l.tenant_name,
          start_date: String(l.start_date).slice(0, 10),
          end_date: String(l.end_date).slice(0, 10),
          status: l.status,
          pro_rata_share: l.recovery_profile?.pro_rata_share,
          cap_type: l.recovery_profile?.cap_type,
          admin_fee_percentage: l.recovery_profile?.admin_fee_percentage,
        }))
        .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
      [
        {
          tenant_name: cafeName,
          start_date: '2020-01-01',
          end_date: '2024-12-31',
          status: 'active',
          pro_rata_share: '0.1250',
          cap_type: 'none',
          admin_fee_percentage: '0',
        },
        {
          tenant_name: obrienName,
          start_date: '2026-01-01',
          end_date: '2030-12-31',
          status: 'active',
          pro_rata_share: '0.2500',
          cap_type: 'none',
          admin_fee_percentage: '0',
        },
      ].sort((a, b) => a.tenant_name.localeCompare(b.tenant_name))
    )
    observe(
      'expired lease imported with status=active',
      `The Café lease ended 2024-12-31 (before import day 2026) but is stored and listed with status 'active' (importRentRoll hardcodes status "active", cloudflare-backend/src/adapters/db/rent-roll.ts:149). Downstream recon/billing exclude it by dates, so the math stays correct, but the landlord-facing lease list shows an expired lease as active.`
    )
    if (!obrienLease || !cafeLease) {
      throw new Error(
        `Expected imported leases missing: ${JSON.stringify(leases.data).slice(0, 400)}`
      )
    }

    // list vs detail parity for each lease
    for (const listRow of leases.data) {
      const detail = await expectJson(`/api/v1/leases/${listRow.id}`, {
        status: 200,
      })
      check(
        `lease list row equals lease detail for ${listRow.tenant_name.slice(0, 40)}`,
        normalizeLease(listRow),
        normalizeLease(detail)
      )
    }

    // list vs detail parity for each unit
    for (const listRow of units.data) {
      const detail = await expectJson(
        `/api/v1/properties/${imported.property_id}/units/${listRow.id}`,
        { status: 200 }
      )
      check(
        `unit list row equals unit detail for unit ${listRow.unit_number}`,
        pick(listRow, ['id', 'unit_number', 'rentable_sqft', 'usable_sqft', 'floor', 'status']),
        pick(detail, ['id', 'unit_number', 'rentable_sqft', 'usable_sqft', 'floor', 'status'])
      )
    }

    // --- Expenses + reconciliation ---------------------------------------
    const pool = await expectJson(
      `/api/v1/properties/${imported.property_id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: `[PROD-TEST] Consistency Pool ${suffix}`,
          pool_type: 'operating',
          is_gross_up_applicable: false,
          description: 'Production E2E disposable consistency pool',
        },
      }
    )
    created.poolIds.push(pool.id)
    const mapping = await expectJson(
      `/api/v1/properties/${imported.property_id}/pool-mappings`,
      {
        method: 'POST',
        status: 201,
        body: {
          expense_pool_id: pool.id,
          gl_account_pattern: '61*',
          allocation_percentage: '1',
          priority: 10,
        },
      }
    )
    created.mappingIds.push(mapping.id)

    const glUpload = await uploadGlCsv({
      propertyId: imported.property_id,
      fileName: `gl-consistency-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Operating Repairs,01/20/2026,7333.33,OpsCo,Consistency repairs',
        '6100,Operating Repairs,07/20/2026,4666.67,OpsCo,Consistency services',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = glUpload.batch_id
    check(
      'GL upload ingests 12000.00 of operating expense cleanly',
      {
        source_system: glUpload.source_system,
        row_count: glUpload.row_count,
        error_count: glUpload.error_count,
      },
      { source_system: 'yardi', row_count: 2, error_count: 0 }
    )

    const job = await expectJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      status: 202,
      body: {
        property_id: imported.property_id,
        period_start: periodStart,
        period_end: periodEnd,
        force_recalculate: true,
      },
    })
    created.jobId = job.job_id
    const completedJob = await waitForJob(job.job_id)
    created.snapshotIds.push(...completedJob.snapshot_ids)
    check(
      'reconciliation processes only the period-overlapping lease (expired lease excluded)',
      {
        status: completedJob.status,
        processed_leases: completedJob.processed_leases,
        total_leases: completedJob.total_leases,
        snapshot_count: completedJob.snapshot_ids.length,
        potential_recovery_total: normalizeMoney(
          completedJob.potential_recovery_total
        ),
      },
      {
        status: 'completed',
        processed_leases: 1,
        total_leases: 1,
        snapshot_count: 1,
        potential_recovery_total: '3000.00',
      }
    )

    const snapshotDetail = await expectJson(
      `/api/v1/reconciliation/snapshots/${completedJob.snapshot_ids[0]}?include_trace=false`,
      { status: 200 }
    )
    check(
      'snapshot math is deterministic: 12000.00 x 0.2500 = 3000.00, no gross-up/cap/admin',
      {
        lease_id: snapshotDetail.lease_id,
        status: snapshotDetail.status,
        total_operating_expenses: normalizeMoney(
          snapshotDetail.total_operating_expenses
        ),
        grossed_up_expenses: normalizeMoney(snapshotDetail.grossed_up_expenses),
        tenant_share_after_cap: normalizeMoney(
          snapshotDetail.tenant_share_after_cap
        ),
        total_recovery: normalizeMoney(snapshotDetail.total_recovery),
      },
      {
        lease_id: obrienLease.id,
        status: 'draft',
        total_operating_expenses: '12000.00',
        grossed_up_expenses: '12000.00',
        tenant_share_after_cap: '3000.00',
        total_recovery: '3000.00',
      }
    )

    const snapshotList = await expectJson(
      `/api/v1/reconciliation/snapshots?property_id=${imported.property_id}&period_start=${periodStart}&period_end=${periodEnd}&page=1&size=10`,
      { status: 200 }
    )
    const snapshotListRow = snapshotList.items.find(
      (item) => item.id === snapshotDetail.id
    )
    if (!snapshotListRow) {
      throw new Error(
        `Snapshot list does not contain snapshot ${snapshotDetail.id}: ${JSON.stringify(snapshotList).slice(0, 400)}`
      )
    }
    check(
      'snapshot list row equals snapshot detail on every shared field',
      sharedSubset(snapshotListRow, snapshotDetail),
      sharedSubset(snapshotDetail, snapshotListRow)
    )

    // --- Actual billed (pre-finalize: mutations allowed) -------------------
    const billingUpload = await uploadBillingCsv({
      propertyId: imported.property_id,
      periodStart,
      periodEnd,
      fileName: `billing-consistency-${suffix}.csv`,
      csv: [
        'Tenant,Suite,Billed Amount',
        csvRow([obrienName, '100', '2750.25']),
        csvRow([cafeName, '200', '500.00']),
        csvRow([ghostName, '700', '400.13']),
      ].join('\n'),
    })
    created.actualBilledIds.push(...billingUpload.items.map((i) => i.id))
    const cafeBilledRow = billingUpload.items.find(
      (i) => i.tenant_name === cafeName
    )
    check(
      'billing upload matches active lease only; expired-lease and ghost rows need review',
      {
        source_type: billingUpload.source_type,
        total_billed: normalizeMoney(billingUpload.total_billed),
        row_count: billingUpload.row_count,
        matched_row_count: billingUpload.matched_row_count,
        unmatched_row_count: billingUpload.unmatched_row_count,
        items: billingUpload.items
          .map((i) => ({
            tenant_name: i.tenant_name,
            billed_amount: normalizeMoney(i.billed_amount),
            suite: i.suite,
            lease_id: i.lease_id,
            match_status: i.match_status,
          }))
          .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
      },
      {
        source_type: 'csv_import',
        total_billed: '3650.38',
        row_count: 3,
        matched_row_count: 1,
        unmatched_row_count: 2,
        items: [
          {
            tenant_name: obrienName,
            billed_amount: '2750.25',
            suite: '100',
            lease_id: obrienLease.id,
            match_status: 'matched',
          },
          {
            tenant_name: cafeName,
            billed_amount: '500.00',
            suite: '200',
            lease_id: null,
            match_status: 'needs_review',
          },
          {
            tenant_name: ghostName,
            billed_amount: '400.13',
            suite: '700',
            lease_id: null,
            match_status: 'needs_review',
          },
        ].sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
      }
    )
    observe(
      'expired lease does not match billing rows',
      'The billing matcher only indexes leases overlapping the billing period (actual-billed.ts resolveLeaseIdsForRows filters start_date <= period_end AND end_date >= period_start), so a billed row for the expired tenant lands in needs_review even though the lease + suite exist. Consistent with recon exclusion.'
    )

    // rematch probe: binding a billed row to the expired lease must be rejected
    const rematch = await rawJson('/api/v1/actual-billed/matches', {
      method: 'PUT',
      body: {
        property_id: imported.property_id,
        period_start: periodStart,
        period_end: periodEnd,
        matches: [
          { actual_billed_id: cafeBilledRow.id, lease_id: cafeLease.id },
        ],
      },
    })
    check(
      'rematching a billed row to the expired (non-overlapping) lease is rejected',
      {
        status: rematch.status,
        mentions_invalid_match: rematch.text.includes('invalid_billing_match'),
      },
      { status: 400, mentions_invalid_match: true }
    )

    const billedList = await expectJson(
      `/api/v1/actual-billed/${imported.property_id}?period_start=${periodStart}&period_end=${periodEnd}`,
      { status: 200 }
    )
    check(
      'billed list equals upload response (ids, byte-exact names, cents-exact amounts)',
      {
        total_billed: normalizeMoney(billedList.total_billed),
        total_equals_item_sum:
          cents(billedList.total_billed) ===
          sumCents(billedList.items.map((i) => i.billed_amount)),
        items: billedList.items
          .map((i) => ({
            id: i.id,
            tenant_name: i.tenant_name,
            billed_amount: normalizeMoney(i.billed_amount),
            lease_id: i.lease_id,
          }))
          .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
      },
      {
        total_billed: '3650.38',
        total_equals_item_sum: true,
        items: billingUpload.items
          .map((i) => ({
            id: i.id,
            tenant_name: i.tenant_name,
            billed_amount: normalizeMoney(i.billed_amount),
            lease_id: i.lease_id,
          }))
          .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
      }
    )

    // --- Finalize ----------------------------------------------------------
    const finalize = await expectJson(
      '/api/v1/reconciliation/snapshots/finalize-batch',
      {
        method: 'POST',
        status: 200,
        body: {
          property_id: imported.property_id,
          period_start: periodStart,
          period_end: periodEnd,
        },
      }
    )
    check(
      'batch finalize promotes the single draft snapshot',
      {
        total_attempted: finalize.total_attempted,
        total_succeeded: finalize.total_succeeded,
        total_failed: finalize.total_failed,
      },
      { total_attempted: 1, total_succeeded: 1, total_failed: 0 }
    )

    // post-finalize guard: billing mutations for the period must 409
    const postFinalizeUpload = await uploadBillingCsvRaw({
      propertyId: imported.property_id,
      periodStart,
      periodEnd,
      fileName: `billing-post-finalize-${suffix}.csv`,
      csv: ['Tenant,Suite,Billed Amount', csvRow([ghostName, '700', '1.00'])].join(
        '\n'
      ),
    })
    check(
      'billing upload after finalization is blocked with 409 actual_billed_period_finalized',
      {
        status: postFinalizeUpload.status,
        code_present: postFinalizeUpload.text.includes(
          'actual_billed_period_finalized'
        ),
      },
      { status: 409, code_present: true }
    )

    // --- Landlord-facing variance surfaces --------------------------------
    const leakage = await expectJson(
      `/api/v1/leakage/${imported.property_id}?period_start=${periodStart}&period_end=${periodEnd}&include_drafts=false`,
      { status: 200 }
    )
    const leakageBreakdown = [...leakage.breakdown].sort((a, b) =>
      a.tenant_name.localeCompare(b.tenant_name)
    )
    check(
      'leakage totals: calculated=3000.00, billed=3650.38, leakage=calculated-billed penny-exact',
      {
        capveri_calculated: normalizeMoney(leakage.capveri_calculated),
        actual_billed: normalizeMoney(leakage.actual_billed),
        leakage: normalizeMoney(leakage.leakage),
        leakage_identity:
          cents(leakage.leakage) ===
          cents(leakage.capveri_calculated) - cents(leakage.actual_billed),
        calculated_equals_snapshot_sum:
          cents(leakage.capveri_calculated) ===
          cents(snapshotDetail.total_recovery),
        billed_equals_billing_list:
          cents(leakage.actual_billed) === cents(billedList.total_billed),
        has_reconciliation_data: leakage.has_reconciliation_data,
        has_gl_data: leakage.has_gl_data,
        has_billing_data: leakage.has_billing_data,
      },
      {
        capveri_calculated: '3000.00',
        actual_billed: '3650.38',
        leakage: '-650.38',
        leakage_identity: true,
        calculated_equals_snapshot_sum: true,
        billed_equals_billing_list: true,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
      }
    )
    check(
      'leakage per-tenant breakdown: difference == calculated - billed for every row, totals equal sum of parts',
      {
        rows: leakageBreakdown.map((row) => ({
          tenant_name: row.tenant_name,
          calculated_amount: numberCents(row.calculated_amount),
          billed_amount: numberCents(row.billed_amount),
          difference: numberCents(row.difference),
          row_identity:
            numberCents(row.difference) ===
            numberCents(row.calculated_amount) - numberCents(row.billed_amount),
        })),
        breakdown_calculated_sum_equals_total:
          leakageBreakdown.reduce(
            (sum, row) => sum + numberCents(row.calculated_amount),
            0n
          ) === cents(leakage.capveri_calculated),
        breakdown_billed_sum_equals_total:
          leakageBreakdown.reduce(
            (sum, row) => sum + numberCents(row.billed_amount),
            0n
          ) === cents(leakage.actual_billed),
      },
      {
        rows: [
          {
            tenant_name: cafeName,
            calculated_amount: 0n,
            billed_amount: cents('500.00'),
            difference: -cents('500.00'),
            row_identity: true,
          },
          {
            tenant_name: ghostName,
            calculated_amount: 0n,
            billed_amount: cents('400.13'),
            difference: -cents('400.13'),
            row_identity: true,
          },
          {
            tenant_name: obrienName,
            calculated_amount: cents('3000.00'),
            billed_amount: cents('2750.25'),
            difference: cents('249.75'),
            row_identity: true,
          },
        ].sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
        breakdown_calculated_sum_equals_total: true,
        breakdown_billed_sum_equals_total: true,
      }
    )

    const comparison = await expectJson(
      `/api/v1/comparison/${imported.property_id}?period_start=${periodStart}&period_end=${periodEnd}&include_drafts=false&tolerance=0.01`,
      { status: 200 }
    )
    const tenants = [...comparison.tenants].sort((a, b) =>
      a.tenant_name.localeCompare(b.tenant_name)
    )
    check(
      'comparison per-tenant variance identities hold penny-exact (variance == charged - correct)',
      {
        tenants: tenants.map((t) => ({
          tenant_name: t.tenant_name,
          capveri_correct: normalizeMoney(t.capveri_correct),
          actual_charged: normalizeMoney(t.actual_charged),
          variance: normalizeMoney(t.variance),
          variance_identity:
            cents(t.variance) ===
            cents(t.actual_charged) - cents(t.capveri_correct),
          abs_variance_identity:
            cents(t.abs_variance) === absBig(cents(t.variance)),
          direction: t.direction,
        })),
        total_capveri_correct: normalizeMoney(comparison.total_capveri_correct),
        total_actual_charged: normalizeMoney(comparison.total_actual_charged),
        total_net_variance: normalizeMoney(comparison.total_net_variance),
        totals_are_sum_of_parts:
          cents(comparison.total_capveri_correct) ===
            tenants.reduce((sum, t) => sum + cents(t.capveri_correct), 0n) &&
          cents(comparison.total_actual_charged) ===
            tenants.reduce((sum, t) => sum + cents(t.actual_charged), 0n),
        net_variance_identity:
          cents(comparison.total_net_variance) ===
          cents(comparison.total_actual_charged) -
            cents(comparison.total_capveri_correct),
        cross_surface_matches_leakage:
          cents(comparison.total_capveri_correct) ===
            cents(leakage.capveri_calculated) &&
          cents(comparison.total_actual_charged) ===
            cents(leakage.actual_billed),
      },
      {
        tenants: [
          {
            tenant_name: cafeName,
            capveri_correct: '0.00',
            actual_charged: '500.00',
            variance: '500.00',
            variance_identity: true,
            abs_variance_identity: true,
            direction: 'overcharge',
          },
          {
            tenant_name: ghostName,
            capveri_correct: '0.00',
            actual_charged: '400.13',
            variance: '400.13',
            variance_identity: true,
            abs_variance_identity: true,
            direction: 'overcharge',
          },
          {
            tenant_name: obrienName,
            capveri_correct: '3000.00',
            actual_charged: '2750.25',
            variance: '-249.75',
            variance_identity: true,
            abs_variance_identity: true,
            direction: 'undercharge',
          },
        ].sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
        total_capveri_correct: '3000.00',
        total_actual_charged: '3650.38',
        total_net_variance: '650.38',
        totals_are_sum_of_parts: true,
        net_variance_identity: true,
        cross_surface_matches_leakage: true,
      }
    )
  } finally {
    await cleanup(created)
  }
}

// ---------------------------------------------------------------------------

async function cleanup(created) {
  const failures = []

  if (created.probePropertyId) {
    await attemptCleanup(
      failures,
      `delete probe property ${created.probePropertyId}`,
      () => deleteEmpty(`/api/v1/properties/${created.probePropertyId}`)
    )
    await attemptCleanup(
      failures,
      `verify probe property deleted ${created.probePropertyId}`,
      () =>
        expectStatus(`/api/v1/properties/${created.probePropertyId}`, {
          status: 404,
        })
    )
  }

  // Once any snapshot for the property is finalized, the API deliberately pins
  // the property (409 property_in_finalized_snapshot, immutable audit record)
  // and no unfinalize/snapshot-delete endpoint exists. Treat that outcome as a
  // verified guard + recorded residue that requires DB-level cleanup.
  let propertyPinnedByFinalizedSnapshot = false
  if (created.propertyId) {
    const deletion = await rawJson(`/api/v1/properties/${created.propertyId}`, {
      method: 'DELETE',
    })
    report.cleanup.push({
      path: `/api/v1/properties/${created.propertyId}`,
      method: 'DELETE',
      status: deletion.status,
      ok: deletion.status === 204 || deletion.status === 409,
      body_preview: deletion.text.slice(0, 200),
    })
    if (
      deletion.status === 409 &&
      deletion.text.includes('property_in_finalized_snapshot')
    ) {
      propertyPinnedByFinalizedSnapshot = true
      check(
        'cleanup: finalized snapshot pins the property (409 property_in_finalized_snapshot); API cleanup impossible by design',
        { status: deletion.status, code_present: true },
        { status: 409, code_present: true }
      )
      report.residue = [
        {
          type: 'property',
          id: created.propertyId,
          name: report.generated.propertyName,
          reason:
            'Finalized reconciliation snapshot blocks DELETE /properties/:id; requires direct DB cleanup.',
        },
      ]
    } else if (deletion.status !== 204) {
      failures.push(`delete property ${created.propertyId}`)
    }
  }
  if (created.propertyId && !propertyPinnedByFinalizedSnapshot) {
    await attemptCleanup(
      failures,
      `verify property deleted ${created.propertyId}`,
      () =>
        expectStatus(`/api/v1/properties/${created.propertyId}`, {
          status: 404,
        })
    )
    await attemptCleanup(failures, 'verify leases deleted by cascade', () =>
      expectListEmpty(`/api/v1/leases?property_id=${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify units inaccessible', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}/units`, {
        status: 404,
      })
    )
    await attemptCleanup(failures, 'verify snapshots deleted by cascade', () =>
      expectNoSnapshots(created.propertyId)
    )
    await attemptCleanup(failures, 'verify actual billed inaccessible', () =>
      expectStatus(
        `/api/v1/actual-billed/${created.propertyId}?period_start=2026-01-01&period_end=2026-12-31`,
        { status: 404 }
      )
    )
    if (created.jobId) {
      await attemptCleanup(failures, 'verify calculation job deleted', () =>
        expectStatus(`/api/v1/reconciliation/jobs/${created.jobId}`, {
          status: 404,
        })
      )
    }
    if (created.batchId) {
      await attemptCleanup(failures, 'verify ingestion batch deleted', () =>
        expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
          status: 404,
        })
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectNoSnapshots(propertyId) {
  const path = `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=2026-01-01&period_end=2026-12-31&page=1&size=10`
  const list = await expectJson(path, { status: 200 })
  const ok =
    list.total === 0 && Array.isArray(list.items) && list.items.length === 0
  report.cleanup.push({
    path,
    status: 200,
    ok,
    body_preview: JSON.stringify({ total: list.total }),
  })
  if (!ok) {
    throw new Error(
      `Snapshots still present after property delete: ${JSON.stringify(list).slice(0, 400)}`
    )
  }
}

async function propertyNameExists(name) {
  for (let page = 0; page < 5; page += 1) {
    const list = await expectJson(
      `/api/v1/properties?skip=${page * 100}&limit=100`,
      { status: 200 }
    )
    const rows = Array.isArray(list) ? list : (list.data ?? list.items ?? [])
    if (rows.some((row) => row.name === name)) return true
    if (rows.length < 100) return false
  }
  return false
}

// --- HTTP helpers ----------------------------------------------------------

async function uploadRentRoll(path, options) {
  const raw = await uploadRentRollRaw(path, options)
  if (raw.status !== options.status) {
    throw new Error(
      `POST ${path} returned ${raw.status}, expected ${options.status}: ${raw.text.slice(0, 500)}`
    )
  }
  return raw.body
}

async function uploadRentRollRaw(path, options) {
  const form = new FormData()
  form.set('file', new Blob([options.csv], { type: 'text/csv' }), options.fileName)
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.set(key, value)
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, body: safeJson(text) }
}

async function uploadGlCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(
      `POST /api/v1/ingestion/upload returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function uploadBillingCsv(input) {
  const raw = await uploadBillingCsvRaw(input)
  if (raw.status !== 200) {
    throw new Error(
      `POST /api/v1/actual-billed/upload returned ${raw.status}: ${raw.text.slice(0, 500)}`
    )
  }
  return raw.body
}

async function uploadBillingCsvRaw({
  propertyId,
  periodStart,
  periodEnd,
  fileName,
  csv,
}) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('period_start', periodStart)
  form.set('period_end', periodEnd)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const response = await fetch(`${apiUrl}/api/v1/actual-billed/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  return { status: response.status, text, body: safeJson(text) }
}

async function waitForJob(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, {
      status: 200,
    })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(
        `Reconciliation job failed: ${JSON.stringify(job).slice(0, 500)}`
      )
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for reconciliation job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

async function expectJson(path, options = {}) {
  const raw = await rawJson(path, options)
  const expected = options.status ?? 200
  if (raw.status !== expected) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${raw.status}, expected ${expected}: ${raw.text.slice(0, 500)}`
    )
  }
  return raw.body
}

async function rawJson(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, text, body: safeJson(text) }
}

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
}

async function expectListEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(`GET ${path} returned ${response.status}: ${text.slice(0, 500)}`)
  }
  const body = safeJson(text)
  const ok =
    body?.count === 0 && Array.isArray(body?.data) && body.data.length === 0
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: JSON.stringify({ count: body?.count }),
  })
  if (!ok) {
    throw new Error(`List still contains rows after cleanup: ${text.slice(0, 400)}`)
  }
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 400)}`)
  }
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

async function signInWithPassword() {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: env.E2E_PROD_EMAIL,
        password: env.E2E_PROD_PASSWORD,
      }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  report.auth = {
    user_id: json.user?.id ?? null,
    email: json.user?.email ?? env.E2E_PROD_EMAIL,
  }
  return json.access_token
}

// --- data helpers ----------------------------------------------------------

function normalizeLease(lease) {
  return {
    id: lease.id,
    property_id: lease.property_id,
    unit_id: lease.unit_id,
    tenant_name: lease.tenant_name,
    start_date: String(lease.start_date).slice(0, 10),
    end_date: String(lease.end_date).slice(0, 10),
    status: lease.status,
    pro_rata_share: lease.recovery_profile?.pro_rata_share,
    cap_type: lease.recovery_profile?.cap_type,
    admin_fee_percentage: lease.recovery_profile?.admin_fee_percentage,
  }
}

function sharedSubset(left, right) {
  const subset = {}
  for (const key of Object.keys(left).sort()) {
    if (!(key in right)) continue
    const value = left[key]
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      subset[key] = maybeNormalizeScalar(key, value)
    }
  }
  return subset
}

function maybeNormalizeScalar(key, value) {
  if (value === null || typeof value === 'boolean') return value
  const text = String(value)
  if (/_date$|_at$/u.test(key)) return text.slice(0, 10)
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) return normalizeMoney(text)
  return text
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({
    label,
    ok,
    actual: deBigint(actual),
    expected: deBigint(expected),
  })
  if (!ok) {
    throw new Error(
      `${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`
    )
  }
}

function observe(title, detail) {
  report.observations.push({ title, detail })
}

function normalizeMoney(value) {
  return centsToDecimal(cents(value))
}

function cents(value) {
  const text = String(value).trim()
  const match = /^(?<sign>-)?(?<whole>\d+)(?:\.(?<fraction>\d+))?$/u.exec(text)
  if (!match?.groups) throw new Error(`Invalid decimal money value: ${text}`)
  const fractionRaw = (match.groups.fraction ?? '').padEnd(2, '0')
  if (fractionRaw.length > 2 && !/^0*$/u.test(fractionRaw.slice(2))) {
    throw new Error(`Money value has sub-cent precision: ${text}`)
  }
  const centsValue =
    BigInt(match.groups.whole) * 100n + BigInt(fractionRaw.slice(0, 2))
  return match.groups.sign ? -centsValue : centsValue
}

function numberCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected finite number, got ${String(value)}`)
  }
  return BigInt(Math.round(value * 100))
}

function absBig(value) {
  return value < 0n ? -value : value
}

function sumCents(values) {
  return values.reduce((sum, value) => sum + cents(value), 0n)
}

function centsToDecimal(value) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

function csvRow(values) {
  return values
    .map((value) => {
      const text = String(value)
      return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    })
    .join(',')
}

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]))
}

async function writeFixture(name, content) {
  const dir = resolve(outputDir, 'fixtures')
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, name), content)
}

async function readEnv(path) {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = {}
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index < 1) continue
      parsed[trimmed.slice(0, index)] = unquote(trimmed.slice(index + 1).trim())
    }
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function safeJson(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function stableJson(value) {
  return JSON.stringify(sortDeep(deBigint(value)))
}

function deBigint(value) {
  if (typeof value === 'bigint') return `${value}n`
  if (Array.isArray(value)) return value.map(deBigint)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, deBigint(nested)])
    )
  }
  return value
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortDeep(nested)])
    )
  }
  return value
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
