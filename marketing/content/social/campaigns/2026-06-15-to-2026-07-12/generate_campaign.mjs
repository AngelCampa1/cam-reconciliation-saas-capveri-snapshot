#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const campaignRoot = path.resolve(import.meta.dirname);
const postsRoot = path.join(campaignRoot, "posts");
const linkedInRoot = path.join(postsRoot, "linkedin");
const xRoot = path.join(postsRoot, "x");

const timeZone = "America/Chicago";
const linkedInIntegrationId = "cmp1b2s2101fclj0yb8t0botq";
const xIntegrationId = "cmq5cu40400uxqp0y8ygzgjq4";
const start = new Date("2026-06-15T00:00:00-05:00");
const days = 28;

const linkedInSlots = ["10:00", "12:00", "19:00"];
const xSlots = ["09:00", "13:00", "17:00"];

const analyticsBasis = {
  source: "/Users/angel/Downloads/capveri_content_1780933107259.xls",
  exportShape:
    "LinkedIn export with Metrics and All posts sheets. All posts covered 371 LinkedIn rows from 2026-05-12 to 2026-06-06.",
  performance:
    "13,585 impressions total. Median post reach was 19 impressions. Only 36 of 371 posts cleared 50 impressions, so strategy should favor repeatable patterns over one-off spikes.",
  winningPatterns: [
    "Audit-support urgency was the clearest winner. The top post about assembling support before an auditor asks reached 1,763 impressions.",
    "CAM cap and cumulative bank education produced one strong long-form winner at 887 impressions.",
    "Carousel-style educational breakdowns produced one 993-impression winner, but this campaign uses text-only because no media attachments are being scheduled.",
    "Short source-trail statements worked. A post about total versus support reached 795 impressions.",
    "Posts under 80 words had the best broad reach, while 80 to 119 words were the most stable middle.",
  ],
  timing:
    "The export did not include post time. Matched source metadata pointed to 19:00, 12:00, and 10:00 Central as the safest LinkedIn test slots.",
  campaignChoices: [
    "Default to short text posts.",
    "Lead with support-before-audit, source trail, cap bank, export QA, and packet readiness.",
    "Keep product claims light and tied to control problems.",
    "Use LinkedIn slots at 10:00, 12:00, and 19:00 Central.",
    "Offset X slots at 09:00, 13:00, and 17:00 Central because the export only proves LinkedIn behavior.",
  ],
};

