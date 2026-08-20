# Story 17.4: Create Pool Copy Functionality

## Story Info
- **Epic**: Advanced Expense Pools
- **Estimated Hours**: 2
- **Dependencies**: Story 17.1, Story 17.2
- **Status**: `pending`

## User Story
Enable copying complete pool structures from one property to another, maintaining hierarchies and allocations.

## Acceptance Criteria
- [ ] Copy pools from one property to another
- [ ] Validation that target property exists
- [ ] Copy confirmation dialog shows structure
- [ ] Option to merge with existing pools
- [ ] Deep copy of hierarchies and allocations
- [ ] Audit trail of copy operations

## Technical Specifications

Pool copy functionality with validation, confirmation, and merge options.

**Reference**: See `docs/architecture/pool-allocation-flow.md` for copy service patterns.

### Backend Copy Service

```python
# backend/app/services/pools/copy.py
class PoolCopyService:
    """Copy pool structures between properties."""

    async def copy_pools(
        self,
        source_property_id: UUID,
        target_property_id: UUID,
        merge_mode: bool = False,
        db: AsyncSession,
    ) -> CopyResult:
        """
        Copy all pools from source to target property.

        Args:
            merge_mode: If True, add to existing pools. If False, replace all.
        """
        # Validate properties exist
        source = await self._validate_property(source_property_id, db)
        target = await self._validate_property(target_property_id, db)

        # Get source pool structure
        source_pools = await self._get_pools_with_allocations(source_property_id, db)

        if not merge_mode:
            # Delete existing pools (cascade deletes allocations)
            await db.execute(
                delete(ExpensePool).where(ExpensePool.property_id == target_property_id)
            )

        # Create ID mapping for hierarchy preservation
        id_mapping: Dict[UUID, UUID] = {}

        # Copy parent pools first
        for pool in source_pools:
            if pool.parent_pool_id is None:
                new_pool = ExpensePool(
                    property_id=target_property_id,
                    name=pool.name,
                    gross_up_enabled=pool.gross_up_enabled,
                    parent_pool_id=None,
                )
                db.add(new_pool)
                await db.flush()
                id_mapping[pool.id] = new_pool.id

        # Copy child pools with updated parent references
        for pool in source_pools:
            if pool.parent_pool_id is not None:
                new_pool = ExpensePool(
                    property_id=target_property_id,
                    name=pool.name,
                    gross_up_enabled=pool.gross_up_enabled,
                    parent_pool_id=id_mapping[pool.parent_pool_id],
                )
                db.add(new_pool)
                await db.flush()
                id_mapping[pool.id] = new_pool.id

        await db.commit()

        # Log audit trail
        await self._log_copy_operation(source_property_id, target_property_id, id_mapping, db)

        return CopyResult(pools_copied=len(id_mapping))
```

### Frontend Copy Dialog

```typescript
// frontend/src/features/pools/components/PoolCopyDialog.tsx
export function PoolCopyDialog({
  sourcePropertyId,
  open,
  onOpenChange,
}: PoolCopyDialogProps) {
  const [targetPropertyId, setTargetPropertyId] = useState<string>('');
  const [mergeMode, setMergeMode] = useState(false);

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.getProperties(),
  });

  const { data: sourceStructure } = useQuery({
    queryKey: ['pools', sourcePropertyId],
    queryFn: () => api.getPoolStructure(sourcePropertyId),
  });

  const copyMutation = useMutation({
    mutationFn: () => api.copyPools(sourcePropertyId, targetPropertyId, mergeMode),
    onSuccess: () => {
      toast.success('Pools copied successfully');
      onOpenChange(false);
    },
  });

  const targetProperties = properties?.filter(p => p.id !== sourcePropertyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Pool Structure</DialogTitle>
          <DialogDescription>
            Copy all expense pools from this property to another.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Source Structure</Label>
            <div className="mt-2 p-3 bg-muted rounded-md max-h-40 overflow-auto">
              <PoolPreview structure={sourceStructure} />
            </div>
          </div>

          <div>
            <Label>Target Property</Label>
            <Select value={targetPropertyId} onValueChange={setTargetPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select property..." />
              </SelectTrigger>
              <SelectContent>
                {targetProperties?.map((prop) => (
                  <SelectItem key={prop.id} value={prop.id}>
                    {prop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="merge"
              checked={mergeMode}
              onCheckedChange={(checked) => setMergeMode(checked as boolean)}
            />
            <Label htmlFor="merge">
              Merge with existing pools (instead of replacing)
            </Label>
          </div>

          {!mergeMode && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will delete all existing pools on the target property.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => copyMutation.mutate()}
            disabled={!targetPropertyId || copyMutation.isPending}
          >
            {copyMutation.isPending ? 'Copying...' : 'Copy Pools'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Test Cases

Test pool copy functionality including:
- Copy creates identical structure on target property
- Hierarchy preserved (parent-child relationships)
- Allocations copied with updated pool IDs
- Merge mode adds to existing pools
- Replace mode deletes existing pools first
- Audit log records copy operation
- Validation prevents copying to same property

## Definition of Done
- [ ] Copy operation between properties works
- [ ] Target property validation enforced
- [ ] Confirmation shows full structure
- [ ] Merge and replace options work
- [ ] Hierarchies preserved in copy
- [ ] Unit tests passing with 95%+ coverage
