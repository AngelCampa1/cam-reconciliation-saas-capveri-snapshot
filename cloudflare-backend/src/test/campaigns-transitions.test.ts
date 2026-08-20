import { describe, expect, it } from "vitest";
import {
  CampaignTransitionError,
  validateTransition,
  VALID_TRANSITIONS,
} from "../domain/campaigns/transitions";

describe("VALID_TRANSITIONS map", () => {
  it("matches Python state machine exactly", () => {
    expect([...VALID_TRANSITIONS.draft]).toEqual(["finalized"]);
    expect([...VALID_TRANSITIONS.finalized]).toEqual(["in_review"]);
    expect([...VALID_TRANSITIONS.in_review].sort()).toEqual(
      ["approved", "finalized"].sort(),
    );
    expect([...VALID_TRANSITIONS.approved]).toEqual(["sent"]);
    expect([...VALID_TRANSITIONS.sent]).toEqual([]);
  });
});

describe("validateTransition", () => {
  it("allows draft → finalized", () => {
    expect(() => validateTransition("draft", "finalized")).not.toThrow();
  });

  it("allows finalized → in_review", () => {
    expect(() => validateTransition("finalized", "in_review")).not.toThrow();
  });

  it("allows in_review → approved", () => {
    expect(() => validateTransition("in_review", "approved")).not.toThrow();
  });

  it("allows in_review → finalized (reject)", () => {
    expect(() => validateTransition("in_review", "finalized")).not.toThrow();
  });

  it("allows approved → sent", () => {
    expect(() => validateTransition("approved", "sent")).not.toThrow();
  });

  it("throws CampaignTransitionError with the readable status-value message for invalid transition", () => {
    let err: unknown;
    try {
      validateTransition("sent", "draft");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CampaignTransitionError);
    expect((err as CampaignTransitionError).message).toBe(
      "Cannot transition campaign from 'sent' to 'draft'. " +
        "Allowed transitions from 'sent': none.",
    );
  });

  it("throws with allowed list when transitions exist but target is wrong", () => {
    let err: unknown;
    try {
      validateTransition("draft", "approved");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CampaignTransitionError);
    expect((err as CampaignTransitionError).message).toMatch(
      /Cannot transition campaign from 'draft' to 'approved'/,
    );
    expect((err as CampaignTransitionError).message).toMatch(
      /Allowed transitions from 'draft':/,
    );
  });
});
