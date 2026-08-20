import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8842";
const DEFAULT_STUB_URL = "http://127.0.0.1:8843";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const EMPTY_UUID = "00000000-0000-4000-8000-000000000000";
const EMPTY_EMAIL = "__capveri_no_email__";
const EMPTY_ORG_NAME = "__capveri_no_org_name__";
const TERMS_VERSION = "2026-06-03";
const TERMS_HASH =
  "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const LOCAL_SUPABASE_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

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
    fail(`local team E2E always owns ${DEFAULT_BASE_URL}`);
  }
  if (args["stub-url"] || process.env.npm_config_stub_url) {
    fail(`local team E2E always owns ${DEFAULT_STUB_URL}`);
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

  if (process.env.CI) {
    fail("Refusing to run local team E2E in CI.");
  }

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
          stub,
          supabaseUrl,
          anonKey,
          databaseUrl,
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
    try {
      await worker.close();
    } catch (error) {
      closeError = error;
    }
    try {
      await stub.close();
    } catch (error) {
      closeError ??= error;
    }
  }

  if (runError && closeError) {
    console.error(
      `Local team Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedTeamAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.ownerToken);
  const hiddenHeaders = jsonAuthHeaders(account.hiddenOwnerToken);
  const generatedUserIds = new Set([
    account.ownerUserId,
    account.hiddenOwnerId,
  ]);
  const generatedOrgIds = new Set([
    account.organizationId,
    account.hiddenOrganizationId,
  ]);
  const generatedEmails = new Set([
    account.ownerEmail,
    account.hiddenOwnerEmail,
    account.invitedEmail,
    account.existingEmail,
    account.revokedEmail,
    account.hiddenInviteEmail,
  ]);
  let invitedUserId;
  let invitedToken;
  let existingUserId;
  let result;
  let runError;

  try {
    const emailStart = input.stub.requests.length;
    const invitation = await createInvitation(input.baseUrl, ownerHeaders, {
      email: account.invitedEmail.toUpperCase(),
      role: "member",
    });
    assert(invitation.email === account.invitedEmail, "invite email mismatch");
    assert(invitation.role === "member", "invite role mismatch");
    assert(
      invitation.organization_id === account.organizationId,
      "invite org mismatch",
    );
    assert(typeof invitation.token === "string", "invite token missing");
    const invitationEmail = await waitForStubRequest(input.stub, {
      start: emailStart,
      predicate: (request) =>
        request.path === "/resend/emails" &&
        request.body.to?.[0] === account.invitedEmail,
      message: "team invitation email was not sent",
    });
    assertTeamInvitationEmailContract(invitationEmail.body, {
      toEmail: account.invitedEmail,
      organizationName: account.organizationName,
      role: "member",
      inviterName: "Local Team Owner",
      signupUrl: `${input.baseUrl}/team/signup?token=${encodeURIComponent(invitation.token)}`,
      expiresAt: invitation.expires_at,
    });

    const validInvitation = await expectJson(
      `${input.baseUrl}/api/v1/team/invitations/${invitation.token}/validate`,
      { status: 200 },
    );
    assert(validInvitation.valid === true, "invitation should validate");
    assert(
      validInvitation.email === account.invitedEmail,
      "validated invitation email mismatch",
    );
    assert(
      validInvitation.organization_name === account.organizationName,
      "validated invitation org name mismatch",
    );

    const signup = await expectJson(`${input.baseUrl}/api/v1/team/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "127.0.0.1",
        "user-agent": "local-team-e2e",
      },
      status: 201,
      body: JSON.stringify({
        token: invitation.token,
        password: account.invitedPassword,
        full_name: "Local Team Invitee",
        accepted_terms: true,
        terms_version: TERMS_VERSION,
        terms_hash: TERMS_HASH,
      }),
    });
    invitedUserId = signup.user_id;
    invitedToken = signup.access_token;
    generatedUserIds.add(invitedUserId);
    assertExactKeys(
      signup,
      ["success", "user_id", "access_token", "refresh_token", "user"],
      "team signup response",
    );
    assert(signup.success === true, "team signup success flag mismatch");
    assert(typeof invitedToken === "string", "team signup token missing");
    assert(
      typeof signup.refresh_token === "string" &&
        signup.refresh_token.length > 0,
      "team signup refresh token missing",
    );
    assert(
      signup.user?.email === account.invitedEmail,
      "signup email mismatch",
    );
    assert(signup.user?.role === "member", "signup role mismatch");
    const welcomeEmail = await waitForStubRequest(input.stub, {
      start: emailStart,
      predicate: (request) =>
        request.path === "/resend/emails" &&
        request.body.to?.[0] === account.invitedEmail &&
        request.body.subject?.startsWith("Welcome to "),
      message: "team welcome email was not sent",
    });
    assertTeamWelcomeEmailContract(welcomeEmail.body, {
      toEmail: account.invitedEmail,
      organizationName: account.organizationName,
      fullName: "Local Team Invitee",
      role: "member",
      dashboardUrl: input.baseUrl,
    });

    const usedInvitation = await expectJson(
      `${input.baseUrl}/api/v1/team/invitations/${invitation.token}/validate`,
      { status: 200 },
    );
    assert(
      usedInvitation.valid === false && usedInvitation.error_reason === "used",
      "used invitation should no longer validate",
    );

    await assertInvitationUsed(sql, {
      invitationId: invitation.id,
      usedByUserId: invitedUserId,
    });
    await assertLegalAcceptance(sql, {
      userId: invitedUserId,
      organizationId: account.organizationId,
      source: "team_invitation_signup",
    });

    let members = await listMembers(input.baseUrl, ownerHeaders);
    assertMemberSnapshot(
      members,
      [
        {
          id: account.ownerUserId,
          email: account.ownerEmail,
          full_name: "Local Team Owner",
          role: "owner",
          is_current_user: true,
        },
        {
          id: invitedUserId,
          email: account.invitedEmail,
          full_name: "Local Team Invitee",
          role: "member",
          is_current_user: false,
        },
      ],
      account,
      "post-signup members",
    );

    const viewer = await updateMemberRole(input.baseUrl, ownerHeaders, {
      memberId: invitedUserId,
      role: "viewer",
    });
    assert(viewer.role === "viewer", "member viewer role update mismatch");
    await assertPublicUserRole(sql, invitedUserId, "viewer");
    members = await listMembers(input.baseUrl, ownerHeaders);
    assertMemberSnapshot(
      members,
      [
        {
          id: account.ownerUserId,
          email: account.ownerEmail,
          full_name: "Local Team Owner",
          role: "owner",
          is_current_user: true,
        },
        {
          id: invitedUserId,
          email: account.invitedEmail,
          full_name: "Local Team Invitee",
          role: "viewer",
          is_current_user: false,
        },
      ],
      account,
      "viewer-role members",
    );

    await expectJson(
      `${input.baseUrl}/api/v1/team/members/${account.ownerUserId}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 400,
        body: JSON.stringify({ role: "viewer" }),
      },
    );

    const invitedAdmin = await updateMemberRole(input.baseUrl, ownerHeaders, {
      memberId: invitedUserId,
      role: "admin",
    });
    assert(invitedAdmin.role === "admin", "member admin role update mismatch");
    members = await listMembers(input.baseUrl, ownerHeaders);
    assertMemberSnapshot(
      members,
      [
        {
          id: account.ownerUserId,
          email: account.ownerEmail,
          full_name: "Local Team Owner",
          role: "owner",
          is_current_user: true,
        },
        {
          id: invitedUserId,
          email: account.invitedEmail,
          full_name: "Local Team Invitee",
          role: "admin",
          is_current_user: false,
        },
      ],
      account,
      "admin-role members",
    );
    const ownerRemoval = await expectJson(
      `${input.baseUrl}/api/v1/team/members/${account.ownerUserId}`,
      {
        method: "DELETE",
        headers: jsonAuthHeaders(invitedToken),
        status: 400,
      },
    );
    assert(
      ownerRemoval.error?.code === "invalid_team_request",
      "owner removal guard error mismatch",
    );

    const hiddenInvitation = await createInvitation(
      input.baseUrl,
      hiddenHeaders,
      {
        email: account.hiddenInviteEmail,
        role: "viewer",
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/team/invitations/${hiddenInvitation.id}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 404,
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/team/members/${account.hiddenOwnerId}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({ role: "viewer" }),
      },
    );
    await assertInvitationList(input.baseUrl, ownerHeaders, [], account, {
      label: "visible pending invitations after hidden invite",
    });

    const removed = await expectJson(
      `${input.baseUrl}/api/v1/team/members/${invitedUserId}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 200,
      },
    );
    assertDeepEqual(
      removed,
      { status: "removed", member_id: invitedUserId },
      "remove member response",
    );
    members = await listMembers(input.baseUrl, ownerHeaders);
    assertMemberSnapshot(
      members,
      [
        {
          id: account.ownerUserId,
          email: account.ownerEmail,
          full_name: "Local Team Owner",
          role: "owner",
          is_current_user: true,
        },
      ],
      account,
      "post-removal members",
    );

    const existing = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: account.existingEmail,
      password: account.existingPassword,
      fullName: "Existing Local User",
    });
    existingUserId = existing.userId;
    generatedUserIds.add(existingUserId);
    generatedOrgIds.add(existing.signupOrganizationId);
    await upsertPublicUser(sql, {
      userId: existingUserId,
      organizationId: account.organizationId,
      email: account.existingEmail,
      fullName: "Existing Local User",
      role: "viewer",
    });
    const existingInvite = await createInvitation(input.baseUrl, ownerHeaders, {
      email: account.existingEmail,
      role: "admin",
    });
    await assertInvitationList(
      input.baseUrl,
      ownerHeaders,
      [
        {
          id: existingInvite.id,
          email: account.existingEmail,
          role: "admin",
          used: false,
          revoked: false,
        },
      ],
      account,
      { label: "visible pending invitation before existing accept" },
    );
    const accept = await expectJson(
      `${input.baseUrl}/api/v1/team/invitations/accept`,
      {
        method: "POST",
        headers: jsonAuthHeaders(existing.accessToken),
        status: 200,
        body: JSON.stringify({
          token: existingInvite.token,
          user_id: existingUserId,
        }),
      },
    );
    assertDeepEqual(
      accept,
      {
        success: true,
        message: "Team invitation accepted successfully",
      },
      "existing invitation accept response",
    );
    await assertPublicUserRole(sql, existingUserId, "admin");
    members = await listMembers(input.baseUrl, ownerHeaders);
    assertMemberSnapshot(
      members,
      [
        {
          id: account.ownerUserId,
          email: account.ownerEmail,
          full_name: "Local Team Owner",
          role: "owner",
          is_current_user: true,
        },
        {
          id: existingUserId,
          email: account.existingEmail,
          full_name: "Existing Local User",
          role: "admin",
          is_current_user: false,
        },
      ],
      account,
      "post-existing-accept members",
    );
    await assertInvitationList(input.baseUrl, ownerHeaders, [], account, {
      label: "visible pending invitations after existing accept",
    });

    const revoked = await createInvitation(input.baseUrl, ownerHeaders, {
      email: account.revokedEmail,
      role: "viewer",
    });
    await assertInvitationList(
      input.baseUrl,
      ownerHeaders,
      [
        {
          id: revoked.id,
          email: account.revokedEmail,
          role: "viewer",
          used: false,
          revoked: false,
        },
      ],
      account,
      { label: "visible pending invitation before revoke" },
    );
    const revoke = await expectJson(
      `${input.baseUrl}/api/v1/team/invitations/${revoked.id}`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 200,
      },
    );
    assertDeepEqual(
      revoke,
      { status: "revoked", invitation_id: revoked.id },
      "revoke invitation response",
    );
    const revokedValidation = await expectJson(
      `${input.baseUrl}/api/v1/team/invitations/${revoked.token}/validate`,
      { status: 200 },
    );
    assert(
      revokedValidation.valid === false &&
        revokedValidation.error_reason === "revoked",
      "revoked invitation should not validate",
    );
    await assertInvitationList(input.baseUrl, ownerHeaders, [], account, {
      label: "visible pending invitations after revoke",
    });

    const invitations = await expectJson(
      `${input.baseUrl}/api/v1/team/invitations?include_used=true`,
      { headers: ownerHeaders, status: 200 },
    );
    assertInvitationSnapshot(
      invitations,
      [
        {
          id: invitation.id,
          email: account.invitedEmail,
          role: "member",
          used: true,
          revoked: false,
        },
        {
          id: existingInvite.id,
          email: account.existingEmail,
          role: "admin",
          used: true,
          revoked: false,
        },
        {
          id: revoked.id,
          email: account.revokedEmail,
          role: "viewer",
          used: false,
          revoked: true,
        },
      ],
      account,
      "include_used invitation list",
    );

    result = {
      index: input.index,
      organization_id: account.organizationId,
      invited_user_id: invitedUserId,
      existing_user_id: existingUserId,
      invitation_count_checked: invitations.length,
      resend_calls: input.stub.requests.length - emailStart,
    };
  } catch (error) {
    runError = error;
  } finally {
    const cleanupErrors = [];
    try {
      await cleanupTeamAccount(sql, {
        orgIds: [...generatedOrgIds].filter(Boolean),
        userIds: [...generatedUserIds].filter(Boolean),
        emails: [...generatedEmails],
        organizationNames: [
          account.organizationName,
          account.hiddenOrganizationName,
          account.invitedSignupOrganizationName,
          account.existingSignupOrganizationName,
        ],
      });
      await assertCleanupComplete(sql, {
        orgIds: [...generatedOrgIds].filter(Boolean),
        userIds: [...generatedUserIds].filter(Boolean),
        emails: [...generatedEmails],
        organizationNames: [
          account.organizationName,
          account.hiddenOrganizationName,
          account.invitedSignupOrganizationName,
          account.existingSignupOrganizationName,
        ],
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      const cleanupMessage = cleanupErrors.map(errorMessage).join("; ");
      if (runError) {
        console.error(
          `Local team cleanup failed after scenario failure: ${cleanupMessage}`,
        );
      } else {
        fail(cleanupMessage);
      }
    }
  }

  if (runError) throw runError;
  if (result) return result;
  fail("Local team E2E ended without returning a result.");
}

async function seedTeamAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ownerEmail = `team-e2e-owner-${suffix}@capveri.local`;
  const hiddenOwnerEmail = `team-e2e-hidden-owner-${suffix}@capveri.local`;
  const organizationName = `Local Team E2E Org ${suffix}`;
  const hiddenOrganizationName = `Local Team Hidden Org ${suffix}`;
  let owner;
  let hiddenOwner;

  try {
    owner = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: ownerEmail,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local Team Owner",
      organizationName,
    });
    hiddenOwner = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: hiddenOwnerEmail,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local Hidden Owner",
      organizationName: hiddenOrganizationName,
    });
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        update users
        set role = 'owner',
            full_name = 'Local Team Owner',
            updated_at = now()
        where id = ${owner.userId}
      `;
      await sql`
        update users
        set role = 'owner',
            full_name = 'Local Hidden Owner',
            updated_at = now()
        where id = ${hiddenOwner.userId}
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await cleanupTeamAccount(sql, {
        orgIds: [
          owner?.signupOrganizationId,
          hiddenOwner?.signupOrganizationId,
        ].filter(Boolean),
        userIds: [owner?.userId, hiddenOwner?.userId].filter(Boolean),
        emails: [ownerEmail, hiddenOwnerEmail],
        organizationNames: [organizationName, hiddenOrganizationName],
      });
      await assertCleanupComplete(sql, {
        orgIds: [
          owner?.signupOrganizationId,
          hiddenOwner?.signupOrganizationId,
        ].filter(Boolean),
        userIds: [owner?.userId, hiddenOwner?.userId].filter(Boolean),
        emails: [ownerEmail, hiddenOwnerEmail],
        organizationNames: [organizationName, hiddenOrganizationName],
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
    throw error;
  }

  return {
    ownerEmail,
    ownerUserId: owner.userId,
    ownerToken: owner.accessToken,
    organizationId: owner.signupOrganizationId,
    organizationName,
    hiddenOwnerEmail,
    hiddenOwnerId: hiddenOwner.userId,
    hiddenOwnerToken: hiddenOwner.accessToken,
    hiddenOrganizationId: hiddenOwner.signupOrganizationId,
    hiddenOrganizationName,
    invitedEmail: `team-e2e-invite-${suffix}@capveri.local`,
    invitedSignupOrganizationName: `team-e2e-invite-${suffix}'s Organization`,
    invitedPassword: `InvitePass${input.index}A1!`,
    existingEmail: `team-e2e-existing-${suffix}@capveri.local`,
    existingPassword: `ExistingPass${input.index}A1!`,
    existingSignupOrganizationName: `team-e2e-existing-${suffix}'s Organization`,
    revokedEmail: `team-e2e-revoked-${suffix}@capveri.local`,
    hiddenInviteEmail: `team-e2e-hidden-invite-${suffix}@capveri.local`,
  };
}

