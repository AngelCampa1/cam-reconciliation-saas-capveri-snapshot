# Story 7.7: Create ERP Write-Back Export

## Story Info
- **Epic**: Reconciliation API
- **Estimated Hours**: 4
- **Dependencies**: Story 7.4 (snapshots should be finalized)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to export reconciliation data in ERP-compatible formats so that I can import journal entries into Yardi/MRI.

## Acceptance Criteria
- GET `/api/v1/reconciliation/snapshots/{id}/export/erp?format=yardi` returns Yardi format
- GET `/api/v1/reconciliation/snapshots/{id}/export/erp?format=mri` returns MRI format
- Export includes: account codes, amounts, descriptions, references
- Supports batch export for all finalized snapshots in a period
- Returns CSV or fixed-width file per format requirements

## Technical Specifications
Implement in `backend/app/api/v1/exports.py`:
- Single snapshot export endpoint
- Batch export endpoint
- ERPExportGenerator class with format-specific formatters
- StreamingResponse for file delivery
- ERPFormat enum for supported systems

Format-specific implementations:
- YardiFormatter: Creates journal entry lines with AR and revenue accounts
- MRIFormatter: Fixed-width format with specific column positions
- GenericCSVFormatter: Standard CSV for other systems

Each formatter handles:
- Single snapshot to journal entry conversion
- Batch conversion across multiple snapshots
- Account code mapping
- Debit/credit balance
- Description formatting
- Reference documentation
- Period dating

Yardi format:
- Property, Unit, Tenant, Account, Amount, Description, Reference, PostDate columns
- AR account for tenant debit
- CAM recovery account for credit
- Matching amounts (balanced entries)

MRI format:
- Fixed-width fields for property, entity, account, amount, description, reference
- Specific column positions per MRI spec
- AR and revenue accounts for journal entry

Generic CSV:
- Standard column set: Property, Unit, Tenant, Period Start, Period End, Total Expenses, Tenant Share, Admin Fee, Amount Due
- No system-specific formatting

## Test Cases
- Export single snapshot as Yardi format
- Export single snapshot as MRI format
- Export single snapshot as generic CSV
- Prevent export of draft snapshot
- Batch export all finalized snapshots for property/period
- Batch export with no results (404)
- Account codes included and correct
- Amounts formatted per system requirements
- Debit and credit amounts balanced
- References include period information
- Filenames include property code, tenant name, and year
- Fixed-width format for MRI validated
- CSV format properly escaped and formatted
- Multiple snapshots in batch export correctly combined

## Definition of Done
- [ ] Yardi export format validated against real Yardi import requirements
- [ ] MRI export format validated against real MRI import requirements
- [ ] Generic CSV export includes all fields
- [ ] Batch export combines multiple snapshots correctly
- [ ] Only finalized snapshots can be exported
- [ ] Amounts balance (debits = credits)
- [ ] Unit tests verify output formats
- [ ] Integration test with sample ERP import
