import { unzlibSync } from "fflate";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  buildDemandLetterPdf,
  buildStatementCorrectionNotePdf,
  type DemandLetterData,
} from "../domain/legal/demand-letter";
import { formatDate } from "../domain/pdf/format-date";

// Extract readable text from a pdf-lib document. pdf-lib FlateDecodes content
// streams and emits one `<hex> Tj` show per drawText call, so decoding the
// hex back to latin1 reconstructs each drawn line. (Same helper the statement
// and historical PDF tests use.)
function extractPdfStreamText(bytes: Uint8Array): string {
  const source = Buffer.from(bytes);
  const streamMarker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");
  let output = "";
  let offset = 0;

  while (offset < source.length) {
    const streamStart = source.indexOf(streamMarker, offset);
    if (streamStart === -1) break;

    let dataStart = streamStart + streamMarker.length;
    if (source[dataStart] === 0x0d && source[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (source[dataStart] === 0x0a) {
      dataStart += 1;
    }

    const streamEnd = source.indexOf(endMarker, dataStart);
    if (streamEnd === -1) break;

    let dataEnd = streamEnd;
    if (source[dataEnd - 2] === 0x0d && source[dataEnd - 1] === 0x0a) {
      dataEnd -= 2;
    } else if (source[dataEnd - 1] === 0x0a) {
      dataEnd -= 1;
    }

    const stream = source.subarray(dataStart, dataEnd);
    try {
      output += decodePdfTextOperators(
        Buffer.from(unzlibSync(stream)).toString("latin1"),
      );
    } catch {
      output += decodePdfTextOperators(stream.toString("latin1"));
    }
    output += "\n";
    offset = streamEnd + endMarker.length;
  }

  return output;
}

function decodePdfTextOperators(value: string): string {
  return value.replace(/<([0-9A-Fa-f]+)>\s*Tj/gu, (_match, hex: string) =>
    Buffer.from(hex, "hex").toString("latin1"),
  );
}

// ISO dates chosen so each renders to an unambiguous "Month D, YYYY". No other
// field below contains a YYYY-MM-DD pattern, so the "no ISO date" assertion is
// a clean signal that every date was formatted.
const DATA: DemandLetterData = {
  tenant_name: "Acme Corp",
  property_address: "100 Main St, Suite 4, Dallas, TX 75201",
  amount_owed: new Decimal("12500.00"),
  period_start: "2025-01-01",
  period_end: "2025-12-31",
  lease_reference: "LEASE-100",
  landlord_name: "Jane Landlord",
  landlord_title: "Property Manager",
  landlord_company: "BigCo Realty",
  landlord_phone: "(214) 555 0100",
  landlord_email: "jane@bigco.example",
  landlord_address: "200 Market Ave, Dallas, TX 75202",
  payment_deadline_date: "2026-02-14",
  letter_date: "2026-01-15",
  state: "TX",
  dispute_id: "DISP-7",
  dispute_filed_date: "2025-11-03",
};

const ISO_DATE = /\d{4}-\d{2}-\d{2}/u;

describe("formatDate", () => {
  it("formats an ISO date as a friendly Month D, YYYY", () => {
    expect(formatDate("2026-01-15")).toBe("January 15, 2026");
  });

  it("slices a full ISO timestamp down to the date", () => {
    expect(formatDate("2026-01-15T14:32:01Z")).toBe("January 15, 2026");
  });

  it("returns the input unchanged when it is empty or not an ISO date", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("buildDemandLetterPdf dates", () => {
  it("renders friendly dates and no raw ISO timestamps", async () => {
    const bytes = await buildDemandLetterPdf(DATA);
    const text = extractPdfStreamText(bytes);

    // The letter date is its own line at the top, so it is contiguous.
    expect(text).toContain("January 15, 2026");
    // No date anywhere in the letter stays in machine YYYY-MM-DD form.
    expect(text).not.toMatch(ISO_DATE);
  });
});

describe("buildStatementCorrectionNotePdf dates", () => {
  it("renders friendly dates and no raw ISO timestamps", async () => {
    // Negative amount → correction/credit note path.
    const bytes = await buildStatementCorrectionNotePdf({
      ...DATA,
      amount_owed: new Decimal("-100.00"),
    });
    const text = extractPdfStreamText(bytes);

    expect(text).toContain("January 15, 2026");
    expect(text).not.toMatch(ISO_DATE);
  });
});
