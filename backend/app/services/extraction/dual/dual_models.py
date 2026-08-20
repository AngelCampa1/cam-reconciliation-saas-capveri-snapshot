"""Pydantic models for the dual-extract + judge pipeline."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JudgeVerdict(str, Enum):
    PRIMARY_WINS = "primary_wins"
    SIBLING_WINS = "sibling_wins"
    TRUST_NEITHER = "trust_neither"


class FieldVerdict(BaseModel):
    field: str = Field(..., description="Dotted field name (e.g. 'cap_rate')")
    verdict: JudgeVerdict
    chosen_value: Any = Field(
        None, description="Value chosen by judge; None when TRUST_NEITHER"
    )
    rationale: str = Field("", description="Judge's explanation")


class JudgeResult(BaseModel):
    verdicts: list[FieldVerdict] = Field(default_factory=list)
    fields_judged: int = 0
    model_used: str = ""
    tokens_used: int = 0

    def get_verdict(self, field: str) -> FieldVerdict | None:
        for v in self.verdicts:
            if v.field == field:
                return v
        return None


class DualExtractionResult(BaseModel):
    primary_json: dict[str, Any] = Field(default_factory=dict)
    sibling_json: dict[str, Any] = Field(default_factory=dict)
    primary_model: str = ""
    sibling_model: str = ""
    primary_tokens: int = 0
    sibling_tokens: int = 0
    primary_duration_ms: int = 0
    sibling_duration_ms: int = 0
    primary_failed: bool = False
    sibling_failed: bool = False
    judge_model: str = ""
    judge_tokens: int = 0
    judge_duration_ms: int = 0
    fields_judged: int = 0
