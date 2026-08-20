# Epic 15: LLM Lease Extraction

## Purpose
Integrate Claude 3.5 Sonnet to extract "Financial DNA" from lease documents. This epic builds on the OCR pipeline to intelligently parse lease terms into structured LeaseRecoveryProfile data.

## Business Value
Leverages Claude LLM to intelligently extract key lease terms with high accuracy. Reduces manual data entry requirements by automatically identifying pro-rata shares, expense caps, gross-up formulas, and other CAM-relevant lease terms. Provides confidence scoring for extracted values with human verification workflow, ensuring data quality while maintaining HIPAA/SOC2 compliance.

## Dependencies
- **Epic 14**: OCR Pipeline (extracted text and tables)
- **Epic 2**: Shared Type System (LeaseRecoveryProfile schema)

## Stories in This Epic

| ID | Story | Hours | Status |
|----|-------|-------|--------|
| 15.1 | Configure Anthropic Client | 2 | pending |
| 15.2 | Create Extraction Prompt | 3 | pending |
| 15.3 | Create Extraction Orchestrator | 3 | pending |
| 15.4 | Create Confidence Scoring | 3 | pending |
| 15.5 | Create Validation Layer | 2 | pending |
| 15.6 | Create Extraction Job Queue | 3 | pending |

**Total Hours**: 16
