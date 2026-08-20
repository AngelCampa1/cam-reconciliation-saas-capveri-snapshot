# Epic 14: OCR Pipeline

## Purpose
Build the document reader integration for lease document processing. This pipeline extracts text and tables from PDF lease documents, preserving bounding box coordinates for the human-in-the-loop verification UI.

## Business Value
Automates the extraction of lease terms from PDF documents using document reader OCR. Eliminates manual data entry of lease financial terms by capturing text and tables with positional coordinates. Provides foundation for AI-powered lease extraction (Epic 15) by ensuring high-quality OCR results with human verification workflow.

## Dependencies
- **Epic 4**: Backend API Skeleton (FastAPI infrastructure)
- **Epic 3**: Database Schema (document storage tables)

## Stories in This Epic

| ID | Story | Hours | Status |
|----|-------|-------|--------|
| 14.1 | Configure document reader Client | 2 | pending |
| 14.2 | Create Document Upload Handler | 2 | pending |
| 14.3 | Create document reader Job Poller | 3 | pending |
| 14.4 | Create Result Parser | 3 | pending |
| 14.5 | Create Table Extraction Handler | 3 | pending |
| 14.6 | Create OCR Result Persistence | 2 | pending |

**Total Hours**: 15
