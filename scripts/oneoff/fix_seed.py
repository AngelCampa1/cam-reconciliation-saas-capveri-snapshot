import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]  # scripts/oneoff -> repo root
path = REPO_ROOT / 'frontend' / 'e2e' / 'seed-test-data.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '    // Step 8: Seed test disputes for landlord and tenant dispute tests'
end_marker = "    console.log('✅ Test data seeding complete!')"

start_idx = content.index(start_marker)
end_idx = content.index(end_marker) + len(end_marker)

new_step8 = r"""    // Step 8: Create E2E tenant user and seed disputes
    console.log('👤 Creating E2E tenant user...')

    const TEST_TENANT_EMAIL = 'e2e-tenant@capveri.com'
    const TEST_TENANT_PASSWORD = 'TestPassword123!'

    const { data: tenantAuthList } = await adminClient.auth.admin.listUsers()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tenantAuthUser = tenantAuthList?.users?.find((u: any) => u.email === TEST_TENANT_EMAIL)

    if (!tenantAuthUser) {
      const { data: newTenantAuth, error: tenantAuthError } =
        await adminClient.auth.admin.createUser({
          email: TEST_TENANT_EMAIL,
          password: TEST_TENANT_PASSWORD,
          email_confirm: true,
        })
      if (tenantAuthError) {
        throw new Error(`Failed to create tenant auth user: ${tenantAuthError.message}`)
      }
      tenantAuthUser = newTenantAuth.user
      await new Promise((resolve) => setTimeout(resolve, 2000))
      console.log(`✅ Tenant auth user created: ${tenantAuthUser!.id}`)
    } else {
      console.log(`✅ Tenant auth user already exists: ${tenantAuthUser.id}`)
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

    console.log('✅ Test data seeding complete!')"""

result = content[:start_idx] + new_step8 + content[end_idx:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(result)
print(f'Done. Total lines: {result.count(chr(10))}')
