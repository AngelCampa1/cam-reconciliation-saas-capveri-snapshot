# Story 8.4: Create Sample Lease PDF

## Story Info
- **Epic**: Test Fixture Generation
- **Estimated Hours**: 4
- **Dependencies**: None (foundational test data)
- **Status**: `pending`

## User Story
As a developer, I need sample lease PDF documents so that I can test OCR and lease extraction functionality.

## Acceptance Criteria
- PDF file at `tests/fixtures/leases/sample_commercial_lease.pdf`
- Contains realistic commercial lease structure and language
- Includes all Financial DNA fields: base year, caps, gross-up provisions, admin fees
- Has clear section headers that OCR can identify
- Create variant with complex formatting (multi-column, tables)
- Create variant with poor scan quality simulation

## Technical Specifications
Create `tests/fixtures/generators/lease_pdf_generator.py` with:
- LeaseDocumentGenerator class using ReportLab
- Commercial lease structure with standard sections
- Realistic tenant and property information
- Clear section headers for OCR
- Financial terms documented in standard format

Lease sections to generate:
- Title and parties (Article 1)
- Premises description with square footage and load factor
- Term (commencement and expiration dates)
- Base rent calculation and payment terms
- Operating expenses and additional rent (Article 4 - KEY)
- Base year definition
- Pro-rata share calculation
- Expense caps with detailed cap type explanation
- Gross-up provision with occupancy target
- Administrative fee percentage
- Summary table with key lease terms

PDF features:
- Professional formatting with custom styles
- Table for lease summary with gray headers
- Clear typography for easy OCR
- Text-based (selectable) not image-based
- Standard letter-size pages
- Appropriate margins and spacing

Generate expected values JSON with extracted fields for test assertions.

## Test Cases
- PDF generated successfully
- PDF includes all required sections
- Financial DNA fields clearly documented
- Section headers identifiable by OCR
- Lease summary table formatted clearly
- Text is selectable (not image)
- PDF renders in standard viewers
- Dates in standard format
- Square footage in standard format
- Percentages clearly labeled
- Dollar amounts clearly labeled

## Definition of Done
- [ ] Standard lease PDF generated with all Financial DNA fields
- [ ] Lease summary table clearly formatted
- [ ] Expected extraction values JSON created
- [ ] PDF renders correctly in standard viewers
- [ ] Text is selectable (not image-based)
- [ ] OCR can extract key sections
