# Epic 7: Reconciliation API

## Purpose
Exposes the calculation engine via REST API endpoints with snapshot persistence. It provides the interface for triggering calculations, persisting results as immutable snapshots, and exporting data in various formats (PDF tenant packets, ERP write-back files).

## Business Value
Enables CAM analysts to trigger reconciliation calculations through the application, persist results as immutable snapshots for audit trails, and export data to professional PDF formats and ERP systems for billing and accounting integration.

## Dependencies
- **Epic 6**: Calculation engine must be complete
- **Epic 4**: API skeleton and auth patterns
- **Epic 3**: Database schema for reconciliation_snapshots table

## Stories in This Epic

| ID | Story | Hours | Status |
|---|---|---|---|
| 7.1 | Create Calculate Reconciliation Endpoint | 4 | pending |
| 7.2 | Create Get Snapshot Endpoint | 3 | pending |
| 7.3 | Create List Snapshots Endpoint | 3 | pending |
| 7.4 | Create Finalize Snapshot Endpoint | 3 | pending |
| 7.5 | Create Variance Detection Endpoint | 4 | pending |
| 7.6 | Create Tenant Packet PDF Export | 4 | pending |
| 7.7 | Create ERP Write-Back Export | 4 | pending |

**Total Hours**: 25