async function createLocalAuthUser(input) {
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: {
        full_name: input.fullName,
        organization_name: input.organizationName,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(
      `Supabase signup failed for generated local user: ${safeJson(
        redactSensitiveJson(body),
      )}`,
    );
  }
  const userId = body.user?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    fail("Supabase signup response did not include user id.");
  }

  let signupOrganizationId;
  try {
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        update auth.users
        set email_confirmed_at = coalesce(email_confirmed_at, now())
        where id = ${userId}
      `;
      const rows = await sql`
        select organization_id
        from users
        where id = ${userId}
        limit 1
      `;
      signupOrganizationId = rows[0]?.organization_id;
    } finally {
      await sql.end({ timeout: 5 });
    }

    const accessToken =
      body.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: input.email,
        password: input.password,
      }));
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      fail("Supabase signup/sign-in did not return an access token.");
    }
    if (
      typeof signupOrganizationId !== "string" ||
      signupOrganizationId === ""
    ) {
      fail("Signup trigger did not create a public user organization.");
    }

    return { userId, accessToken, signupOrganizationId };
  } catch (error) {
    try {
      await cleanupPartialLocalAuthUser({
        databaseUrl: input.databaseUrl,
        userId,
        email: input.email,
        organizationName: input.organizationName,
        signupOrganizationId,
      });
    } catch (cleanupError) {
      console.error(
        `Partial signup cleanup failed: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`,
      );
    }
    throw error;
  }
}

async function createInvitation(baseUrl, headers, input) {
  return expectJson(`${baseUrl}/api/v1/team/invitations`, {
    method: "POST",
    headers,
    status: 201,
    body: JSON.stringify(input),
  });
}

async function listMembers(baseUrl, headers) {
  const members = await expectJson(`${baseUrl}/api/v1/team/members`, {
    headers,
    status: 200,
  });
  assert(Array.isArray(members), "team members response should be an array");
  return members;
}

async function updateMemberRole(baseUrl, headers, input) {
  return expectJson(`${baseUrl}/api/v1/team/members/${input.memberId}`, {
    method: "PATCH",
    headers,
    status: 200,
    body: JSON.stringify({ role: input.role }),
  });
}

async function waitForStubRequest(stub, input) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const request = stub.requests.slice(input.start).find(input.predicate);
    if (request) return request;
    await stub.waitForChange();
  }
  fail(input.message);
}

async function assertInvitationList(
  baseUrl,
  headers,
  expected,
  account,
  options,
) {
  const invitations = await expectJson(`${baseUrl}/api/v1/team/invitations`, {
    headers,
    status: 200,
  });
  assertInvitationSnapshot(
    invitations,
    expected,
    account,
    options?.label ?? "invitation list",
  );
}

function assertMemberSnapshot(members, expected, account, label) {
  assert(Array.isArray(members), `${label} should be an array`);
  assert(
    members.length === expected.length,
    `${label} length mismatch: expected ${expected.length}, got ${members.length}`,
  );
  for (const [index, member] of members.entries()) {
    const target = expected[index];
    assert(target, `${label} unexpected member at index ${index}`);
    assert(member.id === target.id, `${label} member ${index} id mismatch`);
    assert(
      member.email === target.email,
      `${label} member ${index} email mismatch`,
    );
    assert(
      member.full_name === target.full_name,
      `${label} member ${index} full_name mismatch`,
    );
    assert(
      member.role === target.role,
      `${label} member ${index} role mismatch`,
    );
    assert(
      member.is_current_user === target.is_current_user,
      `${label} member ${index} current-user flag mismatch`,
    );
    assertIsoTimestamp(
      member.created_at,
      `${label} member ${index} created_at`,
    );
    assertIsoTimestamp(
      member.updated_at,
      `${label} member ${index} updated_at`,
    );
  }
  assertNoTeamLeakage(JSON.stringify(members), account, label);
}

function assertTeamInvitationEmailContract(payload, expected) {
  assert(
    payload?.from === "CapVeri <local@capveri.local>",
    "team invitation email from mismatch",
  );
  assert(
    Array.isArray(payload?.to) &&
      payload.to.length === 1 &&
      payload.to[0] === expected.toEmail,
    "team invitation email recipient mismatch",
  );
  assert(
    payload?.subject ===
      `You're invited to ${expected.organizationName} on CapVeri`,
    "team invitation email subject mismatch",
  );

  const text = String(payload?.text ?? "");
  const html = String(payload?.html ?? "");
  for (const [label, value] of [
    ["inviter", `${expected.inviterName} invited you to CapVeri`],
    ["organization", expected.organizationName],
    ["role", expected.role],
    ["signup URL", expected.signupUrl],
    ["expiration", expected.expiresAt],
  ]) {
    assert(text.includes(value), `team invitation email text missing ${label}`);
    assert(
      html.includes(value) || html.includes(escapeHtmlMarker(value)),
      `team invitation email html missing ${label}`,
    );
  }
}

