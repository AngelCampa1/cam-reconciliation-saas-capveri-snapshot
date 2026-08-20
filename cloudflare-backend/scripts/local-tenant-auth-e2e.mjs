import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8832";
const DEFAULT_STUB_URL = "http://127.0.0.1:8833";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const LOCAL_SUPABASE_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";
const TERMS_VERSION = "2026-06-03";
const TERMS_HASH =
  "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local tenant auth E2E always owns ${DEFAULT_BASE_URL}`);
  }
  if (args["stub-url"] || process.env.npm_config_stub_url) {
    fail(`local tenant auth E2E always owns ${DEFAULT_STUB_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const stubUrl = DEFAULT_STUB_URL;
  const supabaseUrl = normalizedLocalSupabaseUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
  );
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    LOCAL_ANON_KEY;
  const serviceRoleKey =
    args["supabase-service-role-key"] ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    createLocalServiceRoleJwt();

  if (process.env.CI) fail("Refusing to run local tenant auth E2E in CI.");
  await assertPortAvailable(baseUrl);
  await assertPortAvailable(stubUrl);
  await assertSupabaseServiceRole({ supabaseUrl, serviceRoleKey });
  const stub = await startResendStub(stubUrl);
  const worker = await startWorkerServer({
    baseUrl,
    stubUrl,
    supabaseUrl,
    databaseUrl,
    serviceRoleKey,
  });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          supabaseUrl,
          anonKey,
          databaseUrl,
          stub,
          index,
        }),
      );
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          stub_url: stubUrl,
          supabase_url: supabaseUrl,
          repeat,
          runs,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    runError = error;
  } finally {
    for (const close of [() => worker.close(), () => stub.close()]) {
      try {
        await close();
      } catch (error) {
        closeError = error;
        if (runError) {
          console.error(
            `Local tenant auth cleanup failed after scenario failure: ${errorMessage(error)}`,
          );
        }
      }
    }
  }

  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const account = await seedScenario({ ...input, sql });
  let tenantUserId;
  let tenantAuthUserId;
  let runError;
  let cleanupError;
  let result;

  try {
    const ownerHeaders = jsonAuthHeaders(account.owner.accessToken);
    const memberHeaders = jsonAuthHeaders(account.member.accessToken);
    const startResendCount = input.stub.requests.length;

    await expectJson(
      `${input.baseUrl}/api/v1/tenant/invitations/short/validate`,
      {
        status: 200,
        assertBody: (body) =>
          body.valid === false && body.error_reason === "not_found",
      },
    );

    await expectError(`${input.baseUrl}/api/v1/tenant/invitations`, {
      method: "POST",
      headers: memberHeaders,
      status: 403,
      code: "insufficient_permissions",
      body: JSON.stringify({
        email: account.memberAttemptEmail,
        lease_id: account.leaseId,
      }),
    });

    await expectError(`${input.baseUrl}/api/v1/tenant/invitations`, {
      method: "POST",
      headers: ownerHeaders,
      status: 404,
      code: "tenant_auth_resource_not_found",
      body: JSON.stringify({
        email: account.hiddenAttemptEmail,
        lease_id: account.hiddenLeaseId,
      }),
    });

    const invitation = await expectJson(
      `${input.baseUrl}/api/v1/tenant/invitations`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 201,
        body: JSON.stringify({
          email: account.tenantEmail.toUpperCase(),
          lease_id: account.leaseId,
        }),
      },
    );
    assert(
      invitation.email === account.tenantEmail,
      "invitation email mismatch",
    );
    assert(
      invitation.lease_id === account.leaseId,
      "invitation lease mismatch",
    );
    assert(
      invitation.organization_id === account.owner.organizationId,
      "invitation organization mismatch",
    );
    assert(typeof invitation.token === "string", "invitation token missing");
    await assertInvitationStored(sql, {
      invitationId: invitation.id,
      email: account.tenantEmail,
      leaseId: account.leaseId,
      organizationId: account.owner.organizationId,
      invitedBy: account.owner.userId,
      used: false,
    });
    const invitationEmail = await waitForStubRequest(input.stub, {
      start: startResendCount,
      predicate: (request) =>
        request.path === "/resend/emails" &&
        request.body.to?.[0] === account.tenantEmail,
      message: "tenant invitation email was not sent",
    });
    assertTenantInvitationEmailContract(invitationEmail.body, {
      toEmail: account.tenantEmail,
      signupUrl: `${input.baseUrl}/tenant/signup?token=${encodeURIComponent(invitation.token)}`,
      expiresAt: invitation.expires_at,
    });

    const validInvitation = await expectJson(
      `${input.baseUrl}/api/v1/tenant/invitations/${invitation.token}/validate`,
      { status: 200 },
    );
    assert(validInvitation.valid === true, "invitation should validate");
    assert(
      validInvitation.email === account.tenantEmail,
      "validated email mismatch",
    );

    await expectJson(`${input.baseUrl}/api/v1/tenant/signup`, {
      method: "POST",
      headers: jsonHeaders({
        "cf-connecting-ip": "127.0.0.1",
        "user-agent": "local-tenant-auth-e2e-stale-terms",
      }),
      status: 422,
      body: JSON.stringify({
        token: invitation.token,
        password: account.tenantPassword,
        contact_name: "Local Tenant Auth",
        accepted_terms: true,
        terms_version: "stale",
        terms_hash: TERMS_HASH,
      }),
    });

    await expectJson(`${input.baseUrl}/api/v1/tenant/signup`, {
      method: "POST",
      headers: jsonHeaders(),
      status: 410,
      body: JSON.stringify({
        token: "missing-token-missing-token-missing-1",
        password: account.tenantPassword,
        contact_name: "Missing Tenant",
        accepted_terms: true,
        terms_version: TERMS_VERSION,
        terms_hash: TERMS_HASH,
      }),
      assertBody: (body) => body.detail?.reason === "not_found",
    });

    const signup = await expectJson(`${input.baseUrl}/api/v1/tenant/signup`, {
      method: "POST",
      headers: jsonHeaders({
        "cf-connecting-ip": "127.0.0.1",
        "user-agent": "local-tenant-auth-e2e",
      }),
      status: 201,
      body: JSON.stringify({
        token: invitation.token,
        password: account.tenantPassword,
        contact_name: "Local Tenant Auth",
        accepted_terms: true,
        terms_version: TERMS_VERSION,
        terms_hash: TERMS_HASH,
      }),
    });
    tenantUserId = signup.tenant_user?.id;
    tenantAuthUserId = signup.user_id;
    addUnique(account.generated.emails, account.tenantEmail);
    if (typeof tenantAuthUserId === "string") {
      addUnique(account.generated.userIds, tenantAuthUserId);
    }
    if (typeof tenantUserId === "string") {
      addUnique(account.generated.tenantUserIds, tenantUserId);
    }
    assert(signup.success === true, "signup success flag mismatch");
    assert(typeof tenantUserId === "string", "tenant user id missing");
    assert(typeof tenantAuthUserId === "string", "tenant auth user id missing");
    assert(
      typeof signup.access_token === "string",
      "tenant access token missing",
    );
    assert(
      signup.tenant_user.contact_email === account.tenantEmail,
      "tenant user email mismatch",
    );

    await assertTenantSignupSideEffects(sql, {
      invitationId: invitation.id,
      tenantUserId,
      tenantAuthUserId,
      tenantEmail: account.tenantEmail,
      organizationId: account.owner.organizationId,
      leaseId: account.leaseId,
    });

    const tenantHeaders = jsonAuthHeaders(signup.access_token);
    const dashboard = await expectJson(
      `${input.baseUrl}/api/v1/tenant/dashboard`,
      { headers: tenantHeaders, status: 200 },
    );
    assertTenantDashboard(dashboard, {
      leaseId: account.leaseId,
      propertyId: account.propertyId,
      propertyName: account.propertyName,
      unitId: account.unitId,
      unitNumber: "TA-100",
    });

    await expectError(`${input.baseUrl}/api/v1/tenant/invitations`, {
      method: "POST",
      headers: tenantHeaders,
      status: 403,
      code: "forbidden",
      body: JSON.stringify({
        email: account.memberAttemptEmail,
        lease_id: account.leaseId,
      }),
    });

    const usedInvitation = await expectJson(
      `${input.baseUrl}/api/v1/tenant/invitations/${invitation.token}/validate`,
      { status: 200 },
    );
    assert(
      usedInvitation.valid === false && usedInvitation.error_reason === "used",
      "invitation should be used after signup",
    );
    await expectJson(`${input.baseUrl}/api/v1/tenant/signup`, {
      method: "POST",
      headers: jsonHeaders(),
      status: 410,
      body: JSON.stringify({
        token: invitation.token,
        password: account.tenantPassword,
        contact_name: "Replay Tenant",
        accepted_terms: true,
        terms_version: TERMS_VERSION,
        terms_hash: TERMS_HASH,
      }),
      assertBody: (body) => body.detail?.reason === "used",
    });

    result = {
      index: input.index,
      organization_id: account.owner.organizationId,
      lease_id: account.leaseId,
      invitation_id: invitation.id,
      tenant_user_id: tenantUserId,
      tenant_auth_user_id: tenantAuthUserId,
      resend_calls: input.stub.requests.length - startResendCount,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, account.generated);
      await assertCleanupComplete(sql, account.generated);
    } catch (error) {
      cleanupError ??= error;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (runError && cleanupError) {
    console.error(
      `Local tenant auth row cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedScenario(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ids = {
    propertyId: randomUUID(),
    unitId: randomUUID(),
    leaseId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    hiddenUnitId: randomUUID(),
    hiddenLeaseId: randomUUID(),
  };
  const propertyName = `Tenant Auth Property ${suffix}`;
  const generated = {
    orgIds: [],
    userIds: [],
    emails: [],
    orgNames: [],
    propertyIds: [ids.propertyId, ids.hiddenPropertyId],
    unitIds: [ids.unitId, ids.hiddenUnitId],
    leaseIds: [ids.leaseId, ids.hiddenLeaseId],
    tenantUserIds: [],
  };

  let owner;
  let member;
  let hidden;
  try {
    owner = await createLocalAuthUser(
      { ...input, generated },
      {
        email: `tenant-auth-owner-${suffix}@capveri.local`,
        password: `OwnerPass${input.index}Aa1!`,
        fullName: `Local Tenant Auth Owner ${suffix}`,
        organizationName: `Local Tenant Auth Owner Org ${suffix}`,
        role: "owner",
      },
    );
    member = await createLocalAuthUser(
      { ...input, generated },
      {
        email: `tenant-auth-member-${suffix}@capveri.local`,
        password: `MemberPass${input.index}Aa1!`,
        fullName: `Local Tenant Auth Member ${suffix}`,
        organizationName: `Local Tenant Auth Member Org ${suffix}`,
        role: "member",
      },
    );
    hidden = await createLocalAuthUser(
      { ...input, generated },
      {
        email: `tenant-auth-hidden-${suffix}@capveri.local`,
        password: `HiddenPass${input.index}Aa1!`,
        fullName: `Local Tenant Auth Hidden ${suffix}`,
        organizationName: `Local Tenant Auth Hidden Org ${suffix}`,
        role: "owner",
      },
    );
    await input.sql.begin(async (transaction) => {
      await transaction`
        update users
        set organization_id = ${owner.organizationId},
            role = 'member',
            updated_at = now()
        where id = ${member.userId}
      `;
      member.organizationId = owner.organizationId;
      await insertProperty(transaction, {
        id: ids.propertyId,
        orgId: owner.organizationId,
        name: propertyName,
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        orgId: hidden.organizationId,
        name: `Hidden Tenant Auth Property ${suffix}`,
      });
      await transaction`
        insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
        values
          (${ids.unitId}, ${ids.propertyId}, 'TA-100', 5000, 4500, 1, 'occupied'),
          (${ids.hiddenUnitId}, ${ids.hiddenPropertyId}, 'HT-100', 2500, 2250, 1, 'occupied')
      `;
      await transaction`
        insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
        values
          (${ids.leaseId}, ${ids.propertyId}, ${ids.unitId}, 'Local Tenant Auth', '2026-01-01'::date, '2026-12-31'::date, 'active', '{"pro_rata_share":"0.125","base_year":2025}'::jsonb),
          (${ids.hiddenLeaseId}, ${ids.hiddenPropertyId}, ${ids.hiddenUnitId}, 'Hidden Tenant Auth', '2026-01-01'::date, '2026-12-31'::date, 'active', '{}'::jsonb)
      `;
    });
  } catch (error) {
    await cleanupGeneratedRows(input.sql, generated);
    throw error;
  }

  return {
    owner,
    member,
    hidden,
    ...ids,
    propertyName,
    tenantEmail: `tenant-auth-tenant-${suffix}@capveri.local`,
    tenantPassword: `TenantPass${input.index}Aa1!`,
    memberAttemptEmail: `tenant-auth-member-attempt-${suffix}@capveri.local`,
    hiddenAttemptEmail: `tenant-auth-hidden-attempt-${suffix}@capveri.local`,
    generated,
  };
}

async function createLocalAuthUser(input, user) {
  if (input.generated) {
    addUnique(input.generated.emails, user.email);
    addUnique(input.generated.orgNames, user.organizationName);
  }
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
    method: "POST",
    headers: { apikey: input.anonKey, "content-type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      data: {
        full_name: user.fullName,
        organization_name: user.organizationName,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`Supabase signup failed: ${safeJson(redactSensitive(body))}`);
  }
  const userId = body.user?.id;
  assert(typeof userId === "string" && userId !== "", "signup user id missing");
  if (input.generated) {
    addUnique(input.generated.userIds, userId);
  }
  await input.sql`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${userId}`;
  await input.sql`update users set role = ${user.role}, full_name = ${user.fullName}, updated_at = now() where id = ${userId}`;
  const rows =
    await input.sql`select organization_id from users where id = ${userId} limit 1`;
  const organizationId = rows[0]?.organization_id;
  assert(typeof organizationId === "string", "signup organization id missing");
  if (input.generated) {
    addUnique(input.generated.orgIds, organizationId);
  }
  const accessToken =
    body.session?.access_token ??
    (await signInWithPassword({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: user.email,
      password: user.password,
    }));
  assert(typeof accessToken === "string", "access token missing");
  return {
    ...user,
    userId,
    signupOrganizationId: organizationId,
    organizationId,
    accessToken,
  };
}

async function signInWithPassword(input) {
  const url = new URL("/auth/v1/token", input.supabaseUrl);
  url.searchParams.set("grant_type", "password");
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: input.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return undefined;
  return body.access_token;
}

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${input.id}, ${input.orgId}, ${input.name}, '100 Tenant Auth Way',
      'Austin', 'TX', '78701', 100000, 90000, 10000, 0.9500
    )
  `;
}

async function assertInvitationStored(sql, input) {
  const rows = await sql`
    select email, lease_id, organization_id, invited_by, used_at
    from tenant_invitations
    where id = ${input.invitationId}
    limit 1
  `;
  const row = rows[0];
  assert(row, "tenant invitation missing");
  assert(row.email === input.email, "stored invitation email mismatch");
  assert(row.lease_id === input.leaseId, "stored invitation lease mismatch");
  assert(
    row.organization_id === input.organizationId,
    "stored invitation organization mismatch",
  );
  assert(
    row.invited_by === input.invitedBy,
    "stored invitation inviter mismatch",
  );
  assert(
    Boolean(row.used_at) === input.used,
    "stored invitation used mismatch",
  );
}

async function assertTenantSignupSideEffects(sql, input) {
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id = ${input.tenantAuthUserId} and email = ${input.tenantEmail}) as auth_user_count,
      (select count(*)::int from users where id = ${input.tenantAuthUserId} and email = ${input.tenantEmail} and organization_id = ${input.organizationId} and role = 'tenant') as public_user_count,
      (select count(*)::int from tenant_users where id = ${input.tenantUserId} and user_id = ${input.tenantAuthUserId} and contact_email = ${input.tenantEmail} and organization_id = ${input.organizationId}) as tenant_user_count,
      (select count(*)::int from tenant_lease_links where tenant_user_id = ${input.tenantUserId} and lease_id = ${input.leaseId}) as lease_link_count,
      (select count(*)::int from tenant_invitations where id = ${input.invitationId} and used_at is not null) as used_invitation_count,
      (select count(*)::int from legal_acceptances where user_id = ${input.tenantAuthUserId} and organization_id = ${input.organizationId} and source = 'tenant_invitation_signup') as legal_acceptance_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 1, "tenant auth user was not created");
  assert(row.public_user_count === 1, "tenant public user was not created");
  assert(row.tenant_user_count === 1, "tenant_users row was not created");
  assert(row.lease_link_count === 1, "tenant lease link was not created");
  assert(row.used_invitation_count === 1, "invitation was not marked used");
  assert(row.legal_acceptance_count === 1, "tenant legal acceptance missing");
}

function assertTenantDashboard(body, input) {
  assert(Array.isArray(body?.leases), "tenant dashboard leases missing");
  assert(body.leases.length === 1, "tenant dashboard lease count mismatch");
  const lease = body.leases[0];
  assert(lease.id === input.leaseId, "tenant dashboard lease id mismatch");
  assert(
    lease.property?.id === input.propertyId,
    "tenant dashboard property id mismatch",
  );
  assert(
    lease.property?.name === input.propertyName,
    "tenant dashboard property name mismatch",
  );
  assert(lease.unit?.id === input.unitId, "tenant dashboard unit id mismatch");
  assert(
    lease.unit?.unit_number === input.unitNumber,
    "tenant dashboard unit number mismatch",
  );
  assert(
    lease.pro_rata_share === "0.125",
    "tenant dashboard pro rata mismatch",
  );
  assert(
    Array.isArray(body.statements) && body.statements.length === 0,
    "tenant dashboard statements should be empty for generated lease",
  );
  assert(
    body.unread_notifications === 0,
    "tenant dashboard unread count mismatch",
  );
}

function assertTenantInvitationEmailContract(payload, expected) {
  assert(
    payload?.from === "CapVeri <local@capveri.local>",
    "tenant invitation email from mismatch",
  );
  assert(
    Array.isArray(payload?.to) &&
      payload.to.length === 1 &&
      payload.to[0] === expected.toEmail,
    "tenant invitation email recipient mismatch",
  );
  assert(
    payload?.subject === "You're invited to view your CAM statement",
    "tenant invitation email subject mismatch",
  );

  const text = String(payload?.text ?? "");
  const html = String(payload?.html ?? "");
  for (const [label, value] of [
    ["heading", "You have been invited to CapVeri"],
    ["body", "Set up your tenant portal account to view your CAM statement."],
    ["signup URL", expected.signupUrl],
    ["expiration", expected.expiresAt],
  ]) {
    assert(
      text.includes(value),
      `tenant invitation email text missing ${label}`,
    );
    assert(
      html.includes(value) || html.includes(escapeHtmlMarker(value)),
      `tenant invitation email html missing ${label}`,
    );
  }
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_tenant_auth_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_tenant_auth_e2e_none__");
  const propertyIds = nonEmpty(input.propertyIds);
  const unitIds = nonEmpty(input.unitIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const tenantUserIds = nonEmpty(input.tenantUserIds);
  await sql.begin(async (transaction) => {
    await transaction`delete from tenant_notifications where tenant_user_id in ${transaction(tenantUserIds)}`;
    await transaction`delete from tenant_email_preferences where tenant_user_id in ${transaction(tenantUserIds)}`;
    await transaction`delete from tenant_lease_links where tenant_user_id in ${transaction(tenantUserIds)} or lease_id in ${transaction(leaseIds)}`;
    await transaction`delete from tenant_users where id in ${transaction(tenantUserIds)} or user_id in ${transaction(userIds)} or contact_email in ${transaction(emails)}`;
    await transaction`delete from tenant_invitations where organization_id in ${transaction(orgIds)} or lease_id in ${transaction(leaseIds)} or email in ${transaction(emails)}`;
    await transaction`delete from leases where id in ${transaction(leaseIds)} or unit_id in ${transaction(unitIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from units where id in ${transaction(unitIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from properties where id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from signup_email_events where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`delete from legal_acceptances where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)}`;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`delete from audit_log where organization_id in ${transaction(orgIds)} or changed_by in ${transaction(userIds)} or row_id in ${transaction([...orgIds, ...userIds, ...propertyIds, ...unitIds, ...leaseIds, ...tenantUserIds])}`;
    await transaction`delete from users where id in ${transaction(userIds)} or email in ${transaction(emails)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from auth.users where id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`delete from organizations where id in ${transaction(orgIds)} or name in ${transaction(orgNames)}`;
  });
}

async function assertCleanupComplete(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_tenant_auth_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_tenant_auth_e2e_none__");
  const propertyIds = nonEmpty(input.propertyIds);
  const unitIds = nonEmpty(input.unitIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const tenantUserIds = nonEmpty(input.tenantUserIds);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as properties,
      (select count(*)::int from units where id in ${sql(unitIds)} or property_id in ${sql(propertyIds)}) as units,
      (select count(*)::int from leases where id in ${sql(leaseIds)} or unit_id in ${sql(unitIds)} or property_id in ${sql(propertyIds)}) as leases,
      (select count(*)::int from tenant_invitations where organization_id in ${sql(orgIds)} or lease_id in ${sql(leaseIds)} or email in ${sql(emails)}) as invitations,
      (select count(*)::int from tenant_users where id in ${sql(tenantUserIds)} or user_id in ${sql(userIds)} or contact_email in ${sql(emails)}) as tenant_users,
      (select count(*)::int from tenant_lease_links where tenant_user_id in ${sql(tenantUserIds)} or lease_id in ${sql(leaseIds)}) as tenant_lease_links,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptances,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function startResendStub(stubUrl) {
  const url = new URL(stubUrl);
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    const body = text ? JSON.parse(text) : {};
    requests.push({
      path: new URL(request.url ?? "/", stubUrl).pathname,
      body,
    });
    if (request.url?.startsWith("/resend/emails")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: `tenant-invite-${requests.length}` }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolveListen) => {
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  return {
    requests,
    close: () =>
      new Promise((resolveClose, rejectClose) =>
        server.close((error) =>
          error ? rejectClose(error) : resolveClose(undefined),
        ),
      ),
  };
}

async function startWorkerServer(input) {
  const port = new URL(input.baseUrl).port;
  const envFile = await createWorkerEnvFile(input);
  const child = spawn(
    process.execPath,
    [
      WRANGLER_BIN,
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      port,
      "--local",
      "--show-interactive-dev-session",
      "false",
      "--env-file",
      envFile.path,
      "--var",
      "DB_ACCESS_MODE:direct-postgres",
      "--var",
      "DB_PRODUCTION_BOUNDARY:direct-postgres",
      "--var",
      `DATABASE_URL:${input.databaseUrl}`,
      "--var",
      `SUPABASE_URL:${input.supabaseUrl}`,
      "--var",
      `AUTH_JWKS_URL:${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "--var",
      `SUPABASE_SERVICE_ROLE_KEY:${input.serviceRoleKey}`,
      "--var",
      `RESEND_API_BASE_URL:${input.stubUrl}/resend`,
      "--var",
      "RESEND_API_KEY:local-resend-key",
      "--var",
      "RESEND_FROM_ADDRESS:CapVeri <local@capveri.local>",
      "--var",
      `APP_BASE_URL:${input.baseUrl}`,
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  let childError;
  child.once("error", (error) => {
    childError = error;
    output += `\nwrangler dev spawn error: ${errorMessage(error)}`;
  });
  child.once("exit", (code) => {
    if (code !== null && code !== 0)
      output += `\nwrangler dev exited with ${code}`;
  });
  const handle = {
    close: async () => {
      try {
        if (child.exitCode === null) {
          if (child.pid) await killProcessTree(child.pid);
        } else if (child.pid) {
          await killProcessTree(child.pid);
        }
      } finally {
        try {
          await waitForPortClosed(input.baseUrl);
        } finally {
          await envFile.close();
        }
      }
    },
  };
  try {
    await waitForHealth(input.baseUrl, () => output);
    if (childError) {
      fail(
        `wrangler dev failed to spawn\n${redactSensitiveText(output.slice(-2000))}`,
      );
    }
    if (child.exitCode !== null) {
      fail(
        `wrangler dev exited before health\n${redactSensitiveText(output.slice(-2000))}`,
      );
    }
    return handle;
  } catch (error) {
    let closeError;
    try {
      await handle.close();
    } catch (cleanupError) {
      closeError = cleanupError;
    }
    if (closeError) {
      console.error(
        `Worker cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-tenant-auth-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-tenant-auth-e2e");
  await writeFile(
    path,
    [
      "ENVIRONMENT=development",
      "NODE_ENV=development",
      "DB_ACCESS_MODE=direct-postgres",
      "DB_PRODUCTION_BOUNDARY=direct-postgres",
      `DATABASE_URL=${input.databaseUrl}`,
      `SUPABASE_URL=${input.supabaseUrl}`,
      `AUTH_JWKS_URL=${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      `SUPABASE_SERVICE_ROLE_KEY=${input.serviceRoleKey}`,
      `RESEND_API_BASE_URL=${input.stubUrl}/resend`,
      "RESEND_API_KEY=local-resend-key",
      "RESEND_FROM_ADDRESS=CapVeri <local@capveri.local>",
      `APP_BASE_URL=${input.baseUrl}`,
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=",
      "UNSUBSCRIBE_HMAC_SECRET=",
      "CHECKOUT_OFFER_TOKEN_SECRET=",
    ].join("\n"),
    "utf8",
  );
  return {
    path,
    close: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function workerEnv(input) {
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  env.DB_ACCESS_MODE = "direct-postgres";
  env.DB_PRODUCTION_BOUNDARY = "direct-postgres";
  env.DATABASE_URL = input.databaseUrl;
  env.SUPABASE_URL = input.supabaseUrl;
  env.AUTH_JWKS_URL = `${input.supabaseUrl}/auth/v1/.well-known/jwks.json`;
  env.SUPABASE_SERVICE_ROLE_KEY = input.serviceRoleKey;
  env.RESEND_API_BASE_URL = `${input.stubUrl}/resend`;
  env.RESEND_API_KEY = "local-resend-key";
  env.RESEND_FROM_ADDRESS = "CapVeri <local@capveri.local>";
  env.APP_BASE_URL = input.baseUrl;
  return env;
}

async function assertSupabaseServiceRole(input) {
  const response = await fetch(
    new URL("/auth/v1/admin/users?page=1&per_page=1", input.supabaseUrl),
    {
      headers: {
        apikey: input.serviceRoleKey,
        authorization: `Bearer ${input.serviceRoleKey}`,
      },
    },
  ).catch((error) => {
    fail(`Local Supabase admin check failed: ${error.message}`);
  });
  if (!response.ok) {
    fail(`Local Supabase service role check returned ${response.status}`);
  }
}

function createLocalServiceRoleJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    iss: "supabase",
    ref: "capveri",
    role: "service_role",
    iat: now,
    exp: now + 100 * 365 * 24 * 60 * 60,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", LOCAL_SUPABASE_JWT_SECRET)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, assertBody, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${redactUrl(url)} failed: ${error.message}`,
      );
    },
  );
  const text = await response.text();
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${redactUrl(url)} returned ${response.status}, expected ${status}: ${redactSensitiveText(text.slice(0, 500))}`,
    );
  }
  const body = text ? JSON.parse(text) : null;
  if (assertBody && !assertBody(body)) {
    fail(
      `Unexpected response from ${redactUrl(url)}: ${redactSensitiveText(safeJson(body))}`,
    );
  }
  return body;
}

async function expectError(url, options) {
  const body = await expectJson(url, options);
  assert(
    body?.error?.code === options.code,
    `expected ${options.code}, got ${redactSensitiveText(safeJson(body))}`,
  );
  return body;
}

async function waitForStubRequest(stub, input) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const match = stub.requests.slice(input.start).find(input.predicate);
    if (match) return match;
    await sleep(100);
  }
  fail(input.message);
}

async function killProcessTree(pid) {
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return;
    }
    return;
  }
  await new Promise((resolveKill) => {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("exit", resolveKill);
    killer.once("error", resolveKill);
  });
}

async function assertPortAvailable(baseUrl) {
  const url = new URL(baseUrl);
  if (await canConnect(url.hostname, Number(url.port))) {
    fail(`${baseUrl} already accepts TCP connections`);
  }
}

async function waitForHealth(baseUrl, output = () => "") {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  fail(
    `Worker health check failed: ${lastError}\n${redactSensitiveText(output().slice(-2000))}`,
  );
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await sleep(250);
  }
  fail(`${baseUrl} still accepts TCP connections after close`);
}

async function canConnect(host, port) {
  return new Promise((resolveConnect) => {
    const socket = connect({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolveConnect(false);
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolveConnect(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolveConnect(false);
    });
  });
}

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function jsonHeaders(extra = {}) {
  return { "content-type": "application/json", ...extra };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//iu.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = "true";
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

async function readEnvValue(filePath, keys) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    if (!keys.includes(key)) continue;
    return trimmed
      .slice(equals + 1)
      .trim()
      .replace(/^["']|["']$/gu, "");
  }
  return undefined;
}

function normalizedLocalUrl(rawUrl, label) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (!isLoopbackHost(url.hostname)) fail(`${label} must point at loopback`);
  if (!url.port) fail(`${label} must include a port`);
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function normalizedLocalSupabaseUrl(rawUrl) {
  const value = normalizedLocalUrl(rawUrl, "supabase-url");
  const url = new URL(value);
  if (url.port !== "54321") {
    fail("supabase-url must use the local Supabase API port 54321");
  }
  if (url.pathname !== "/") {
    fail("supabase-url must not include a path");
  }
  return value;
}

function normalizedLocalDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must be Postgres");
  }
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at loopback");
  if (url.port !== "54322") {
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
  }
  return url.toString();
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(
      (values ?? []).filter((value) => typeof value === "string" && value),
    ),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function addUnique(values, value) {
  if (typeof value === "string" && value && !values.includes(value)) {
    values.push(value);
  }
}

function escapeHtmlMarker(value) {
  return value.replace(/&/gu, "&amp;");
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function redactUrl(value) {
  const url = new URL(value);
  if (url.pathname.includes("/tenant/invitations/")) {
    url.pathname = "/api/v1/tenant/invitations/[redacted]/validate";
  }
  return url.toString();
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /token|password|secret|authorization|apikey|api_key|refresh/iu.test(key)
          ? "[redacted]"
          : redactSensitive(entry),
      ]),
    );
  }
  return value;
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/"access_token"\s*:\s*"[^"]+"/giu, '"access_token":"[redacted]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/giu, '"refresh_token":"[redacted]"')
    .replace(/"token"\s*:\s*"[^"]+"/giu, '"token":"[redacted]"')
    .replace(
      /tenant\/invitations\/[^/?"]+/giu,
      "tenant/invitations/[redacted]",
    );
}

function safeJson(value) {
  try {
    return JSON.stringify(redactSensitive(value));
  } catch {
    return "[unserializable]";
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
