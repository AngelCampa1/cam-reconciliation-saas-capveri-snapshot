# Coding Standards

> Reference guide for Python and TypeScript coding patterns used in CapVeri.
> For critical rules and prohibited behaviors, see [CLAUDE.md](../../CLAUDE.md).

---

## Python (Backend)

### Core Principles
- Use **type hints everywhere** - required for AI comprehension
- Use **Pydantic v2** for all data schemas and validation
- Use **async/await** for I/O operations (file uploads, API calls)
- Prefer **composition over inheritance**
- Use **Decimal** for financial values (never float)
- Follow **PEP 8** with 88-char line limit

### Example: Pydantic Model

```python
from pydantic import BaseModel
from decimal import Decimal
from typing import Optional
from enum import Enum

class CapType(str, Enum):
    NONE = "none"
    CUMULATIVE = "cumulative"
    NON_CUMULATIVE = "non_cumulative"
    CUMULATIVE_COMPOUNDING = "cumulative_compounding"

class LeaseRecoveryProfile(BaseModel):
    base_year: Optional[int] = None
    pro_rata_share: Decimal
    admin_fee_percent: Decimal = Decimal("0.15")
    gross_up_target: Decimal = Decimal("0.95")
    cap_type: CapType = CapType.NONE
    cap_rate: Optional[Decimal] = None
```

### Currency/Amount Cleaning (Vectorized)

```python
# Vectorized currency cleaning for pandas
df['Amount'] = (
    df['Amount'].astype(str)
    .str.replace(r'[$,)]', '', regex=True)
    .str.replace(r'\(', '-', regex=True)
    .str.replace(r' CR', '', regex=True)
    .astype(float)
)
```

---

## TypeScript (Frontend)

### Core Principles
- Use **functional components** with hooks
- Use **Zod** for runtime validation matching backend Pydantic schemas
- Prefer **TanStack Query** over manual fetch/useState patterns
- Keep components small and focused
- Use **absolute imports** with `@/` prefix

### Example: Zod Schema (Matching Backend)

```typescript
import { z } from 'zod';

const CapTypeSchema = z.enum(['none', 'cumulative', 'non_cumulative', 'cumulative_compounding']);

const LeaseRecoveryProfileSchema = z.object({
  base_year: z.number().nullable(),
  pro_rata_share: z.number(),
  admin_fee_percent: z.number().default(0.15),
  gross_up_target: z.number().default(0.95),
  cap_type: CapTypeSchema.default('none'),
  cap_rate: z.number().nullable(),
});
```

---

## Frontend Patterns

### Virtualized Grid

Use `@tanstack/react-virtual` for the reconciliation grid (potentially 30,000+ cells):

```typescript
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 35, // Row height in px
  overscan: 5, // Render 5 rows above/below viewport
});
```

### Optimistic Updates

Use TanStack Query's `onMutate` for instant UI feedback:

```typescript
const mutation = useMutation({
  mutationFn: updateCellData,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['reconciliation'] });
    const previous = queryClient.getQueryData(['reconciliation']);
    queryClient.setQueryData(['reconciliation'], (old) => /* update */);
    return { previous };
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['reconciliation'], context.previous);
    toast.error("Save failed. Data reverted.");
  },
});
```

---

## Data Ingestion Patterns

### File Fingerprinting

The `IngestionDispatcher` reads the first 1KB of uploaded files to identify the source system:

```python
# Signature patterns
YARDI_PATTERNS = [r"Yardi Systems", r"Run Date: \d{2}/\d{2}/\d{4}"]
MRI_PATTERNS = [r"MRI Software", r"PERIOD", r"REF", r"SOURCE"]
```

### Parser Strategies
- `YardiVoyagerGLParser` - Handles Yardi General Ledger exports
- `MRICommercialRentRollParser` - Handles MRI Rent Roll exports
- `GenericMappingParser` - Fallback with manual column mapping UI

### Handling "Messy" Data
1. **Merged Cells**: Use `pandas.DataFrame.fillna(method='ffill')` to propagate context
2. **Multi-Row Headers**: Dynamically detect header row by scanning for keywords
3. **Garbage Rows**: Filter out footers, page numbers, and summary rows
4. **Credit Formats**: Vectorized regex to convert `(500.00)` and `500.00 CR` to `-500.00`

---

## AI Extraction Pipeline

### OCR Flow
1. User uploads PDF lease
2. **document reader** extracts text and table geometry
3. **Claude 3.5 Sonnet** extracts "Financial DNA" to JSON
4. **Human-in-the-Loop UI** displays split view for verification
5. User confirms or edits extracted values
6. Data committed to `leases.recovery_profile`

### Visual Grounding

Map document reader `BoundingBox` coordinates to `react-pdf` canvas for click-to-verify:

```typescript
// document reader returns normalized 0-1 coordinates
// Convert to PDF canvas pixels for highlighting
const highlightBox = {
  left: boundingBox.Left * pageWidth,
  top: boundingBox.Top * pageHeight,
  width: boundingBox.Width * pageWidth,
  height: boundingBox.Height * pageHeight,
};
```

### ZDR (Zero Data Retention)

All Anthropic API calls must include headers/configuration to opt-out of model training. Never send raw financial data to LLMs without explicit ZDR configuration.