function assertTeamWelcomeEmailContract(payload, expected) {
  assert(
    payload?.from === "CapVeri <local@capveri.local>",
    "team welcome email from mismatch",
  );
  assert(
    Array.isArray(payload?.to) &&
      payload.to.length === 1 &&
      payload.to[0] === expected.toEmail,
    "team welcome email recipient mismatch",
  );
  assert(
    payload?.subject === `Welcome to ${expected.organizationName} on CapVeri`,
    "team welcome email subject mismatch",
  );

  const text = String(payload?.text ?? "");
  const html = String(payload?.html ?? "");
  for (const [label, value] of [
    ["heading", `Welcome to ${expected.organizationName} on CapVeri`],
    [
      "intro",
      `Hi ${expected.fullName}, your ${expected.role} account is ready.`,
    ],
    ["dashboard URL", expected.dashboardUrl],
  ]) {
    assert(text.includes(value), `team welcome email text missing ${label}`);
    assert(
      html.includes(value) || html.includes(escapeHtmlMarker(value)),
      `team welcome email html missing ${label}`,
    );
  }
}

function assertInvitationSnapshot(invitations, expected, account, label) {
  assert(Array.isArray(invitations), `${label} should be an array`);
  assert(
    invitations.length === expected.length,
    `${label} length mismatch: expected ${expected.length}, got ${invitations.length}`,
  );
  const byId = new Map(
    invitations.map((invitation) => [invitation.id, invitation]),
  );
  for (const target of expected) {
    const invitation = byId.get(target.id);
    assert(invitation, `${label} missing invitation ${target.id}`);
    assert(
      invitation.email === target.email,
      `${label} invitation ${target.id} email mismatch`,
    );
    assert(
      invitation.role === target.role,
      `${label} invitation ${target.id} role mismatch`,
    );
    assert(
      invitation.organization_id === account.organizationId,
      `${label} invitation ${target.id} organization mismatch`,
    );
    assert(
      typeof invitation.token === "string" && invitation.token.length >= 32,
      `${label} invitation ${target.id} token missing`,
    );
    assertIsoTimestamp(
      invitation.expires_at,
      `${label} invitation ${target.id} expires_at`,
    );
    assertIsoTimestamp(
      invitation.created_at,
      `${label} invitation ${target.id} created_at`,
    );
    assert(
      Boolean(invitation.used_at) === target.used,
      `${label} invitation ${target.id} used_at mismatch`,
    );
    assert(
      Boolean(invitation.revoked_at) === target.revoked,
      `${label} invitation ${target.id} revoked_at mismatch`,
    );
    if (target.used) {
      assertIsoTimestamp(
        invitation.used_at,
        `${label} invitation ${target.id} used_at`,
      );
    }
    if (target.revoked) {
      assertIsoTimestamp(
        invitation.revoked_at,
        `${label} invitation ${target.id} revoked_at`,
      );
    }
  }
  assertInvitationsCreatedDescending(invitations, label);
  assertNoTeamLeakage(JSON.stringify(invitations), account, label);
}

