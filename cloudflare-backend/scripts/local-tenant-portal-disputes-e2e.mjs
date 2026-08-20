import { Buffer } from "node:buffer";
import { execFile, spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { promisify, TextDecoder } from "node:util";
import { unzlibSync } from "fflate";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8858";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const LOCAL_SUPABASE_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";
const DOCUMENTS_BUCKET_NAME = "capveri-documents-dev";
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-12-31";
const TERMS_VERSION = "2026-06-03";
const TERMS_HASH =
  "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const execFileAsync = promisify(execFile);
const ATTACHMENT_BYTES = Buffer.from(
  "%PDF-1.4\n% Local tenant dispute attachment\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
  "utf8",
);
const TENANT_DISPUTE_SUMMARY_KEYS = [
  "category",
  "created_at",
  "description",
  "id",
  "statement_id",
  "status",
];
const TENANT_DISPUTE_DETAIL_KEYS = [
  ...TENANT_DISPUTE_SUMMARY_KEYS,
  "attachments",
  "comments",
];
const ADMIN_DISPUTE_DETAIL_KEYS = [
  "assigned_to",
  "attachments",
  "category",
  "comments",
  "created_at",
  "description",
  "id",
  "organization_id",
  "resolution_summary",
  "resolved_at",
  "resolved_by",
  "statement_id",
  "status",
  "tenant_user_id",
  "updated_at",
];
const DISPUTE_COMMENT_KEYS = [
  "author_id",
  "author_name",
  "content",
  "created_at",
  "dispute_id",
  "id",
  "is_internal",
];
const DISPUTE_ATTACHMENT_KEYS = [
  "content_type",
  "created_at",
  "file_size_bytes",
  "file_url",
  "filename",
  "id",
];

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
    fail(`local tenant portal/disputes E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalSupabaseUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
    "supabase-url",
  );
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      DEFAULT_DATABASE_URL,
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
    fail("Refusing to run local tenant portal/disputes E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  await assertSupabaseServiceRole({ supabaseUrl, serviceRoleKey });
  const worker = await startWorkerServer({
    baseUrl,
    supabaseUrl,
    databaseUrl,
    serviceRoleKey,
  });
  let runError;
  let cleanupError;
  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
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
  }
  try {
    await worker.close();
  } catch (error) {
    cleanupError = error;
  }
  if (runError) {
    if (cleanupError) {
      console.error(
        `Worker cleanup failed after tenant portal/disputes scenario failure: ${errorMessage(cleanupError)}`,
      );
    }
    throw runError;
  }
  if (cleanupError) throw cleanupError;
}

async function runOnce(input) {
  const account = await seedLandlordAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const landlordHeaders = {
    authorization: `Bearer ${account.landlordToken}`,
    "content-type": "application/json",
  };
  let tenantUserId;
  let tenantAuthUserId;
  let tenantToken;
  let runError;
  let cleanupError;
  let closeError;
  let result;
  const generatedAttachmentStoragePaths = new Set();

  try {
    const invitation = await expectJson(
      `${input.baseUrl}/api/v1/tenant/invitations`,
      {
        method: "POST",
        headers: landlordHeaders,
        status: 201,
        body: JSON.stringify({
          email: account.tenantEmail.toUpperCase(),
          lease_id: account.linkedLeaseId,
        }),
      },
    );
    assert(
      invitation.email === account.tenantEmail,
      "invitation email mismatch",
    );
    assert(
      invitation.lease_id === account.linkedLeaseId,
      "invitation lease mismatch",
    );
    assert(
      invitation.organization_id === account.organizationId,
      "invitation org mismatch",
    );
    assert(
      typeof invitation.token === "string" && invitation.token.length >= 32,
      "invitation token missing",
    );

    const validInvitation = await expectJson(
      `${input.baseUrl}/api/v1/tenant/invitations/${invitation.token}/validate`,
      { status: 200 },
    );
    assert(
      validInvitation.valid === true,
      "invitation should validate before signup",
    );
    assert(
      validInvitation.email === account.tenantEmail,
      "validated email mismatch",
    );

    const signup = await expectJson(`${input.baseUrl}/api/v1/tenant/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "127.0.0.1",
        "user-agent": "local-tenant-portal-disputes-e2e",
      },
      status: 201,
      body: JSON.stringify({
        token: invitation.token,
        password: account.tenantPassword,
        contact_name: "Local Tenant E2E",
        accepted_terms: true,
        terms_version: TERMS_VERSION,
        terms_hash: TERMS_HASH,
      }),
    });
    tenantUserId = signup.tenant_user?.id;
    tenantAuthUserId = signup.user_id;
    tenantToken = signup.access_token;
    assert(signup.success === true, "tenant signup success flag mismatch");
    assert(
      typeof tenantToken === "string" && tenantToken.length > 0,
      "tenant token missing",
    );
    assert(typeof tenantUserId === "string", "tenant user id missing");
    assert(typeof tenantAuthUserId === "string", "tenant auth user id missing");
    assert(
      signup.tenant_user.contact_email === account.tenantEmail,
      "tenant email mismatch",
    );

    const usedInvitation = await expectJson(
      `${input.baseUrl}/api/v1/tenant/invitations/${invitation.token}/validate`,
      { status: 200 },
    );
    assert(
      usedInvitation.valid === false,
      "invitation should be used after signup",
    );
    assert(
      usedInvitation.error_reason === "used",
      "used invitation reason mismatch",
    );

    await seedTenantNotifications(sql, {
      tenantUserId,
      statementId: account.statementId,
    });

    const tenantHeaders = {
      authorization: `Bearer ${tenantToken}`,
      "content-type": "application/json",
    };
    const tenantAuthHeaders = {
      authorization: `Bearer ${tenantToken}`,
    };

    const dashboard = await expectJson(
      `${input.baseUrl}/api/v1/tenant/dashboard`,
      {
        headers: tenantHeaders,
        status: 200,
      },
    );
    assert(
      dashboard.leases.length === 1,
      "tenant dashboard lease count mismatch",
    );
    assert(
      dashboard.leases[0].id === account.linkedLeaseId,
      "tenant dashboard lease mismatch",
    );
    assert(
      dashboard.leases[0].property.name === "Tenant Portal E2E Plaza",
      "tenant dashboard property mismatch",
    );
    assert(
      dashboard.statements.length === 1,
      "tenant dashboard statement count mismatch",
    );
    assert(
      dashboard.statements[0].id === account.statementId,
      "tenant statement mismatch",
    );
    assert(
      dashboard.statements[0].tenant_share === "1200.00",
      "tenant statement share mismatch",
    );
    assert(
      dashboard.statements[0].status === "pending",
      "tenant statement initial status mismatch",
    );
    assert(
      dashboard.unread_notifications === 2,
      "tenant unread count mismatch",
    );

    await expectJson(`${input.baseUrl}/api/v1/tenant/dashboard`, {
      headers: landlordHeaders,
      status: 403,
    });

    const notifications = await expectJson(
      `${input.baseUrl}/api/v1/tenant/notifications?unread_only=true&skip=0&limit=20`,
      { headers: tenantHeaders, status: 200 },
    );
    assert(notifications.length === 2, "tenant notification count mismatch");

    await expectJson(
      `${input.baseUrl}/api/v1/tenant/notifications/${notifications[0].id}/read`,
      { method: "POST", headers: tenantHeaders, status: 200 },
    );
    const oneUnread = await expectJson(
      `${input.baseUrl}/api/v1/tenant/notifications?unread_only=true`,
      { headers: tenantHeaders, status: 200 },
    );
    assert(oneUnread.length === 1, "single notification read mismatch");

    const defaults = await expectJson(
      `${input.baseUrl}/api/v1/tenant/notifications/preferences`,
      { headers: tenantHeaders, status: 200 },
    );
    assert(
      defaults.new_statement_emails === true,
      "default statement emails mismatch",
    );
    assert(
      defaults.marketing_emails === false,
      "default marketing emails mismatch",
    );

    const updatedPreferences = await expectJson(
      `${input.baseUrl}/api/v1/tenant/notifications/preferences`,
      {
        method: "PUT",
        headers: tenantHeaders,
        status: 200,
        body: JSON.stringify({
          marketing_emails: true,
          dispute_update_emails: false,
        }),
      },
    );
    assert(
      updatedPreferences.marketing_emails === true,
      "marketing preference mismatch",
    );
    assert(
      updatedPreferences.dispute_update_emails === false,
      "dispute preference mismatch",
    );

    const readAll = await expectJson(
      `${input.baseUrl}/api/v1/tenant/notifications/read-all`,
      { method: "POST", headers: tenantHeaders, status: 200 },
    );
    assert(readAll.marked_read === 1, "read-all count mismatch");

    const pdf = await expectBinary(
      `${input.baseUrl}/api/v1/tenant/statements/${account.statementId}/pdf`,
      { headers: tenantHeaders, status: 200 },
    );
    assert(
      pdf.contentType.includes("application/pdf"),
      "statement PDF content type mismatch",
    );
    assert(pdf.textPrefix === "%PDF", "statement PDF prefix mismatch");
    assert(pdf.byteLength > 500, "statement PDF should not be empty");
    assertStatementPdfContract(pdf.buffer);

    const dispute = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes`,
      {
        method: "POST",
        headers: tenantHeaders,
        status: 201,
        body: JSON.stringify({
          statement_id: account.statementId,
          category: "calculation_error",
          description:
            "The CAM charge appears higher than the statement math supports.",
        }),
      },
    );
    assertDisputeSummary(
      dispute,
      {
        id: dispute.id,
        statement_id: account.statementId,
        category: "calculation_error",
        status: "open",
        description:
          "The CAM charge appears higher than the statement math supports.",
      },
      "created tenant dispute",
    );

    const disputedDashboard = await expectJson(
      `${input.baseUrl}/api/v1/tenant/dashboard`,
      { headers: tenantHeaders, status: 200 },
    );
    assert(
      disputedDashboard.statements[0].status === "disputed",
      "dashboard disputed status mismatch",
    );

    const disputes = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes`,
      {
        headers: tenantHeaders,
        status: 200,
      },
    );
    assert(disputes.length === 1, "dispute list count mismatch");
    assertDisputeSummary(disputes[0], dispute, "tenant dispute list row");

    const detail = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes/${dispute.id}`,
      { headers: tenantHeaders, status: 200 },
    );
    assertTenantDisputeDetail(
      detail,
      {
        ...dispute,
        comments: [
          {
            dispute_id: dispute.id,
            author_id: tenantAuthUserId,
            author_name: "Local Tenant E2E",
            content:
              "The CAM charge appears higher than the statement math supports.",
            is_internal: false,
          },
        ],
        attachments: [],
      },
      "initial tenant dispute detail",
    );

    const comment = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes/${dispute.id}/comments`,
      {
        method: "POST",
        headers: tenantHeaders,
        status: 201,
        body: JSON.stringify({
          content: "This follow-up should remain visible to the tenant.",
          is_internal: true,
        }),
      },
    );
    assertDisputeComment(
      comment,
      {
        dispute_id: dispute.id,
        author_id: tenantAuthUserId,
        author_name: "Local Tenant E2E",
        content: "This follow-up should remain visible to the tenant.",
        is_internal: false,
      },
      "tenant comment",
    );

    const afterComment = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes/${dispute.id}`,
      { headers: tenantHeaders, status: 200 },
    );
    assertTenantDisputeDetail(
      afterComment,
      {
        ...dispute,
        comments: [
          {
            dispute_id: dispute.id,
            author_id: tenantAuthUserId,
            author_name: "Local Tenant E2E",
            content:
              "The CAM charge appears higher than the statement math supports.",
            is_internal: false,
          },
          {
            ...comment,
            id: comment.id,
          },
        ],
        attachments: [],
      },
      "tenant detail after tenant comment",
    );

    const attachmentForm = new FormData();
    attachmentForm.set(
      "file",
      new Blob([ATTACHMENT_BYTES], { type: "application/pdf" }),
      'tenant-"cam"support.pdf',
    );
    const attachment = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes/${dispute.id}/attachments`,
      {
        method: "POST",
        headers: tenantAuthHeaders,
        status: 201,
        body: attachmentForm,
      },
    );
    assertDisputeAttachment(
      attachment,
      {
        filename: "tenant-%22cam%22support.pdf",
        file_url: `/api/v1/tenant/disputes/${dispute.id}/attachments/${attachment.id}`,
        content_type: "application/pdf",
        file_size_bytes: ATTACHMENT_BYTES.byteLength,
      },
      "tenant attachment",
    );
    const attachmentStoragePath = await findDisputeAttachmentStoragePath(sql, {
      disputeId: dispute.id,
      attachmentId: attachment.id,
      organizationId: account.organizationId,
    });
    generatedAttachmentStoragePaths.add(attachmentStoragePath);

    const tenantAttachmentDownload = await expectBinary(
      `${input.baseUrl}/api/v1/tenant/disputes/${dispute.id}/attachments/${attachment.id}`,
      { headers: tenantAuthHeaders, status: 200 },
    );
    assert(
      tenantAttachmentDownload.contentType.includes("application/pdf"),
      "tenant attachment content type mismatch",
    );
    assert(
      tenantAttachmentDownload.buffer.equals(ATTACHMENT_BYTES),
      "tenant attachment bytes mismatch",
    );
    assert(
      tenantAttachmentDownload.contentDisposition.includes(
        `filename="tenant-%22cam%22support.pdf"`,
      ),
      "tenant attachment filename was not sanitized for download",
    );

    const adminList = await expectJson(
      `${input.baseUrl}/api/v1/disputes?status=open`,
      {
        headers: landlordHeaders,
        status: 200,
      },
    );
    assert(adminList.length === 1, "admin dispute list count mismatch");
    assertDisputeSummary(adminList[0], dispute, "admin dispute list row");

    const adminDetail = await expectJson(
      `${input.baseUrl}/api/v1/disputes/${dispute.id}`,
      {
        headers: landlordHeaders,
        status: 200,
      },
    );
    assertAdminDisputeDetail(
      adminDetail,
      {
        ...dispute,
        tenant_user_id: tenantUserId,
        organization_id: account.organizationId,
        assigned_to: null,
        resolution_summary: null,
        resolved_at: null,
        resolved_by: null,
        comments: [
          {
            dispute_id: dispute.id,
            author_id: tenantAuthUserId,
            author_name: "Local Tenant E2E",
            content:
              "The CAM charge appears higher than the statement math supports.",
            is_internal: false,
          },
          comment,
        ],
        attachments: [
          {
            ...attachment,
            file_url: `/api/v1/disputes/${dispute.id}/attachments/${attachment.id}`,
          },
        ],
      },
      "admin dispute detail",
    );

    const adminAttachmentDownload = await expectBinary(
      `${input.baseUrl}/api/v1/disputes/${dispute.id}/attachments/${attachment.id}`,
      { headers: landlordHeaders, status: 200 },
    );
    assert(
      adminAttachmentDownload.buffer.equals(ATTACHMENT_BYTES),
      "admin attachment bytes mismatch",
    );

    const internalComment = await expectJson(
      `${input.baseUrl}/api/v1/disputes/${dispute.id}/comments`,
      {
        method: "POST",
        headers: landlordHeaders,
        status: 201,
        body: JSON.stringify({
          content: "Internal landlord note for audit staff only.",
          is_internal: true,
        }),
      },
    );
    assertDisputeComment(
      internalComment,
      {
        dispute_id: dispute.id,
        author_id: account.landlordUserId,
        author_name: "Local Tenant E2E Landlord",
        content: "Internal landlord note for audit staff only.",
        is_internal: true,
      },
      "admin internal comment",
    );

    const adminDetailAfterInternalComment = await expectJson(
      `${input.baseUrl}/api/v1/disputes/${dispute.id}`,
      {
        headers: landlordHeaders,
        status: 200,
      },
    );
    assertAdminDisputeDetail(
      adminDetailAfterInternalComment,
      {
        ...adminDetail,
        comments: [...adminDetail.comments, internalComment],
      },
      "admin detail after internal comment",
    );

    const tenantAfterInternalComment = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes/${dispute.id}`,
      { headers: tenantHeaders, status: 200 },
    );
    assertTenantDisputeDetail(
      tenantAfterInternalComment,
      {
        ...afterComment,
        attachments: [attachment],
      },
      "tenant detail after internal comment",
    );

    await expectJson(`${input.baseUrl}/api/v1/disputes/${dispute.id}/status`, {
      method: "PUT",
      headers: landlordHeaders,
      status: 400,
      body: JSON.stringify({
        status: "resolved",
      }),
    });

    const underReview = await expectJson(
      `${input.baseUrl}/api/v1/disputes/${dispute.id}/status`,
      {
        method: "PUT",
        headers: landlordHeaders,
        status: 200,
        body: JSON.stringify({
          status: "under_review",
        }),
      },
    );
    assertDisputeSummary(
      underReview,
      {
        ...dispute,
        status: "under_review",
      },
      "under-review dispute",
    );

    const resolved = await expectJson(
      `${input.baseUrl}/api/v1/disputes/${dispute.id}/status`,
      {
        method: "PUT",
        headers: landlordHeaders,
        status: 200,
        body: JSON.stringify({
          status: "resolved",
          resolution_summary:
            "The statement was reviewed and the support attachment was accepted.",
        }),
      },
    );
    assertDisputeSummary(
      resolved,
      {
        ...dispute,
        status: "resolved",
      },
      "resolved dispute",
    );

    const resolvedAdminDetail = await expectJson(
      `${input.baseUrl}/api/v1/disputes/${dispute.id}`,
      {
        headers: landlordHeaders,
        status: 200,
      },
    );
    assertAdminDisputeDetail(
      resolvedAdminDetail,
      {
        ...adminDetailAfterInternalComment,
        status: "resolved",
        resolution_summary:
          "The statement was reviewed and the support attachment was accepted.",
        resolved_by: account.landlordUserId,
      },
      "resolved admin detail",
      { allowResolvedAtChange: true, allowUpdatedAtChange: true },
    );

    const resolvedTenantDetail = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes/${dispute.id}`,
      { headers: tenantHeaders, status: 200 },
    );
    assertTenantDisputeDetail(
      resolvedTenantDetail,
      {
        ...tenantAfterInternalComment,
        status: "resolved",
      },
      "resolved tenant detail",
    );

    await expectJson(`${input.baseUrl}/api/v1/tenant/disputes`, {
      method: "POST",
      headers: tenantHeaders,
      status: 403,
      body: JSON.stringify({
        statement_id: account.unlinkedStatementId,
        category: "other",
        description:
          "This tenant should not be able to dispute an unlinked lease.",
      }),
    });

    await expectJson(`${input.baseUrl}/api/v1/tenant/disputes`, {
      method: "POST",
      headers: tenantHeaders,
      status: 404,
      body: JSON.stringify({
        statement_id: account.otherStatementId,
        category: "other",
        description: "This statement belongs to another organization.",
      }),
    });

    const secondDispute = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes`,
      {
        method: "POST",
        headers: tenantHeaders,
        status: 201,
        body: JSON.stringify({
          statement_id: account.statementId,
          category: "billing_question",
          description:
            "The tenant needs a second same-day review of the billed reconciliation support.",
        }),
      },
    );
    const thirdDispute = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes`,
      {
        method: "POST",
        headers: tenantHeaders,
        status: 201,
        body: JSON.stringify({
          statement_id: account.statementId,
          category: "missing_credit",
          description:
            "The tenant needs a third same-day review for a missing CAM credit.",
        }),
      },
    );
    assert(
      secondDispute.id !== dispute.id && thirdDispute.id !== dispute.id,
      "additional dispute ids should be distinct from original dispute",
    );
    assert(
      secondDispute.id !== thirdDispute.id,
      "additional dispute ids should be distinct",
    );
    const openDisputesAfterRateFill = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes?status=open`,
      { headers: tenantHeaders, status: 200 },
    );
    assert(
      openDisputesAfterRateFill.length === 2,
      "tenant open dispute count after rate-fill mismatch",
    );
    assert(
      openDisputesAfterRateFill.some((row) => row.id === secondDispute.id) &&
        openDisputesAfterRateFill.some((row) => row.id === thirdDispute.id),
      "tenant open dispute list missing rate-fill disputes",
    );
    const rateLimited = await expectJson(
      `${input.baseUrl}/api/v1/tenant/disputes`,
      {
        method: "POST",
        headers: tenantHeaders,
        status: 429,
        body: JSON.stringify({
          statement_id: account.statementId,
          category: "other",
          description:
            "The tenant should hit the same-day dispute intake limit on this fourth request.",
        }),
      },
    );
    assertJsonEqual(
      rateLimited,
      {
        detail:
          "You may submit a maximum of 3 disputes per day. Please try again tomorrow.",
        error: {
          code: "rate_limit_exceeded",
          message:
            "You may submit a maximum of 3 disputes per day. Please try again tomorrow.",
        },
      },
      "tenant dispute rate-limit response",
    );

    const dbState = await verifyTenantDatabase(sql, {
      account,
      tenantUserId,
      tenantAuthUserId,
      disputeId: dispute.id,
      attachmentId: attachment.id,
    });

    result = {
      run: input.index + 1,
      organization_id: account.organizationId,
      tenant_user_id: tenantUserId,
      statement_id: account.statementId,
      dispute_id: dispute.id,
      attachment_id: attachment.id,
      final_status: resolved.status,
      legal_acceptances: dbState.legal_acceptance_count,
      visible_comments: resolvedTenantDetail.comments.length,
      admin_comments: dbState.total_comment_count,
      rate_limit_open_disputes: openDisputesAfterRateFill.length,
    };
  } catch (error) {
    runError = error;
  } finally {
    const cleanupAccount = {
      ...account,
      tenantUserId,
      tenantAuthUserId,
    };
    try {
      await cleanupLocalDisputeAttachmentObjects(sql, cleanupAccount);
      await cleanupTrackedLocalDisputeAttachmentObjects(
        generatedAttachmentStoragePaths,
      );
      await cleanupDisposableLocalAccount(sql, cleanupAccount);
      await assertCleanupComplete(sql, {
        landlordEmail: account.landlordEmail,
        tenantEmail: account.tenantEmail,
        organizationId: account.organizationId,
        otherOrganizationId: account.otherOrganizationId,
        signupOrganizationId: account.signupOrganizationId,
        signupOrganizationName: account.signupOrganizationName,
        tenantSignupOrganizationName: account.tenantSignupOrganizationName,
      });
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        closeError = error;
      }
    }
  }
  const postRunError = cleanupError ?? closeError;
  if (postRunError) {
    if (runError) {
      console.error(
        `Local tenant dispute cleanup failed after scenario failure: ${errorMessage(postRunError)}`,
      );
    } else {
      throw postRunError;
    }
  }
  if (runError) throw runError;
  return result;
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
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      "RESEND_API_KEY:",
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  let childError;
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
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
          await new Promise((resolveClose) => {
            const timeout = setTimeout(resolveClose, 5000);
            child.once("exit", () => {
              clearTimeout(timeout);
              resolveClose();
            });
          });
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
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-tenant-disputes-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-tenant-disputes-e2e");
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
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "RESEND_API_KEY=",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-tenant-disputes-e2e-signing-secret",
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
  return env;
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
    fail(`Local Supabase admin check failed: ${errorMessage(error)}`);
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

async function seedLandlordAccount(input) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const landlordEmail = `tenant-e2e-landlord-${suffix}@capveri.com`;
  const tenantEmail = `tenant-e2e-tenant-${suffix}@capveri.com`;
  const signupOrganizationName = `${landlordEmail.split("@")[0]}'s Organization`;
  const tenantSignupOrganizationName = `${tenantEmail.split("@")[0]}'s Organization`;
  const landlordPassword = `LocalE2E-${randomUUID()}!`;
  const tenantPassword = `TenantE2E-${randomUUID()}Aa1!`;
  const signupUrl = new URL("/auth/v1/signup", input.supabaseUrl);
  const signupResponse = await fetch(signupUrl, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: landlordEmail, password: landlordPassword }),
  });
  const signupBody = await signupResponse.json().catch(() => ({}));
  if (!signupResponse.ok) {
    fail(`Local Supabase signup failed: ${safeJson(signupBody)}`);
  }
  const landlordUserId = signupBody.user?.id;
  if (typeof landlordUserId !== "string") {
    fail("Local Supabase signup did not return a user id.");
  }

  const account = {
    landlordEmail,
    tenantEmail,
    signupOrganizationName,
    tenantSignupOrganizationName,
    landlordPassword,
    tenantPassword,
    landlordUserId,
    organizationId: randomUUID(),
    otherOrganizationId: randomUUID(),
    propertyId: randomUUID(),
    otherPropertyId: randomUUID(),
    linkedUnitId: randomUUID(),
    unlinkedUnitId: randomUUID(),
    otherUnitId: randomUUID(),
    linkedLeaseId: randomUUID(),
    unlinkedLeaseId: randomUUID(),
    otherLeaseId: randomUUID(),
    statementId: randomUUID(),
    unlinkedStatementId: randomUUID(),
    otherStatementId: randomUUID(),
    signupOrganizationId: undefined,
  };
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let seedError;
  let cleanupError;
  let closeError;

  try {
    await sql.begin(async (transaction) => {
      const signupUsers = await transaction`
          select organization_id
          from users
          where id = ${landlordUserId}
        `;
      account.signupOrganizationId =
        signupUsers[0]?.organization_id ?? undefined;
      await transaction`
          update auth.users
          set email_confirmed_at = coalesce(email_confirmed_at, now())
          where id = ${landlordUserId}
        `;
      await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values
            (${account.organizationId}, 'Local Tenant Portal E2E Org', 'active', '{}'::jsonb),
            (${account.otherOrganizationId}, 'Local Tenant Portal Hidden Org', 'active', '{}'::jsonb)
        `;
      await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values (${landlordUserId}, ${account.organizationId}, ${landlordEmail}, 'Local Tenant E2E Landlord', 'owner')
          on conflict (id) do update
          set organization_id = excluded.organization_id,
              email = excluded.email,
              full_name = excluded.full_name,
              role = excluded.role
        `;
      await transaction`
          insert into subscriptions (
            organization_id,
            plan,
            status,
            current_period_start,
            current_period_end
          )
          values (
            ${account.organizationId},
            'professional',
            'active',
            now(),
            now() + interval '30 days'
          )
        `;
      await transaction`
          insert into properties (
            id,
            organization_id,
            name,
            address_line1,
            city,
            state,
            postal_code,
            total_rentable_sqft,
            total_usable_sqft,
            common_area_sqft,
            target_occupancy
          )
          values
            (${account.propertyId}, ${account.organizationId}, 'Tenant Portal E2E Plaza', '100 Tenant Portal Way', 'Dallas', 'TX', '75201', 40000, 36000, 4000, 0.95),
            (${account.otherPropertyId}, ${account.otherOrganizationId}, 'Hidden Tenant Portal Plaza', '900 Hidden Way', 'Dallas', 'TX', '75201', 20000, 18000, 2000, 0.95)
        `;
      await transaction`
          insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
          values
            (${account.linkedUnitId}, ${account.propertyId}, 'TP-100', 5000, 4500, 1, 'occupied'),
            (${account.unlinkedUnitId}, ${account.propertyId}, 'TP-200', 3000, 2700, 2, 'occupied'),
            (${account.otherUnitId}, ${account.otherPropertyId}, 'HD-100', 2500, 2250, 1, 'occupied')
        `;
      await transaction`
          insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
          values
            (${account.linkedLeaseId}, ${account.propertyId}, ${account.linkedUnitId}, 'Local Tenant E2E', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{"pro_rata_share":"0.125","base_year":2025,"admin_fee_percentage":"0","cap_type":"none","excluded_pools":[]}'::jsonb),
            (${account.unlinkedLeaseId}, ${account.propertyId}, ${account.unlinkedUnitId}, 'Unlinked Tenant E2E', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{"pro_rata_share":"0.075","base_year":2025,"admin_fee_percentage":"0","cap_type":"none","excluded_pools":[]}'::jsonb),
            (${account.otherLeaseId}, ${account.otherPropertyId}, ${account.otherUnitId}, 'Hidden Tenant E2E', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb)
        `;
      await transaction`
          insert into reconciliation_snapshots (
            id,
            organization_id,
            property_id,
            lease_id,
            period_start_date,
            period_end_date,
            status,
            total_operating_expenses,
            grossed_up_expenses,
            base_year_amount,
            tenant_share_before_cap,
            tenant_share_after_cap,
            admin_fee,
            total_recovery,
            pool_breakdowns,
            calculation_trace,
            finalized_at,
            finalized_by_user_id
          )
          values
            (${account.statementId}, ${account.organizationId}, ${account.propertyId}, ${account.linkedLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 100000, 105000, 90000, 1200, 1200, 34.56, 1234.56, '[{"pool_name":"CAM","total_recovery":"1000.00"},{"pool_name":"Tax","total_recovery":"234.56"}]'::jsonb, '[{"step_name":"Gross-up","operation":"multiply","output_value":"105000","output_unit":"currency","note":"Local E2E calculation trace"}]'::jsonb, now(), ${landlordUserId}),
            (${account.unlinkedStatementId}, ${account.organizationId}, ${account.propertyId}, ${account.unlinkedLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 50000, 50000, 40000, 300, 300, 0, 300, '[{"pool_name":"CAM","total_recovery":"300.00"}]'::jsonb, '[]'::jsonb, now(), ${landlordUserId}),
            (${account.otherStatementId}, ${account.otherOrganizationId}, ${account.otherPropertyId}, ${account.otherLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 75000, 75000, 70000, 999, 999, 0, 999, '[{"pool_name":"CAM","total_recovery":"999.00"}]'::jsonb, '[]'::jsonb, now(), null)
        `;
    });
  } catch (error) {
    seedError = error;
    try {
      await cleanupDisposableLocalAccount(sql, account);
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure;
    }
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      closeError = error;
    }
  }
  if (seedError) {
    if (cleanupError) {
      console.error(
        `Seed cleanup failed after seed failure: ${errorMessage(cleanupError)}`,
      );
    }
    if (closeError) {
      console.error(
        `Seed DB close failed after seed failure: ${errorMessage(closeError)}`,
      );
    }
    fail(
      `Failed to seed local tenant portal/disputes records: ${errorMessage(seedError)}`,
    );
  }
  if (cleanupError) throw cleanupError;
  if (closeError) throw closeError;

  const landlordToken =
    signupBody.session?.access_token ??
    (await signInWithPassword({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: landlordEmail,
      password: landlordPassword,
    }));
  if (!landlordToken) {
    const cleanupSql = postgres(input.databaseUrl, { max: 1, prepare: false });
    let tokenCleanupError;
    let tokenCloseError;
    try {
      await cleanupDisposableLocalAccount(cleanupSql, account);
    } catch (error) {
      tokenCleanupError = error;
    } finally {
      try {
        await cleanupSql.end({ timeout: 5 });
      } catch (error) {
        tokenCloseError = error;
      }
    }
    if (tokenCleanupError) {
      console.error(
        `Token cleanup failed after token mint failure: ${errorMessage(tokenCleanupError)}`,
      );
    }
    if (tokenCloseError) {
      console.error(
        `Token DB close failed after token mint failure: ${errorMessage(tokenCloseError)}`,
      );
    }
    fail("Local Supabase signup seed could not mint a password token.");
  }

  return { ...account, landlordToken };
}

