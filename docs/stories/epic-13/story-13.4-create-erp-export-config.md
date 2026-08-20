# Story 13.4: Create ERP Export Config

## Story Info
- **Epic**: Reporting & Export UI
- **Estimated Hours**: 2
- **Dependencies**: Story 13.1, Story 7.7 (ERP Write-Back API)
- **Status**: `pending`

## User Story
Configure ERP-specific export settings (Yardi Voyager, MRI) including field mappings and output format.

## Acceptance Criteria
- [ ] ERP system selector (Yardi, MRI, Custom)
- [ ] Field mapping configuration for each system
- [ ] Preview of output file format
- [ ] GL account code mapping override
- [ ] Date format selection
- [ ] Save configuration as template for reuse
- [ ] Validation of required field mappings

## Technical Specifications

ERP export configuration with system-specific field mappings.

```typescript
// src/features/export/components/ERPExportConfig.tsx
interface ERPExportConfigProps {
  snapshotId: string;
  onExport: (config: ERPConfig) => void;
}

export function ERPExportConfig({ snapshotId, onExport }: ERPExportConfigProps) {
  const [system, setSystem] = useState<'yardi' | 'mri' | 'custom'>('yardi');
  const [mappings, setMappings] = useState<FieldMapping[]>([]);

  const defaultMappings = ERP_FIELD_MAPPINGS[system];

  return (
    <div className="space-y-4">
      <Select value={system} onValueChange={setSystem}>
        <SelectItem value="yardi">Yardi Voyager</SelectItem>
        <SelectItem value="mri">MRI Software</SelectItem>
        <SelectItem value="custom">Custom Format</SelectItem>
      </Select>

      <FieldMappingTable
        fields={defaultMappings}
        overrides={mappings}
        onChange={setMappings}
      />

      <Card className="p-4 bg-muted">
        <h4 className="font-semibold">Output Preview</h4>
        <pre className="text-xs">{generatePreview(system, mappings)}</pre>
      </Card>
    </div>
  );
}
```

## Test Cases
- System selector changes field options
- Field mapping overrides apply correctly
- Preview updates with mapping changes
- Save template persists configuration
- Validation blocks export with missing fields

## Definition of Done
- [ ] ERP system selection works
- [ ] Field mappings configurable
- [ ] Preview renders correctly
- [ ] Template save/load works
- [ ] Unit tests passing with 95%+ coverage