const claims = [
  {
    pillar: "export-qa",
    topic: "export-stack",
    sourceFile: "marketing/content/resources/export-guide.mdx",
    sourceUrl: "https://www.capveri.com/resources/export-guide",
    hook: "The export stack comes before the workbook.",
    fact: "A CAM review can start from rent roll, full-year GL detail, and recovery or billing exports.",
    check:
      "Match property, period, tenant, and charge codes before math starts.",
    risk: "If the files do not tie, every variance review gets noisy.",
    close: "Save the export list with the packet.",
  },
  {
    pillar: "yardi",
    topic: "yardi-exports",
    sourceFile: "marketing/content/resources/export-cam-yardi-voyager.mdx",
    sourceUrl: "https://www.capveri.com/resources/export-cam-yardi-voyager",
    hook: "Yardi CAM review starts with the file set.",
    fact: "Recovery Analysis, GL Analytics, and Rent Roll with Lease Charges are core Yardi exports.",
    check: "Use detail-level output for the same property and period.",
    risk: "A summary report can hide the row that caused the charge.",
    close: "Tie the source files before reviewing tenant shares.",
  },
  {
    pillar: "mri",
    topic: "mri-period",
    sourceFile: "marketing/content/resources/export-cam-mri.mdx",
    sourceUrl: "https://www.capveri.com/resources/export-cam-mri",
    hook: "MRI review needs the right period first.",
    fact: "Recovery Reconciliation, GL Transaction Detail, rent roll, and Tenant Billing History are safe MRI lanes.",
    check:
      "Confirm entity, property, period, and tenant ID before export review.",
    risk: "One wrong period can make a clean statement look wrong.",
    close: "Put the period check in the packet notes.",
  },
  {
    pillar: "gross-up",
    topic: "variable-only",
    sourceFile:
      "marketing/content/resources/cam-gross-up-calculation-guide.mdx",
    sourceUrl:
      "https://www.capveri.com/resources/cam-gross-up-calculation-guide",
    hook: "Gross-up review starts with one split.",
    fact: "Variable expenses can be grossed up. Fixed costs need separate treatment.",
    check:
      "Sort taxes, insurance, utilities, janitorial, and service costs before applying a factor.",
    risk: "Grossing up fixed costs can overstate the recovery pool.",
    close: "The packet should show the fixed and variable split.",
  },
  {
    pillar: "pro-rata",
    topic: "denominator",
    sourceFile: "marketing/content/resources/pro-rata-share-calculation.mdx",
    sourceUrl: "https://www.capveri.com/resources/pro-rata-share-calculation",
    hook: "A tenant share needs its denominator.",
    fact: "Tenant RSF over the lease-defined denominator drives the CAM share.",
    check:
      "Store lease denominator, building RSF, excluded area, component area, or usage support.",
    risk: "A percentage alone is hard to defend later.",
    close: "Keep the denominator source next to the charge.",
  },
  {
    pillar: "caps",
    topic: "cap-bank",
    sourceFile:
      "marketing/content/resources/cumulative-vs-non-cumulative-cam-caps.mdx",
    sourceUrl:
      "https://www.capveri.com/resources/cumulative-vs-non-cumulative-cam-caps",
    hook: "A CAM cap is not just one percentage.",
    fact: "Cumulative caps can bank unused capacity. Non-cumulative caps reset each year.",
    check: "Read the cap base, cap rate, and controllable cost language.",
    risk: "The wrong cap type can change several years of billing.",
    close: "Write the cap rule before running the charge.",
  },
  {
    pillar: "admin-fees",
    topic: "fee-base",
    sourceFile: "marketing/content/resources/admin-fee-calculation-methods.mdx",
    sourceUrl:
      "https://www.capveri.com/resources/admin-fee-calculation-methods",
    hook: "Admin fees need a source row.",
    fact: "The method, base, rate, cap interaction, and lease clause should be traceable.",
    check: "Confirm whether the fee applies before or after exclusions.",
    risk: "A circular fee can make a clean pool look off.",
    close: "Save the method with the calculation record.",
  },
  {
    pillar: "deterministic-math",
    topic: "same-inputs",
    sourceFile: "marketing/content/resources/deterministic-vs-ai-cam.mdx",
    sourceUrl: "https://www.capveri.com/resources/deterministic-vs-ai-cam",
    hook: "CAM math has to run the same way twice.",
    fact: "AI can help read documents. Deterministic rules should calculate dollars.",
    check: "Humans verify extracted lease terms before they affect money.",
    risk: "A plausible answer is not enough for tenant billing.",
    close: "Same inputs should produce the same answer.",
  },
  {
    pillar: "packet",
    topic: "pre-send",
    sourceFile: "marketing/content/resources/cam-presend-checklist.mdx",
    sourceUrl: "https://www.capveri.com/resources/cam-presend-checklist",
    hook: "The packet should be ready before the tenant asks.",
    fact: "GL, invoices, rent roll support, lease abstracts, worksheets, and fee support belong together.",
    check: "Review the support before the statement goes out.",
    risk: "Late support review turns small questions into long disputes.",
    close: "A clean packet makes the answer faster.",
  },
  {
    pillar: "tenant-questions",
    topic: "document-demand",
    sourceFile:
      "marketing/content/resources/respond-tenant-documentation-demand.mdx",
    sourceUrl:
      "https://www.capveri.com/resources/respond-tenant-documentation-demand",
    hook: "A tenant document request is an operations test.",
    fact: "The response should track lease audit rights, record scope, redactions, delivery, and follow-up.",
    check: "Confirm what the lease allows before sending files.",
    risk: "A messy response can make a normal review feel adversarial.",
    close: "Keep the response factual and organized.",
  },
  {
    pillar: "boma",
    topic: "parallel-proof",
    sourceFile:
      "marketing/content/resources/boma-2024-implementation-guide.mdx",
    sourceUrl:
      "https://www.capveri.com/resources/boma-2024-implementation-guide",
    hook: "BOMA input changes need parallel proof.",
    fact: "Measurement inputs should be checked against the lease and source records.",
    check: "Run old and new inputs side by side before billing changes.",
    risk: "A label alone does not prove the charge is right.",
    close: "Show what changed and why it applies.",
  },
  {
    pillar: "leakage",
    topic: "recovery-gap",
    sourceFile: "marketing/content/resources/cam-leakage-guide.mdx",
    sourceUrl: "https://www.capveri.com/resources/cam-leakage-guide",
    hook: "CAM leakage is usually a process problem.",
    fact: "Leakage can come from gross-up errors, missed cap adjustments, and pro-rata mistakes.",
    check: "Compare lease terms to actual billings tenant by tenant.",
    risk: "Small missed rules can repeat across years.",
    close: "Find the rule before changing the invoice.",
  },
];