async function seedTenantNotifications(sql, input) {
  await sql`
    insert into tenant_notifications (
      id,
      tenant_user_id,
      notification_type,
      title,
      message,
      link_url,
      related_entity_id
    )
    values
      (${randomUUID()}, ${input.tenantUserId}, 'new_statement', 'Statement ready', 'Your CAM statement is ready.', '/tenant/dashboard', ${input.statementId}),
      (${randomUUID()}, ${input.tenantUserId}, 'system', 'Portal notice', 'Your tenant portal is active.', '/tenant/dashboard', null)
  `;
}

async function verifyTenantDatabase(sql, input) {
  const rows = await sql`
    select
      (select count(*)::int from tenant_lease_links where tenant_user_id = ${input.tenantUserId}) as link_count,
      (select count(*)::int from legal_acceptances where user_id = ${input.tenantAuthUserId}) as legal_acceptance_count,
      (select count(*)::int from tenant_notifications where tenant_user_id = ${input.tenantUserId}) as notification_count,
      (select count(*)::int from dispute_comments where dispute_id = ${input.disputeId}) as total_comment_count,
      (select count(*)::int from dispute_comments where dispute_id = ${input.disputeId} and is_internal = false) as external_comment_count,
      (select count(*)::int from dispute_comments where dispute_id = ${input.disputeId} and is_internal = true) as internal_comment_count,
      (select count(*)::int from dispute_attachments where dispute_id = ${input.disputeId} and id = ${input.attachmentId}) as attachment_count,
      (select status from disputes where id = ${input.disputeId}) as dispute_status
  `;
  const row = rows[0];
  assert(row.link_count === 1, "tenant DB link count mismatch");
  assert(
    row.legal_acceptance_count === 1,
    "tenant legal acceptance count mismatch",
  );
  assert(row.notification_count === 2, "tenant notification DB count mismatch");
  assert(
    row.total_comment_count === 3,
    "tenant total comment DB count mismatch",
  );
  assert(
    row.external_comment_count === 2,
    "tenant external comment DB count mismatch",
  );
  assert(
    row.internal_comment_count === 1,
    "tenant internal comment DB count mismatch",
  );
  assert(row.attachment_count === 1, "tenant attachment DB count mismatch");
  assert(
    row.dispute_status === "resolved",
    "tenant dispute DB status mismatch",
  );
  return row;
}

