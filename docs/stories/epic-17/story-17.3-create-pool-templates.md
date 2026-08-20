# Story 17.3: Create Pool Templates

## Story Info
- **Epic**: Advanced Expense Pools
- **Estimated Hours**: 2
- **Dependencies**: Story 17.1, Story 17.2
- **Status**: `pending`

## User Story
Create reusable pool templates for common configurations (e.g., "Retail Center", "Mixed-Use Building", "Office Building").

## Acceptance Criteria
- [ ] Pre-defined templates for common property types
- [ ] Apply template to property (with confirmation if overwriting)
- [ ] Custom templates can be saved
- [ ] Template shows structure before applying
- [ ] Easy to customize template after applying
- [ ] Template versioning

## Technical Specifications

Pre-defined and custom pool templates with safe application workflows.

**Reference**: See `docs/architecture/pool-allocation-flow.md` for template schema.

### Template Database Model

```python
# backend/app/models/pool_template.py
class PoolTemplate(Base):
    __tablename__ = "pool_templates"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str]  # e.g., "Retail Center", "Office Building"
    description: Mapped[str | None]
    property_type: Mapped[str | None]  # Optional filter
    structure: Mapped[dict] = mapped_column(JSONB)  # Pool hierarchy as JSON
    is_system: Mapped[bool] = mapped_column(default=False)  # System vs custom
    organization_id: Mapped[UUID | None]  # NULL for system templates
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime]

# Template structure format:
# {
#   "pools": [
#     {
#       "name": "Common Area",
#       "gross_up_enabled": true,
#       "children": [
#         {"name": "Lobbies", "gross_up_enabled": true},
#         {"name": "Elevators", "gross_up_enabled": true}
#       ]
#     },
#     {"name": "Taxes", "gross_up_enabled": false, "children": []}
#   ]
# }
```

### Pre-defined System Templates

```python
SYSTEM_TEMPLATES = [
    {
        "name": "Retail Center",
        "property_type": "retail",
        "structure": {
            "pools": [
                {"name": "Common Area Maintenance", "gross_up_enabled": True, "children": [
                    {"name": "Parking Lot", "gross_up_enabled": True},
                    {"name": "Landscaping", "gross_up_enabled": True},
                    {"name": "Security", "gross_up_enabled": True},
                ]},
                {"name": "Utilities", "gross_up_enabled": True, "children": [
                    {"name": "Electric", "gross_up_enabled": True},
                    {"name": "Water/Sewer", "gross_up_enabled": True},
                ]},
                {"name": "Taxes & Insurance", "gross_up_enabled": False, "children": []},
            ]
        }
    },
    {
        "name": "Office Building",
        "property_type": "office",
        "structure": {
            "pools": [
                {"name": "Operating Expenses", "gross_up_enabled": True, "children": [
                    {"name": "Janitorial", "gross_up_enabled": True},
                    {"name": "Elevators", "gross_up_enabled": True},
                    {"name": "HVAC", "gross_up_enabled": True},
                ]},
                {"name": "Utilities", "gross_up_enabled": True, "children": []},
                {"name": "Real Estate Taxes", "gross_up_enabled": False, "children": []},
                {"name": "Insurance", "gross_up_enabled": False, "children": []},
            ]
        }
    },
]
```

### Frontend Template Selector

```typescript
// frontend/src/features/pools/components/TemplateSelector.tsx
export function TemplateSelector({
  propertyId,
  onApply,
}: TemplateSelectorProps) {
  const { data: templates } = useQuery({
    queryKey: ['pool-templates'],
    queryFn: () => api.getPoolTemplates(),
  });

  const [selectedTemplate, setSelectedTemplate] = useState<PoolTemplate | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Apply Pool Template</h3>

      <div className="grid grid-cols-2 gap-4">
        {templates?.map((template) => (
          <Card
            key={template.id}
            className={cn(
              "cursor-pointer hover:border-primary",
              selectedTemplate?.id === template.id && "border-primary bg-primary/5"
            )}
            onClick={() => setSelectedTemplate(template)}
          >
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <PoolPreview structure={template.structure} />
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all existing pools for this property.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onApply(selectedTemplate!)}>
              Apply Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        onClick={() => setShowConfirm(true)}
        disabled={!selectedTemplate}
      >
        Apply Selected Template
      </Button>
    </div>
  );
}
```

## Test Cases

Test template functionality including:
- System templates load correctly
- Custom templates can be saved and retrieved
- Template preview shows correct structure
- Confirmation dialog prevents accidental overwrites
- Template application creates all pools and children
- Template versioning tracks changes

## Definition of Done
- [ ] Templates stored in database
- [ ] Apply template UI with preview
- [ ] Confirmation dialog for overwrites
- [ ] Custom template saving works
- [ ] Template modification post-application works
- [ ] Unit tests passing with 95%+ coverage
