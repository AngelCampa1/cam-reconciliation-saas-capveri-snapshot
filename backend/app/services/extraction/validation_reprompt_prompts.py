"""Prompt builder for the validation reflexion (re-prompt) loop.

Consistency errors from ``validation.py`` couple two or more fields (today the
cap pair: ``cap_type`` <-> ``cap_rate``). Unlike the gap-filler, which fills one
missing field at a time, reconciliation must re-prompt the coupled fields *as a
group* so the model returns a mutually consistent answer.
"""

from __future__ import annotations

# Maps an individual invalid field to the full group that must be re-prompted
# together. A field absent here reconciles to itself.
RECONCILIATION_GROUPS: dict[str, tuple[str, ...]] = {
    "cap_type": ("cap_type", "cap_rate"),
    "cap_rate": ("cap_type", "cap_rate"),
}

_CAP_GROUP_GUIDANCE = (
    "These two fields describe the CAM expense cap and MUST agree:\n"
    '- cap_type: exactly one of "none", "non_cumulative", "cumulative", '
    '"cumulative_compounding".\n'
    "- cap_rate: the maximum annual increase as a decimal string (e.g. 5% -> "
    '"0.05"), or null.\n\n'
    "Rules:\n"
    '- If a cap percentage exists, cap_type must NOT be "none" — choose the '
    "matching cap_type (cumulative, non_cumulative, or cumulative_compounding) "
    "and keep the cap_rate.\n"
    "- If there is genuinely no cap (only a base year / expense stop), set "
    'cap_type to "none" AND cap_rate to null.\n'
    '- Never return a cap_rate with cap_type "none", and never return a '
    "non-none cap_type without a cap_rate."
)


def fields_to_reconcile(invalid_fields: list[str]) -> set[str]:
    """Expand invalid field names into the full set of fields to re-prompt."""
    fields: set[str] = set()
    for field in invalid_fields:
        fields.update(RECONCILIATION_GROUPS.get(field, (field,)))
    return fields


def build_reprompt(invalid_fields: list[str], guidance: list[str]) -> str:
    """Build a targeted re-extraction prompt for inconsistent fields.

    Args:
        invalid_fields: Fields the validator flagged as inconsistent.
        guidance: Validator ``.message`` strings explaining each inconsistency.

    Returns:
        A prompt instructing the model to re-read the PDF and return JSON with
        exactly the reconciled fields.
    """
    fields = sorted(fields_to_reconcile(invalid_fields))
    guidance_block = "\n".join(f"- {message}" for message in guidance)

    detail = ""
    if {"cap_type", "cap_rate"}.issubset(fields):
        detail = f"\n\n{_CAP_GROUP_GUIDANCE}"

    keys_json = ", ".join(f'"{name}": ...' for name in fields)

    return (
        "A previous extraction from this commercial lease PDF produced "
        "inconsistent values. Re-read the lease carefully and reconcile the "
        "following fields so they agree with each other and with the document.\n\n"
        "Issues found in the previous extraction:\n"
        f"{guidance_block}"
        f"{detail}\n\n"
        f"Return JSON with exactly these keys: {{{keys_json}}}\n"
        "Use null for a field only when the lease genuinely does not state it. "
        "Do not return any other keys or commentary."
    )