function assertInvitationsCreatedDescending(invitations, label) {
  for (let index = 1; index < invitations.length; index += 1) {
    const previous = invitations[index - 1];
    const current = invitations[index];
    const previousCreated = Date.parse(previous.created_at);
    const currentCreated = Date.parse(current.created_at);
    assert(
      Number.isFinite(previousCreated) && Number.isFinite(currentCreated),
      `${label} invitation created_at should parse`,
    );
    assert(
      previousCreated > currentCreated ||
        (previousCreated === currentCreated && previous.id >= current.id),
      `${label} invitation order mismatch at index ${index}`,
    );
  }
}

function assertIsoTimestamp(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} missing`);
  assert(
    Number.isFinite(Date.parse(value)),
    `${label} should be an ISO timestamp`,
  );
}

function assertNoTeamLeakage(serialized, account, label) {
  for (const forbidden of [
    account.hiddenOwnerId,
    account.hiddenOwnerEmail,
    account.hiddenOrganizationId,
    account.hiddenOrganizationName,
    account.hiddenInviteEmail,
    account.invitedSignupOrganizationName,
    account.existingSignupOrganizationName,
  ]) {
    assert(
      !serialized.includes(forbidden),
      `${label} leaked forbidden team marker ${forbidden}`,
    );
  }
}

async function upsertPublicUser(sql, input) {
  await sql`
    insert into users (id, organization_id, email, full_name, role)
    values (
      ${input.userId},
      ${input.organizationId},
      ${input.email},
      ${input.fullName},
      ${input.role}
    )
    on conflict (id) do update set
      organization_id = excluded.organization_id,
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      updated_at = now()
  `;
}

async function assertPublicUserRole(sql, userId, role) {
  const rows = await sql`
    select role
    from users
    where id = ${userId}
    limit 1
  `;
  assert(rows[0]?.role === role, `expected user role ${role}`);
}

async function assertInvitationUsed(sql, input) {
  const rows = await sql`
    select used_by_user_id
    from team_member_invitations
    where id = ${input.invitationId}
    limit 1
  `;
  assert(
    rows[0]?.used_by_user_id === input.usedByUserId,
    "invitation used_by_user_id mismatch",
  );
}

async function assertLegalAcceptance(sql, input) {
  const rows = await sql`
    select count(*)::int as count
    from legal_acceptances
    where user_id = ${input.userId}
      and organization_id = ${input.organizationId}
      and source = ${input.source}
      and document_version = ${TERMS_VERSION}
      and document_hash = ${TERMS_HASH}
  `;
  assert(rows[0]?.count === 1, "legal acceptance was not recorded");
}

async function cleanupTeamAccount(sql, input) {
  const cleanup = normalizedCleanupInput(input);
  await sql.begin(async (transaction) => {
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(cleanup.orgIds)}
         or user_id in ${transaction(cleanup.userIds)}
         or user_id in (
           select id
           from auth.users
           where email in ${transaction(cleanup.emails)}
         )
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
  });
  await sql`
    delete from signup_email_events
    where organization_id in ${sql(cleanup.orgIds)}
       or user_id in ${sql(cleanup.userIds)}
       or email in ${sql(cleanup.emails)}
  `;
  await sql`
    delete from team_member_invitations
    where organization_id in ${sql(cleanup.orgIds)}
       or email in ${sql(cleanup.emails)}
       or invited_by in ${sql(cleanup.userIds)}
       or used_by_user_id in ${sql(cleanup.userIds)}
  `;
  await sql`
    delete from audit_log
    where organization_id in ${sql(cleanup.orgIds)}
       or changed_by in ${sql(cleanup.userIds)}
  `;
  await sql`
    delete from users
    where id in ${sql(cleanup.userIds)}
       or email in ${sql(cleanup.emails)}
       or organization_id in ${sql(cleanup.orgIds)}
  `;
  await sql`
    delete from auth.users
    where id in ${sql(cleanup.userIds)}
       or email in ${sql(cleanup.emails)}
  `;
  await sql`
    delete from organizations
    where id in ${sql(cleanup.orgIds)}
       or name in ${sql(cleanup.organizationNames)}
  `;
}

async function assertCleanupComplete(sql, input) {
  const cleanup = normalizedCleanupInput(input);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(cleanup.userIds)} or email in ${sql(cleanup.emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(cleanup.userIds)} or email in ${sql(cleanup.emails)} or organization_id in ${sql(cleanup.orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(cleanup.orgIds)} or name in ${sql(cleanup.organizationNames)}) as org_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(cleanup.orgIds)} or user_id in ${sql(cleanup.userIds)} or email in ${sql(cleanup.emails)}) as signup_email_event_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(cleanup.orgIds)} or user_id in ${sql(cleanup.userIds)}) as legal_acceptance_count,
      (select count(*)::int from team_member_invitations where organization_id in ${sql(cleanup.orgIds)} or email in ${sql(cleanup.emails)} or invited_by in ${sql(cleanup.userIds)} or used_by_user_id in ${sql(cleanup.userIds)}) as invitation_count,
      (select count(*)::int from audit_log where organization_id in ${sql(cleanup.orgIds)} or changed_by in ${sql(cleanup.userIds)}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(
    row.signup_email_event_count === 0,
    "cleanup left signup email events",
  );
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.invitation_count === 0, "cleanup left team invitations");
  assert(row.audit_log_count === 0, "cleanup left audit log rows");
}

async function cleanupPartialLocalAuthUser(input) {
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  try {
    const publicRows = await sql`
      select id, organization_id
      from users
      where id = ${input.userId}
         or email = ${input.email}
    `;
    const authRows = await sql`
      select id
      from auth.users
      where id = ${input.userId}
         or email = ${input.email}
    `;
    const orgIds = [
      input.signupOrganizationId,
      ...publicRows.map((row) => row.organization_id),
    ].filter((id) => typeof id === "string" && id.length > 0);
    const userIds = [
      input.userId,
      ...publicRows.map((row) => row.id),
      ...authRows.map((row) => row.id),
    ].filter((id) => typeof id === "string" && id.length > 0);

    await cleanupTeamAccount(sql, {
      orgIds: [...new Set(orgIds)],
      userIds: [...new Set(userIds)],
      emails: [input.email],
      organizationNames: [input.organizationName].filter(
        (name) => typeof name === "string" && name.length > 0,
      ),
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function normalizedCleanupInput(input) {
  return {
    orgIds: nonEmpty(input.orgIds, EMPTY_UUID),
    userIds: nonEmpty(input.userIds, EMPTY_UUID),
    emails: nonEmpty(input.emails, EMPTY_EMAIL),
    organizationNames: nonEmpty(input.organizationNames, EMPTY_ORG_NAME),
  };
}

function nonEmpty(values, fallback) {
  const normalized = [...new Set((values ?? []).filter(Boolean))];
  return normalized.length > 0 ? normalized : [fallback];
}

function escapeHtmlMarker(value) {
  return String(value).replace(/&/gu, "&amp;");
}

async function signInWithPassword(input) {
  const url = new URL("/auth/v1/token", input.supabaseUrl);
  url.searchParams.set("grant_type", "password");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return undefined;
  }
  return body.access_token;
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
      `APP_BASE_URL:${input.baseUrl}`,
      "--var",
      `MARKETING_BASE_URL:${input.baseUrl}`,
      "--var",
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      `RESEND_API_BASE_URL:${input.stubUrl}/resend`,
      "--var",
      "RESEND_API_KEY:local-team-e2e-resend-key",
      "--var",
      "RESEND_FROM_ADDRESS:CapVeri <local@capveri.local>",
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
    if (code !== null && code !== 0) {
      output += `\nwrangler dev exited with ${code}`;
    }
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
      fail(`wrangler dev failed to spawn\n${output.slice(-2000)}`);
    }
    if (child.exitCode !== null) {
      fail(`wrangler dev exited before health\n${output.slice(-2000)}`);
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-team-e2e-"));
  const path = resolve(directory, ".dev.vars.local-team-e2e");
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
      `APP_BASE_URL=${input.baseUrl}`,
      `MARKETING_BASE_URL=${input.baseUrl}`,
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      `RESEND_API_BASE_URL=${input.stubUrl}/resend`,
      "RESEND_API_KEY=local-team-e2e-resend-key",
      "RESEND_FROM_ADDRESS=CapVeri <local@capveri.local>",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-team-e2e-signing-secret",
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
  env.APP_BASE_URL = input.baseUrl;
  env.MARKETING_BASE_URL = input.baseUrl;
  env.RESEND_API_BASE_URL = `${input.stubUrl}/resend`;
  env.RESEND_API_KEY = "local-team-e2e-resend-key";
  env.RESEND_FROM_ADDRESS = "CapVeri <local@capveri.local>";
  return env;
}

async function startResendStub(stubUrl) {
  const url = new URL(stubUrl);
  const requests = [];
  const waiters = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    const body = text ? JSON.parse(text) : {};
    requests.push({
      method: request.method ?? "GET",
      path: new URL(request.url ?? "/", stubUrl).pathname,
      body,
    });
    for (const resolveWaiter of waiters.splice(0)) resolveWaiter();
    if (request.url?.startsWith("/resend/emails")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: `team-email-${requests.length}` }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unhandled local team stub path" }));
  });
  await new Promise((resolveListen) => {
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  return {
    requests,
    close: async () => {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
      await waitForPortClosed(stubUrl);
    },
    waitForChange: () =>
      new Promise((resolveWaiter) => {
        waiters.push(resolveWaiter);
        setTimeout(resolveWaiter, 100);
      }),
  };
}

async function assertSupabaseServiceRole(input) {
  const response = await fetch(
    new URL("/auth/v1/admin/users", input.supabaseUrl),
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
    await delay(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await delay(250);
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//i.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
    if (!key) {
      fail(`Invalid argument: ${arg}`);
    }
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
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

async function readEnvValue(path, names) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  for (const name of names) {
    const line = content
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    if (!line) {
      continue;
    }
    const value = line.slice(line.indexOf("=") + 1).trim();
    return value.replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

function normalizedLocalUrl(rawUrl, label) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:") {
    fail(`${label} must use http for local-only E2E`);
  }
  if (url.username || url.password) {
    fail(`${label} must not include credentials`);
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
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
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("database-url must be a valid Postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must use postgres or postgresql");
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail("database-url must point at localhost or loopback");
  }
  if (url.port !== "54322") {
    fail("database-url must point at local Supabase Postgres on port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must use the local Supabase /postgres database");
  }
  return url.toString();
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const safeUrl = redactSensitiveUrl(url);
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${safeUrl} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const text = await response.text();
  const body = parseJsonResponse(text, safeUrl);
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${safeUrl} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

function parseJsonResponse(text, url) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from ${url}, received: ${text.slice(0, 500)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  const actualKeys = Object.keys(actual).sort();
  const sortedExpected = [...expectedKeys].sort();
  assert(
    JSON.stringify(actualKeys) === JSON.stringify(sortedExpected),
    `${label} keys mismatch: expected ${sortedExpected.join(",")}, got ${actualKeys.join(",")}`,
  );
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(stableJson(actual));
  const expectedJson = JSON.stringify(stableJson(expected));
  if (actualJson !== expectedJson) {
    fail(
      `${label} mismatch:\nexpected ${JSON.stringify(expected, null, 2)}\nactual ${JSON.stringify(actual, null, 2)}`,
    );
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJson(value[key])]),
    );
  }
  return value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}

function redactSensitiveUrl(value) {
  const text = String(value);
  return text.replace(
    /\/team\/invitations\/[a-zA-Z0-9_-]{16,}\/validate/gu,
    "/team/invitations/[REDACTED]/validate",
  );
}

function redactSensitiveJson(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (
          /token|password|refresh|authorization|apikey|api_key|secret/iu.test(
            key,
          )
        ) {
          return [key, "[REDACTED]"];
        }
        return [key, redactSensitiveJson(entry)];
      }),
    );
  }
  return value;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