async function findDisputeAttachmentStoragePath(sql, input) {
  const rows = await sql`
    select da.storage_path
    from dispute_attachments da
    join disputes d on d.id = da.dispute_id
    where da.id = ${input.attachmentId}
      and da.dispute_id = ${input.disputeId}
      and d.organization_id = ${input.organizationId}
    limit 1
  `;
  const storagePath = rows[0]?.storage_path;
  assert(
    typeof storagePath === "string" && storagePath.trim() !== "",
    "attachment storage path missing",
  );
  const expectedPrefix = `${input.organizationId}/disputes/${input.disputeId}/`;
  assert(
    storagePath.startsWith(expectedPrefix),
    "attachment storage path escaped expected dispute prefix",
  );
  return storagePath;
}

async function cleanupLocalDisputeAttachmentObjects(sql, account) {
  const orgIds = [account.organizationId, account.otherOrganizationId].filter(
    Boolean,
  );
  if (orgIds.length === 0) {
    return;
  }

  const rows = await sql`
    select da.storage_path
    from dispute_attachments da
    join disputes d on d.id = da.dispute_id
    where d.organization_id in ${sql(orgIds)}
  `;

  const failures = [];
  for (const row of rows) {
    const storagePath = row.storage_path;
    if (typeof storagePath !== "string" || storagePath.trim() === "") {
      continue;
    }
    const objectPath = `${DOCUMENTS_BUCKET_NAME}/${storagePath}`;
    try {
      await runLocalWrangler([
        "r2",
        "object",
        "delete",
        objectPath,
        "--local",
        "--force",
      ]);
      await assertLocalR2ObjectMissing(objectPath);
    } catch (error) {
      failures.push(
        `${storagePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (failures.length > 0) {
    fail(`Failed to clean dispute attachment objects: ${failures.join("; ")}`);
  }
}

async function cleanupTrackedLocalDisputeAttachmentObjects(storagePaths) {
  const failures = [];
  for (const storagePath of storagePaths) {
    if (typeof storagePath !== "string" || storagePath.trim() === "") {
      continue;
    }
    const objectPath = `${DOCUMENTS_BUCKET_NAME}/${storagePath}`;
    try {
      await runLocalWrangler([
        "r2",
        "object",
        "delete",
        objectPath,
        "--local",
        "--force",
      ]);
      await assertLocalR2ObjectMissing(objectPath);
    } catch (error) {
      failures.push(`${storagePath}: ${errorMessage(error)}`);
    }
  }
  if (failures.length > 0) {
    fail(
      `Failed to clean tracked dispute attachment objects: ${failures.join("; ")}`,
    );
  }
}

async function assertLocalR2ObjectMissing(objectPath) {
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-tenant-dispute-r2-get-"),
  );
  const outputPath = resolve(directory, "object.bin");
  try {
    await runLocalWrangler([
      "r2",
      "object",
      "get",
      objectPath,
      "--local",
      "--file",
      outputPath,
    ]);
  } catch {
    await rm(directory, { recursive: true, force: true });
    return;
  }
  await rm(directory, { recursive: true, force: true });
  fail(
    `Local dispute attachment object still exists after cleanup: ${objectPath}`,
  );
}

async function runLocalWrangler(args) {
  const wranglerPath =
    process.platform === "win32"
      ? resolve("node_modules", "wrangler", "bin", "wrangler.js")
      : resolve("node_modules", ".bin", "wrangler");
  const command =
    process.platform === "win32" ? process.execPath : wranglerPath;
  const commandArgs =
    process.platform === "win32" ? [wranglerPath, ...args] : args;

  return await execFileAsync(command, commandArgs, {
    cwd: process.cwd(),
    timeout: 30_000,
    windowsHide: true,
  });
}

async function cleanupDisposableLocalAccount(sql, account) {
  const orgIds = [account.organizationId, account.otherOrganizationId].filter(
    Boolean,
  );
  const userEmails = [account.landlordEmail, account.tenantEmail].filter(
    Boolean,
  );
  await deleteLocalLegalAcceptances(sql, { orgIds, userEmails });

  await sql`
    delete from dispute_attachments
    where dispute_id in (
      select id from disputes where organization_id in ${sql(orgIds)}
    )
  `;
  await sql`
    delete from dispute_comments
    where dispute_id in (
      select id from disputes where organization_id in ${sql(orgIds)}
    )
  `;
  await sql`
    delete from disputes
    where organization_id in ${sql(orgIds)}
  `;
  await sql`
    delete from tenant_notifications
    where tenant_user_id in (
      select id from tenant_users
      where organization_id in ${sql(orgIds)}
         or contact_email in ${sql(userEmails)}
    )
  `;
  await sql`
    delete from tenant_email_preferences
    where tenant_user_id in (
      select id from tenant_users
      where organization_id in ${sql(orgIds)}
         or contact_email in ${sql(userEmails)}
    )
  `;
  await sql`
    delete from tenant_email_logs
    where tenant_user_id in (
      select id from tenant_users
      where organization_id in ${sql(orgIds)}
         or contact_email in ${sql(userEmails)}
    )
  `;
  await sql`
    delete from tenant_lease_links
    where tenant_user_id in (
      select id from tenant_users
      where organization_id in ${sql(orgIds)}
         or contact_email in ${sql(userEmails)}
    )
  `;
  await sql`
    delete from tenant_users
    where organization_id in ${sql(orgIds)}
       or contact_email in ${sql(userEmails)}
  `;
  await sql`
    delete from tenant_invitations
    where organization_id in ${sql(orgIds)}
       or email in ${sql(userEmails)}
  `;
  await sql`
    delete from reconciliation_snapshots
    where organization_id in ${sql(orgIds)}
  `;
  await sql`
    delete from leases
    where property_id in (${account.propertyId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from units
    where property_id in (${account.propertyId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from properties
    where organization_id in ${sql(orgIds)}
  `;
  await sql`
    delete from subscriptions
    where organization_id in ${sql(orgIds)}
  `;
  await sql`
    delete from signup_email_events
    where organization_id in ${sql(orgIds)}
       or user_id in (${account.landlordUserId}, ${account.tenantAuthUserId ?? account.landlordUserId})
       or email in ${sql(userEmails)}
  `;
  await sql`
    delete from audit_log
    where organization_id in ${sql(orgIds)}
       or changed_by in (${account.landlordUserId}, ${account.tenantAuthUserId ?? account.landlordUserId})
       or row_id in (
        ${account.linkedLeaseId},
        ${account.unlinkedLeaseId},
        ${account.otherLeaseId},
        ${account.statementId},
        ${account.unlinkedStatementId},
        ${account.otherStatementId}
       )
  `;
  await sql`
    delete from users
    where organization_id in ${sql(orgIds)}
       or id in (${account.landlordUserId}, ${account.tenantAuthUserId ?? account.landlordUserId})
       or email in ${sql(userEmails)}
  `;
  await sql`
    delete from organizations
    where id in ${sql(orgIds)}
  `;
  if (account.signupOrganizationId) {
    await sql`
      delete from organizations
      where id = ${account.signupOrganizationId}
        and not exists (
          select 1
          from users
          where users.organization_id = organizations.id
        )
    `;
  }
  await sql`
    delete from organizations
    where name in ${sql([account.signupOrganizationName, account.tenantSignupOrganizationName])}
      and not exists (
        select 1
        from users
        where users.organization_id = organizations.id
      )
  `;
  await sql`
    delete from auth.users
    where id in (${account.landlordUserId}, ${account.tenantAuthUserId ?? account.landlordUserId})
       or email in ${sql(userEmails)}
  `;
}

async function deleteLocalLegalAcceptances(sql, input) {
  if (input.orgIds.length === 0 && input.userEmails.length === 0) {
    return;
  }
  await sql.begin(async (transaction) => {
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(input.orgIds)}
         or user_id in (
           select id
           from auth.users
           where email in ${transaction(input.userEmails)}
         )
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
  });
}

async function assertCleanupComplete(sql, input) {
  const rows = await sql`
    select
      (select count(*)::int from auth.users where email in ${sql([input.landlordEmail, input.tenantEmail])}) as auth_user_count,
      (select count(*)::int from users where email in ${sql([input.landlordEmail, input.tenantEmail])}) as public_user_count,
      (select count(*)::int from organizations where id in (${input.organizationId}, ${input.otherOrganizationId})) as org_count,
      (select count(*)::int from organizations where name in ${sql([input.signupOrganizationName, input.tenantSignupOrganizationName])}) as signup_org_count,
      (select count(*)::int from legal_acceptances where organization_id in (${input.organizationId}, ${input.otherOrganizationId})) as legal_acceptance_count,
      (select count(*)::int from audit_log where organization_id in (${input.organizationId}, ${input.otherOrganizationId})) as audit_log_count,
      (select count(*)::int from signup_email_events where organization_id in (${input.organizationId}, ${input.otherOrganizationId}) or email in ${sql([input.landlordEmail, input.tenantEmail])}) as signup_email_count,
      (select count(*)::int from tenant_invitations where email in ${sql([input.landlordEmail, input.tenantEmail])}) as invitation_count,
      (select count(*)::int from tenant_users where contact_email in ${sql([input.landlordEmail, input.tenantEmail])}) as tenant_user_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left seeded organizations");
  assert(row.signup_org_count === 0, "cleanup left signup organizations");
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.audit_log_count === 0, "cleanup left audit log rows");
  assert(row.signup_email_count === 0, "cleanup left signup email events");
  assert(row.invitation_count === 0, "cleanup left tenant invitations");
  assert(row.tenant_user_count === 0, "cleanup left tenant users");
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
  if (typeof body.access_token !== "string" || body.access_token === "") {
    fail("Supabase password sign-in did not return an access token.");
  }
  return body.access_token;
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
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
  }
  return url.toString();
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
      lastError = errorMessage(error);
    }
    await sleep(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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

async function expectBinary(url, options = {}) {
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
  if (response.status !== status) {
    const text = await response.text().catch(() => "");
    fail(
      `${fetchOptions.method ?? "GET"} ${safeUrl} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    byteLength: buffer.byteLength,
    contentDisposition: response.headers.get("content-disposition") ?? "",
    contentType: response.headers.get("content-type") ?? "",
    textPrefix: buffer.subarray(0, 4).toString("utf8"),
  };
}

function assertStatementPdfContract(bytes) {
  const text = normalizePdfSearchText(extractPdfSearchText(bytes));
  for (const expected of [
    "Local Tenant Portal E2E Org",
    "Tenant Reconciliation Statement",
    "Period: January 1, 2026 - December 31, 2026",
    "Tenant Portal E2E Plaza",
    "100 Tenant Portal Way, Dallas, TX 75201",
    "Local Tenant E2E",
    "$100,000.00",
    "$105,000.00",
    "$90,000.00",
    "$1,200.00",
    "$34.56",
    "$1,234.56",
    "Gross-up: $105,000.00 (multiply)",
    "Local E2E calculation trace",
  ]) {
    assert(text.includes(expected), `statement PDF missing ${expected}`);
  }

  for (const forbidden of [
    "Hidden Tenant Portal Plaza",
    "Hidden Tenant E2E",
    "Unlinked Tenant E2E",
    "$999.00",
    "$300.00",
  ]) {
    assert(!text.includes(forbidden), `statement PDF leaked ${forbidden}`);
  }
}

function assertDisputeSummary(actual, expected, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  assertExactKeys(actual, TENANT_DISPUTE_SUMMARY_KEYS, label);
  assertDisputeScalars(actual, expected, label);
}

function assertDisputeScalars(actual, expected, label) {
  assertUuid(actual.id, `${label}.id`);
  assert(
    actual.id === expected.id,
    `${label}.id mismatch: expected ${expected.id}, got ${actual.id}`,
  );
  assert(
    actual.statement_id === expected.statement_id,
    `${label}.statement_id mismatch`,
  );
  assert(actual.category === expected.category, `${label}.category mismatch`);
  assert(actual.status === expected.status, `${label}.status mismatch`);
  assert(
    actual.description === expected.description,
    `${label}.description mismatch`,
  );
  assertParseableTimestamp(actual.created_at, `${label}.created_at`);
}

function assertTenantDisputeDetail(actual, expected, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  assertExactKeys(actual, TENANT_DISPUTE_DETAIL_KEYS, label);
  assertDisputeScalars(actual, expected, label);
  assert(
    actual.comments.length === expected.comments.length,
    `${label}.comments count mismatch`,
  );
  actual.comments.forEach((comment, index) => {
    assertDisputeComment(
      comment,
      expected.comments[index],
      `${label}.comment ${index}`,
    );
  });
  assert(
    actual.attachments.length === expected.attachments.length,
    `${label}.attachments count mismatch`,
  );
  actual.attachments.forEach((attachment, index) => {
    assertDisputeAttachment(
      attachment,
      expected.attachments[index],
      `${label}.attachment ${index}`,
    );
  });
}

function assertAdminDisputeDetail(actual, expected, label, options = {}) {
  assert(actual && typeof actual === "object", `${label} missing`);
  assertExactKeys(actual, ADMIN_DISPUTE_DETAIL_KEYS, label);
  assertUuid(actual.id, `${label}.id`);
  for (const key of [
    "id",
    "tenant_user_id",
    "statement_id",
    "organization_id",
    "category",
    "status",
    "description",
    "assigned_to",
    "resolution_summary",
    "resolved_by",
  ]) {
    assert(
      actual[key] === expected[key],
      `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(actual[key])}`,
    );
  }
  assertParseableTimestamp(actual.created_at, `${label}.created_at`);
  assertParseableTimestamp(actual.updated_at, `${label}.updated_at`);
  if (!options.allowUpdatedAtChange && expected.updated_at !== undefined) {
    assertSameInstant(
      actual.updated_at,
      expected.updated_at,
      `${label}.updated_at`,
    );
  }
  if (options.allowResolvedAtChange) {
    assertParseableTimestamp(actual.resolved_at, `${label}.resolved_at`);
  } else if (expected.resolved_at === null) {
    assert(actual.resolved_at === null, `${label}.resolved_at mismatch`);
  } else {
    assertParseableTimestamp(actual.resolved_at, `${label}.resolved_at`);
    if (!options.allowResolvedAtChange && expected.resolved_at !== undefined) {
      assertSameInstant(
        actual.resolved_at,
        expected.resolved_at,
        `${label}.resolved_at`,
      );
    }
  }
  assert(
    actual.comments.length === expected.comments.length,
    `${label}.comments count mismatch`,
  );
  actual.comments.forEach((comment, index) => {
    assertDisputeComment(
      comment,
      expected.comments[index],
      `${label}.comment ${index}`,
    );
  });
  assert(
    actual.attachments.length === expected.attachments.length,
    `${label}.attachments count mismatch`,
  );
  actual.attachments.forEach((attachment, index) => {
    assertDisputeAttachment(
      attachment,
      expected.attachments[index],
      `${label}.attachment ${index}`,
    );
  });
}

function assertDisputeComment(actual, expected, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  assertExactKeys(actual, DISPUTE_COMMENT_KEYS, label);
  assertUuid(actual.id, `${label}.id`);
  for (const key of [
    "dispute_id",
    "author_id",
    "author_name",
    "content",
    "is_internal",
  ]) {
    assert(
      actual[key] === expected[key],
      `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(actual[key])}`,
    );
  }
  assertParseableTimestamp(actual.created_at, `${label}.created_at`);
}

function assertDisputeAttachment(actual, expected, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  assertExactKeys(actual, DISPUTE_ATTACHMENT_KEYS, label);
  assertUuid(actual.id, `${label}.id`);
  for (const key of [
    "filename",
    "file_url",
    "file_size_bytes",
    "content_type",
  ]) {
    assert(
      actual[key] === expected[key],
      `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(actual[key])}`,
    );
  }
  assertParseableTimestamp(actual.created_at, `${label}.created_at`);
}

function extractPdfSearchText(bytes) {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts = [raw];
  let cursor = 0;
  while (cursor < raw.length) {
    const marker = raw.indexOf("stream", cursor);
    if (marker === -1) break;
    let streamStart = marker + "stream".length;
    if (raw[streamStart] === "\r" && raw[streamStart + 1] === "\n") {
      streamStart += 2;
    } else if (raw[streamStart] === "\n" || raw[streamStart] === "\r") {
      streamStart += 1;
    }
    const streamEnd = raw.indexOf("endstream", streamStart);
    if (streamEnd === -1) break;
    const streamBytes = bytes.slice(streamStart, streamEnd);
    const dictionaryStart = Math.max(raw.lastIndexOf("<<", marker), 0);
    const dictionary = raw.slice(dictionaryStart, marker);
    if (dictionary.includes("/FlateDecode")) {
      try {
        const decoded = new TextDecoder().decode(unzlibSync(streamBytes));
        parts.push(decoded, decodePdfHexStrings(decoded));
      } catch {
        const decoded = Buffer.from(streamBytes).toString("latin1");
        parts.push(decoded, decodePdfHexStrings(decoded));
      }
    } else {
      const decoded = Buffer.from(streamBytes).toString("latin1");
      parts.push(decoded, decodePdfHexStrings(decoded));
    }
    cursor = streamEnd + "endstream".length;
  }
  return parts.join("\n");
}

function decodePdfHexStrings(value) {
  return [...value.matchAll(/<([0-9a-fA-F\s]{2,})>/gu)]
    .map((match) => {
      const hex = match[1].replace(/\s+/gu, "");
      if (hex.length < 2) return "";
      const normalized = hex.length % 2 === 0 ? hex : `${hex}0`;
      const bytes = new Uint8Array(normalized.length / 2);
      for (let index = 0; index < normalized.length; index += 2) {
        bytes[index / 2] = Number.parseInt(
          normalized.slice(index, index + 2),
          16,
        );
      }
      return new TextDecoder().decode(bytes);
    })
    .join("\n");
}

function normalizePdfSearchText(value) {
  return value.replace(/\s+/gu, " ").trim();
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

function assertExactKeys(value, expectedKeys, label) {
  assert(value && typeof value === "object", `${label} missing`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assertJsonEqual(actual, expected, `${label} keys`);
}

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
    `${label} is not a UUID: ${safeJson(value)}`,
  );
}

function assertParseableTimestamp(value, label) {
  assert(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label} is not a timestamp: ${safeJson(value)}`,
  );
}

function assertSameInstant(actual, expected, label) {
  assertParseableTimestamp(actual, `${label} actual`);
  assertParseableTimestamp(expected, `${label} expected`);
  assert(
    Date.parse(actual) === Date.parse(expected),
    `${label} mismatch: expected ${expected}, got ${actual}`,
  );
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function redactSensitiveUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname
      .replace(
        /\/tenant\/invitations\/[^/]+\/validate/gu,
        "/tenant/invitations/[REDACTED]/validate",
      )
      .replace(/\/tenant\/signup\/[^/]+/gu, "/tenant/signup/[REDACTED]");
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return String(rawUrl)
      .replace(
        /\/tenant\/invitations\/[^/\s]+\/validate/gu,
        "/tenant/invitations/[REDACTED]/validate",
      )
      .replace(/\/tenant\/signup\/[^/\s]+/gu, "/tenant/signup/[REDACTED]");
  }
}

function redactSensitiveJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveJson(item));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const redacted = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      redacted[key] = "[redacted]";
      continue;
    }
    redacted[key] = redactSensitiveJson(nestedValue);
  }
  return redacted;
}

function isSensitiveKey(key) {
  const normalized = key.toLowerCase();
  return (
    normalized === "access_token" ||
    normalized === "refresh_token" ||
    normalized === "token" ||
    normalized.endsWith("_token") ||
    normalized.includes("password")
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
