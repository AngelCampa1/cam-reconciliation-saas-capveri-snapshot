# Epic 5: Data Ingestion Engine

## Epic Overview

**Goal**: Build the "Anti-Integration" parser layer using Strategy Pattern to handle any ERP export format without requiring vendor integrations.

**Why This Matters**: Unlike competitors who require 6-month integration projects with each ERP vendor, CapVeri accepts raw CSV/Excel exports that accountants already pull. This is our key differentiator - we meet users where they are.

**Dependencies**: Epic 4 (API for file upload), Epic 3 (gl_entries table for storage)

**Delivers**:
- Abstract IngestionStrategy base class
- IngestionDispatcher with source fingerprinting
- YardiVoyagerGLParser for Yardi exports
- MRIRentRollParser for MRI exports
- GenericMappingParser for unknown formats
- Vectorized Pandas cleaning patterns

---

## Stories

### Foundation (Stories 5.1-5.3)
- **Story 5.1**: Create IngestionStrategy Abstract Base Class
- **Story 5.2**: Create File Fingerprinting Logic
- **Story 5.3**: Create IngestionDispatcher

### Data Cleaning (Stories 5.4-5.6)
- **Story 5.4**: Create Vectorized Currency Cleaner
- **Story 5.5**: Create Merged Cell Handler
- **Story 5.6**: Create Garbage Row Filter

### Yardi Parser (Stories 5.7-5.8)
- **Story 5.7**: Create YardiVoyagerGLParser
- **Story 5.8**: Create Yardi Parser Tests

### MRI Parser (Stories 5.9-5.10)
- **Story 5.9**: Create MRIRentRollParser
- **Story 5.10**: Create MRI Parser Tests

### Generic & Infrastructure (Stories 5.11-5.15)
- **Story 5.11**: Create GenericMappingParser
- **Story 5.12**: Create Import Batch Tracking
- **Story 5.13**: Create GL Entries Persistence
- **Story 5.14**: Create File Upload Endpoint
- **Story 5.15**: Create Performance Benchmark

---

## Epic Completion Checklist

When all stories are complete, verify:

- [ ] All parsers registered with dispatcher
- [ ] Fingerprinting correctly identifies sources
- [ ] Yardi parser passes all fixture tests
- [ ] MRI parser passes all fixture tests
- [ ] Generic parser returns data for mapping
- [ ] Batch tracking prevents duplicates
- [ ] GL entries persist correctly
- [ ] Upload endpoint works end-to-end
- [ ] Performance benchmarks pass

---

## CLAUDE.md Additions After Epic 5

```markdown
## Ingestion Parser Rules

### Parser Development
- Every parser MUST have fixture file in `tests/fixtures/`
- Parser tests MUST verify specific values (not just "doesn't crash")
- Use Pandas vectorized operations (no row-by-row loops)
- Preserve `raw_row_data` JSONB for every parsed row

### Performance Requirements
- 5MB file must parse in < 5 seconds
- Memory usage must stay under 512MB
- Use chunked inserts for database persistence

### Adding New Parsers
1. Create parser class extending `IngestionStrategy`
2. Implement `source_system`, `can_handle()`, `parse()`
3. Add fingerprint patterns in `fingerprint.py`
4. Register in dispatcher's `_register_default_parsers()`
5. Create fixture file and tests
```
