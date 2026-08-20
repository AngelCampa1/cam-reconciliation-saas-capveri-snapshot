# Story 18.4: Create Historical Analysis Report

## Story Info
- **Epic**: Historical Analysis
- **Estimated Hours**: 1
- **Dependencies**: Story 18.1, Story 18.2, Story 18.3
- **Status**: `pending`

## User Story
Create comprehensive historical analysis report combining YoY comparison, trends, and anomalies for landlord/tenant communication.

## Acceptance Criteria
- [ ] Report aggregates all analysis data
- [ ] Professional PDF/HTML layout
- [ ] Executive summary highlighting key findings
- [ ] Year-over-year comparison table
- [ ] Trend charts embedded
- [ ] Anomaly alerts section
- [ ] Customizable sections per organization
- [ ] Shareable report link

## Technical Specifications

Comprehensive historical analysis report combining all analysis components.

**Reference**: See `docs/architecture/anomaly-detection.md` for report generation patterns.

### Report Structure

```typescript
// frontend/src/features/analysis/types/report.ts
interface HistoricalAnalysisReport {
  property: PropertySummary;
  analysisDate: string;
  yearsCompared: number[];

  executiveSummary: {
    totalExpenseChange: number;
    significantAnomalies: number;
    keyFindings: string[];
  };

  yearOverYearComparison: {
    categories: CategoryComparison[];
    totals: YearTotals[];
  };

  trendAnalysis: {
    chartImageUrl: string;
    trendDirection: 'increasing' | 'decreasing' | 'stable';
    avgAnnualChange: number;
  };

  anomalies: DetectedAnomaly[];
  recommendations: string[];
}
```

### PDF Report Generator (Backend)

```python
# backend/app/services/reports/historical_report.py
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet
from io import BytesIO

class HistoricalReportGenerator:
    """Generate PDF historical analysis reports."""

    async def generate(
        self,
        property_id: UUID,
        years: list[int],
        db: AsyncSession,
    ) -> bytes:
        """Generate PDF report and return bytes."""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        # Title
        story.append(Paragraph("Historical Expense Analysis Report", styles['Title']))
        story.append(Spacer(1, 12))

        # Executive Summary
        summary = await self._build_executive_summary(property_id, years, db)
        story.append(Paragraph("Executive Summary", styles['Heading2']))
        for finding in summary.key_findings:
            story.append(Paragraph(f"• {finding}", styles['Normal']))
        story.append(Spacer(1, 12))

        # Year-over-Year Table
        yoy_data = await self._get_yoy_comparison(property_id, years, db)
        table = self._build_comparison_table(yoy_data)
        story.append(Paragraph("Year-over-Year Comparison", styles['Heading2']))
        story.append(table)
        story.append(Spacer(1, 12))

        # Anomalies Section
        anomalies = await self.anomaly_service.detect_anomalies(
            property_id, years[-1], years[:-1], db
        )
        story.append(Paragraph("Detected Anomalies", styles['Heading2']))
        for anomaly in anomalies:
            color = 'red' if anomaly.severity == 'critical' else 'orange'
            story.append(Paragraph(
                f"<font color='{color}'><b>{anomaly.pool_name}</b></font>: {anomaly.explanation}",
                styles['Normal']
            ))

        doc.build(story)
        return buffer.getvalue()

    def _build_comparison_table(self, data: list[CategoryComparison]) -> Table:
        """Build formatted comparison table."""
        headers = ['Category'] + [str(y) for y in data[0].years] + ['Variance']
        rows = [headers]

        for category in data:
            row = [category.name]
            row.extend([f"${amt:,.0f}" for amt in category.amounts])
            variance = category.variance_percent
            row.append(f"{'+' if variance > 0 else ''}{variance:.1f}%")
            rows.append(row)

        return Table(rows)
```

### Excel Export

```python
# backend/app/services/reports/excel_export.py
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

def export_to_excel(report: HistoricalAnalysisReport) -> bytes:
    """Export report to Excel format."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Year-over-Year"

    # Header row with styling
    headers = ['Category'] + [str(y) for y in report.yearsCompared] + ['Variance %']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="CCE5FF", fill_type="solid")

    # Data rows with conditional formatting
    for row_idx, category in enumerate(report.yearOverYearComparison.categories, 2):
        ws.cell(row=row_idx, column=1, value=category.name)
        for col_idx, amount in enumerate(category.amounts, 2):
            ws.cell(row=row_idx, column=col_idx, value=amount)
        variance_cell = ws.cell(row=row_idx, column=len(headers), value=category.variance_percent)

        # Color based on variance
        if abs(category.variance_percent) > 15:
            variance_cell.fill = PatternFill(start_color="FFCCCC", fill_type="solid")
        elif abs(category.variance_percent) > 5:
            variance_cell.fill = PatternFill(start_color="FFFFCC", fill_type="solid")

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
```

### Shareable Report Link

```python
# backend/app/api/v1/reports.py
@router.post("/{property_id}/historical-report")
async def create_historical_report(
    property_id: UUID,
    request: ReportRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate report and return shareable link."""
    report_bytes = await report_generator.generate(property_id, request.years, db)

    # Store in Supabase Storage
    storage_path = f"reports/{property_id}/{uuid4()}.pdf"
    await supabase.storage.from_("reports").upload(storage_path, report_bytes)

    # Create signed URL (expires in 7 days)
    signed_url = await supabase.storage.from_("reports").create_signed_url(
        storage_path, expires_in=604800  # 7 days
    )

    return {"report_url": signed_url}
```

## Test Cases

Test historical report generation including:
- PDF contains all sections (summary, table, charts, anomalies)
- Excel export has correct formatting and conditional colors
- Shareable link generates valid signed URL
- Report customization options work
- Charts embedded correctly in PDF
- Large datasets render without timeout

## Definition of Done
- [ ] Report template created
- [ ] All components included
- [ ] PDF generation works
- [ ] Professional styling applied
- [ ] Customization options work
- [ ] Unit tests passing with 95%+ coverage
