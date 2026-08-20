# Epic 11: Data Ingestion UI

## Purpose
Build the file upload interface with source detection, column mapping wizard, and import history management. The ingestion UI must handle large files gracefully and provide clear feedback throughout the upload and processing workflow.

## Business Value
Enables CAM analysts to quickly import GL data and rent rolls from multiple sources (Yardi, MRI, generic formats) with automatic source detection and validation. Supports both known formats (no mapping needed) and unknown formats (with guided column mapping). Provides comprehensive import history and error reporting for data quality management.

## Dependencies
- **Epic 1**: Design system (upload components, progress indicators)
- **Epic 5**: Backend ingestion API
- **Epic 4.5**: Generated API client
- **Epic 10**: Property context for file association

## Stories in This Epic

| ID | Story | Hours | Status |
|----|-------|-------|--------|
| 11.1 | Create Drag-and-Drop File Uploader | 3 | pending |
| 11.2 | Create Upload Progress Display | 2 | pending |
| 11.3 | Create Source Detection Display | 2 | pending |
| 11.4 | Create Column Mapping Wizard | 4 | pending |
| 11.5 | Create Import History List | 3 | pending |
| 11.6 | Create Import Error Display | 3 | pending |
| 11.7 | Create GL Entry Preview | 3 | pending |
| 11.8 | Integration Test - Ingestion E2E | 4 | pending |

**Total Hours**: 24
