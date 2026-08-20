# Story 13.1: Create Export Options Panel

## Story Info
- **Epic**: Reporting & Export UI
- **Estimated Hours**: 2
- **Dependencies**: Epic 12 (Reconciliation Grid UI)
- **Status**: `pending`

## User Story
Build a panel that displays available export options (PDF, Excel, Yardi, MRI) with format-specific configuration.

## Acceptance Criteria
- [ ] Export panel accessible from reconciliation grid toolbar
- [ ] Shows available export formats as selectable cards
- [ ] Each format shows icon, name, and brief description
- [ ] Selecting format reveals format-specific options
- [ ] PDF options: include cover page, include calculation details
- [ ] Excel options: separate sheets per tenant, include formulas
- [ ] ERP options: target system selection (Yardi/MRI)
- [ ] Export button disabled until format selected

## Technical Specifications

Export options panel with format-specific configuration.

```typescript
// src/features/export/components/ExportOptionsPanel.tsx
type ExportFormat = 'pdf' | 'excel' | 'yardi' | 'mri';

interface ExportOptionsProps {
  snapshotId: string;
  onExport: (format: ExportFormat, options: ExportOptions) => void;
}

export function ExportOptionsPanel({ snapshotId, onExport }: ExportOptionsProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [options, setOptions] = useState<ExportOptions>({});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {EXPORT_FORMATS.map((format) => (
          <FormatCard
            key={format.id}
            format={format}
            selected={selectedFormat === format.id}
            onClick={() => setSelectedFormat(format.id)}
          />
        ))}
      </div>
      {selectedFormat && <FormatOptions format={selectedFormat} onChange={setOptions} />}
    </div>
  );
}
```

## Test Cases
- Panel displays all export format options
- Selecting format shows format-specific options
- PDF options toggle correctly
- Export button enables when format selected

## Definition of Done
- [ ] Export panel component created
- [ ] All format cards display correctly
- [ ] Format-specific options work
- [ ] Export button state managed
- [ ] Unit tests passing with 95%+ coverage
