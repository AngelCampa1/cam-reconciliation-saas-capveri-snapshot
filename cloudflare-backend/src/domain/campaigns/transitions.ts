/**
 * Campaign status state-machine.
 *
 * Mirrors Python: backend/app/services/campaigns/transition.py
 *
 * VALID_TRANSITIONS maps the current status to the set of statuses that may
 * follow it.  The map is intentionally declared as a const object so that the
 * transition logic is pure and unit-testable with no I/O.
 */

export type CampaignStatus =
  | "draft"
  | "finalized"
  | "in_review"
  | "approved"
  | "sent";

/**
 * Byte-faithful to Python VALID_TRANSITIONS (transition.py:10-16).
 *
 * DRAFT → FINALIZED
 * FINALIZED → IN_REVIEW
 * IN_REVIEW → APPROVED | FINALIZED  (reject returns to FINALIZED)
 * APPROVED → SENT
 * SENT → (none)
 */
export const VALID_TRANSITIONS: Record<
  CampaignStatus,
  ReadonlySet<CampaignStatus>
> = {
  draft: new Set<CampaignStatus>(["finalized"]),
  finalized: new Set<CampaignStatus>(["in_review"]),
  in_review: new Set<CampaignStatus>(["approved", "finalized"]),
  approved: new Set<CampaignStatus>(["sent"]),
  sent: new Set<CampaignStatus>(),
};

/** Thrown (and re-thrown as 409) when a transition is not allowed. */
export class CampaignTransitionError extends Error {}

/**
 * Validate that current → target is a permitted transition.
 *
 * Mirrors Python (transition.py:22-27) but emits the cleaner status *values*
 * (e.g. 'in_review') rather than Python's leaky `CampaignStatus.IN_REVIEW`
 * enum repr, and a JSON array for the allowed list. The message is informational
 * only — no consumer parses it (transition failures surface as a 409) — so the
 * readable form is intentional, not strict byte-parity.
 */
export function validateTransition(
  current: CampaignStatus,
  target: CampaignStatus,
): void {
  const allowed = VALID_TRANSITIONS[current] ?? new Set<CampaignStatus>();

  if (!allowed.has(target)) {
    const allowedList =
      allowed.size > 0 ? JSON.stringify([...allowed]) : "none";

    throw new CampaignTransitionError(
      `Cannot transition campaign from '${current}' to '${target}'. ` +
        `Allowed transitions from '${current}': ${allowedList}.`,
    );
  }
}