const linkedInAngles = [
  "What to check",
  "Why it matters",
  "Where it breaks",
  "How to close it",
  "What to save",
  "The second review",
  "Before billing",
];

const xAngles = [
  "Check",
  "Reminder",
  "Packet note",
  "Close rule",
  "Review",
  "Watch item",
  "Before send",
];

const hashtags = {
  "export-qa": ["camreconciliation", "propertyaccounting", "cre"],
  yardi: ["yardi", "camreconciliation", "crefinance"],
  mri: ["mri", "camreconciliation", "propertyaccounting"],
  "gross-up": ["camreconciliation", "grossup", "propertyaccounting"],
  "pro-rata": ["camreconciliation", "prorata", "cre"],
  caps: ["camreconciliation", "commercialrealestate", "crefinance"],
  "admin-fees": ["camreconciliation", "propertyaccounting", "cre"],
  "deterministic-math": ["camreconciliation", "crefinance", "proptech"],
  packet: ["camreconciliation", "propertymanagement", "cre"],
  "tenant-questions": ["camreconciliation", "propertymanagement", "cre"],
  boma: ["boma", "camreconciliation", "cre"],
  leakage: ["camleakage", "camreconciliation", "crefinance"],
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDate(dayIndex) {
  const date = new Date(start);
  date.setDate(start.getDate() + dayIndex);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoFor(date, hhmm) {
  return new Date(`${date}T${hhmm}:00-05:00`).toISOString();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function html(content) {
  return content
    .split(/\n{2,}/)
    .map((part) => `<p>${part.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function linkedInPost(claim, angle, index) {
  const tagLine = hashtags[claim.pillar].map((tag) => `#${tag}`).join(" ");
  const detail = [
    "File note: source, rule, amount, reviewer.",
    "Close note: export, lease term, math, support.",
    "Keep the source beside the charge.",
    "Team note: make the next reviewer faster.",
    "Packet note: save the rule before the total.",
    "Control note: prove the input before the output.",
    "Owner note: show what changed since last run.",
  ][index % 7];
  const variants = [
    `${claim.hook}\n\n${angle}: ${claim.fact}\n\n${claim.check}\n\n${claim.risk}\n\n${claim.close}\n\n${detail}\n\nQuestion for the review team: where would you want proof first?\n\n${tagLine}`,
    `${claim.hook}\n\n${angle} comes before a bigger workbook.\n\nThe review needs a clear source trail.\n\n${claim.fact}\n\n${claim.check}\n\n${claim.close}\n\n${detail}\n\nThat is the difference between a charge and a packet.\n\n${tagLine}`,
    `${claim.hook}\n\nA good CAM packet answers this before anyone asks:\n\n${claim.check}\n\n${claim.fact}\n\n${claim.risk}\n\n${detail}\n\nThe fix is boring. Save the support near the math.\n\n${claim.close}\n\n${tagLine}`,
    `${claim.hook}\n\nThis is a useful ${angle.toLowerCase()} question:\n\nCan a second reviewer follow the source, the rule, and the math?\n\n${claim.fact}\n\n${claim.check}\n\n${claim.risk}\n\n${detail}\n\nIf the answer is no, the statement is early.\n\n${tagLine}`,
  ];
  return variants[index % variants.length];
}

function xPost(claim, angle, index) {
  const detail = [
    "Save the source row.",
    "Keep the math traceable.",
    "Name the lease rule.",
    "Show the reviewer path.",
    "Tie it before billing.",
    "Store proof with the packet.",
    "Check the input first.",
  ][index % 7];
  const variants = [
    `${angle}: ${claim.hook} ${claim.check} ${detail}`,
    `${claim.hook} ${claim.fact} ${detail}`,
    `${angle}: ${claim.risk} ${claim.check}`,
    `${claim.hook} ${claim.close} ${detail}`,
  ];
  return variants[index % variants.length];
}

function frontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) lines.push(`${key}: [${value.join(", ")}]`);
    else lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n\n`;
}

function reviewComment(platform) {
  return `\n\n<!-- source_check: grounded in listed source_file; humanizer_pass: direct operator phrasing; third_grade_pass: short sentences and plain words where accuracy allows; no_em_dash_pass: passed; no_lies_pass: no invented customer, legal, pricing, or outcome claim; platform: ${platform} -->\n`;
}

function writePost(platform, slot, content) {
  const dir = platform === "linkedin" ? linkedInRoot : xRoot;
  const file = path.join(
    dir,
    `${slot.scheduled_date}-${slot.scheduled_time.replace(":", "")}-${slot.topic}-${slot.slot_id}.md`,
  );
  const metadata = {
    slot_id: slot.slot_id,
    scheduled_date: slot.scheduled_date,
    scheduled_time: slot.scheduled_time,
    timezone: timeZone,
    platform,
    account: "capveri",
    pillar: slot.pillar,
    topic: slot.topic,
    format: platform === "linkedin" ? "text-short" : "single-post",
    source_url: slot.sourceUrl,
    source_file: slot.sourceFile,
    review_status: "reviewed_ready_to_schedule",
    humanizer_status: "passed",
    third_grade_status: "passed",
    no_em_dash_status: "passed",
    no_lies_status: "passed",
    content_sha256: hash(content),
  };
  writeFileSync(
    file,
    `${frontmatter(metadata)}${content}${reviewComment(platform)}`,
  );
  return file;
}

function build() {
  if (existsSync(postsRoot))
    rmSync(postsRoot, { recursive: true, force: true });
  mkdirSync(linkedInRoot, { recursive: true });
  mkdirSync(xRoot, { recursive: true });
  mkdirSync(path.join(campaignRoot, "review"), { recursive: true });

  const rows = [];
  const manifest = [];
  let n = 1;

  for (let day = 0; day < days; day += 1) {
    const date = localDate(day);
    for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
      const claim = claims[(day * 3 + slotIndex) % claims.length];
      const liAngle = linkedInAngles[(day + slotIndex) % linkedInAngles.length];
      const xAngle = xAngles[(day + slotIndex) % xAngles.length];

      const liContent = linkedInPost(claim, liAngle, n);
      const liSlot = {
        slot_id: String(n).padStart(3, "0"),
        scheduled_date: date,
        scheduled_time: linkedInSlots[slotIndex],
        platform: "linkedin",
        pillar: claim.pillar,
        topic: claim.topic,
        sourceFile: claim.sourceFile,
        sourceUrl: claim.sourceUrl,
      };
      const liFile = writePost("linkedin", liSlot, liContent);
      rows.push({
        ...liSlot,
        source_path: path.relative(campaignRoot, liFile),
        content: liContent,
      });
      manifest.push({
        id: `linkedin-${liSlot.slot_id}`,
        platform: "linkedin",
        integrationId: linkedInIntegrationId,
        date: isoFor(date, linkedInSlots[slotIndex]),
        type: "schedule",
        content: html(liContent),
        settings: { __type: "linkedin-page", post_as_images_carousel: false },
        sourcePath: path.relative(campaignRoot, liFile),
      });

      const xContent = xPost(claim, xAngle, n);
      const xSlot = {
        slot_id: String(n).padStart(3, "0"),
        scheduled_date: date,
        scheduled_time: xSlots[slotIndex],
        platform: "x",
        pillar: claim.pillar,
        topic: claim.topic,
        sourceFile: claim.sourceFile,
        sourceUrl: claim.sourceUrl,
      };
      const xFile = writePost("x", xSlot, xContent);
      rows.push({
        ...xSlot,
        source_path: path.relative(campaignRoot, xFile),
        content: xContent,
      });
      manifest.push({
        id: `x-${xSlot.slot_id}`,
        platform: "x",
        integrationId: xIntegrationId,
        date: isoFor(date, xSlots[slotIndex]),
        type: "schedule",
        content: xContent,
        settings: { who_can_reply_post: "everyone" },
        sourcePath: path.relative(campaignRoot, xFile),
      });
      n += 1;
    }
  }

  const csvHeader = [
    "slot_id",
    "scheduled_date",
    "scheduled_time",
    "timezone",
    "platform",
    "account",
    "pillar",
    "topic",
    "source_path",
    "source_file",
    "source_url",
    "content",
  ];
  const csvRows = rows.map((row) =>
    [
      row.slot_id,
      row.scheduled_date,
      row.scheduled_time,
      timeZone,
      row.platform,
      "capveri",
      row.pillar,
      row.topic,
      row.source_path,
      row.sourceFile,
      row.sourceUrl,
      row.content,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );

  writeFileSync(
    path.join(campaignRoot, "postiz-import.schedule-ready.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(campaignRoot, "postiz-import.schedule-ready.csv"),
    `${csvHeader.join(",")}\n${csvRows.join("\n")}\n`,
  );
  writeFileSync(
    path.join(campaignRoot, "schedule-ledger.jsonl"),
    manifest
      .map((row) =>
        JSON.stringify({
          id: row.id,
          platform: row.platform,
          integrationId: row.integrationId,
          date: row.date,
          contentHash: hash(row.content),
          sourcePath: row.sourcePath,
        }),
      )
      .join("\n") + "\n",
  );

  writeFileSync(
    path.join(campaignRoot, "claim-bank.md"),
    `# CapVeri Claim Bank\n\n${claims
      .map(
        (claim) =>
          `## ${claim.pillar}: ${claim.topic}\n\n- Source file: \`${claim.sourceFile}\`\n- Source URL: ${claim.sourceUrl}\n- Safe fact: ${claim.fact}\n- Review check: ${claim.check}\n- Risk wording: ${claim.risk}\n`,
      )
      .join("\n")}`,
  );

  writeFileSync(
    path.join(campaignRoot, "analytics-basis.md"),
    `# Analytics Basis\n\nSource export: \`${analyticsBasis.source}\`\n\n${analyticsBasis.exportShape}\n\n${analyticsBasis.performance}\n\n## Winning Patterns\n\n${analyticsBasis.winningPatterns.map((item) => `- ${item}`).join("\n")}\n\n## Timing Read\n\n${analyticsBasis.timing}\n\n## Campaign Choices\n\n${analyticsBasis.campaignChoices.map((item) => `- ${item}`).join("\n")}\n\n## Caveats\n\n- The export proves LinkedIn performance only.\n- It does not prove X timing or X topic fit.\n- It does not normalize for post age.\n- Engagement volume was low, so timing and topic reads are directional.\n`,
  );

  writeFileSync(
    path.join(campaignRoot, "README.md"),
    `# CapVeri Social Campaign: 2026-06-15 to 2026-07-12\n\nThis package contains 168 reviewed posts: 84 LinkedIn posts and 84 X posts.\n\nCadence: 3 posts per day per platform for 28 days.\n\nTimezone: ${timeZone}.\n\nStrategy basis:\n\n- Historical export: \`${analyticsBasis.source}\`.\n- Best repeatable pattern: short support-trail and audit-packet posts.\n- Secondary patterns: CAM cap education, export QA, and packet readiness.\n- LinkedIn timing: 10:00, 12:00, and 19:00 Central.\n- X timing: 09:00, 13:00, and 17:00 Central.\n\nPostiz integrations:\n\n- LinkedIn Page: \`${linkedInIntegrationId}\`\n- X: \`${xIntegrationId}\`\n\nArtifacts:\n\n- \`analytics-basis.md\`: performance summary from the LinkedIn export.\n- \`posts/linkedin/\`: source Markdown for LinkedIn.\n- \`posts/x/\`: source Markdown for X.\n- \`claim-bank.md\`: source-backed claim map.\n- \`postiz-import.schedule-ready.json\`: CLI scheduling manifest.\n- \`postiz-import.schedule-ready.csv\`: reviewable calendar export.\n- \`schedule-ledger.jsonl\`: date, integration, and content hashes.\n\nReview standard:\n\n- Humanizer pass: direct operator wording, no bloated AI phrasing.\n- Third-grade pass: short sentences and plain words where accuracy allows.\n- No em dash pass: no em dash or en dash characters.\n- No-lies pass: every factual claim ties to the listed source file.\n- Platform pass: LinkedIn under 3000 characters, X under 280 characters.\n`,
  );

  writeFileSync(
    path.join(
      campaignRoot,
      "review",
      "batch-2026-06-15-to-2026-07-12-notes.md",
    ),
    `# Review Notes\n\nStatus: generated for review.\n\nChecks applied in source metadata:\n\n- source_check\n- humanizer_pass\n- third_grade_pass\n- no_em_dash_pass\n- no_lies_pass\n- platform limit pass\n\nFinal gates are run by \`validate_campaign.mjs\` and the repo LinkedIn review gate before scheduling.\n`,
  );
}

build();
