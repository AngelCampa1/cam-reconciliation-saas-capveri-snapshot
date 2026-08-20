# Story 7.6: Create Tenant Packet PDF Export

## Story Info
- **Epic**: Reconciliation API
- **Estimated Hours**: 4
- **Dependencies**: Story 7.4 (snapshots should be finalized)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to export a tenant reconciliation packet as PDF so that I can send professional documentation to tenants.

## Acceptance Criteria
- GET `/api/v1/reconciliation/snapshots/{id}/export/pdf` returns PDF file
- PDF includes: tenant info, property info, expense breakdown, calculation summary
- Professional formatting with company branding
- Includes calculation trace summary (not full detail)
- Returns 400 if snapshot not finalized (optional parameter to override)

## Technical Specifications
Implement in `backend/app/api/v1/exports.py`:
- PDF export endpoint in FastAPI
- TenantPacketGenerator class using ReportLab
- StreamingResponse for PDF delivery
- Conditional finalization check
- Professional formatting with branded styles

PDF structure:
- Header with organization and period information
- Property and tenant information section
- Expense summary table with all key line items
- Calculation breakdown summary (not full trace)
- Footer with disclaimers
- Table formatting with headers and alternating row colors
- Currency formatting for all monetary values
- Page breaks for multi-page documents

Generator handles:
- Snapshot data retrieval
- Related data loading (lease, property, organization)
- Decimal to string formatting
- Date formatting
- Professional layout and spacing
- Error handling for missing data

## Test Cases
- Export finalized snapshot as PDF
- Prevent export of draft snapshot without allow_draft flag
- Export draft snapshot with allow_draft=true
- PDF generated successfully
- PDF includes all required sections
- Professional formatting applied
- Filename includes tenant name and year
- Currency formatting correct
- Table headers and formatting correct
- Calculation breakdown includes key steps
- Calculation trace summary included
- PDF renders in standard viewers
- Missing data handled gracefully

## Definition of Done
- [ ] PDF export endpoint returns valid PDF
- [ ] PDF includes all required sections
- [ ] Professional formatting applied
- [ ] Draft export blocked unless explicitly allowed
- [ ] Filename includes tenant name and year
- [ ] Unit tests verify PDF generation
- [ ] PDF renders correctly in standard viewers
