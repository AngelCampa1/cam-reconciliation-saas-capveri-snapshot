# Story 13.2: Create PDF Preview

## Story Info
- **Epic**: Reporting & Export UI
- **Estimated Hours**: 3
- **Dependencies**: Story 13.1, Story 7.6 (PDF Export API)
- **Status**: `pending`

## User Story
Show a live preview of the tenant reconciliation PDF before downloading, allowing users to verify content and layout.

## Acceptance Criteria
- [ ] Preview modal shows PDF rendered via react-pdf
- [ ] Page navigation (prev/next/jump to page)
- [ ] Zoom controls (fit width, fit page, percentage)
- [ ] PDF generated server-side with selected options
- [ ] Loading state while PDF generates
- [ ] Download button saves PDF to local device
- [ ] Print button opens system print dialog
- [ ] Error state if PDF generation fails

## Technical Specifications

PDF preview modal with react-pdf viewer and controls.

```typescript
// src/features/export/components/PDFPreviewModal.tsx
interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshotId: string;
  tenantId?: string;
  options: PDFExportOptions;
}

export function PDFPreviewModal({ isOpen, onClose, snapshotId, tenantId, options }: PDFPreviewModalProps) {
  const { data: pdfUrl, isLoading } = useGeneratePDF(snapshotId, tenantId, options);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle>PDF Preview</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <PDFViewer url={pdfUrl} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
          <Button onClick={() => downloadPDF(pdfUrl)}>Download</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Test Cases
- Preview loads PDF from API
- Page navigation works correctly
- Zoom controls function properly
- Download saves file locally
- Print opens system dialog

## Definition of Done
- [ ] PDF preview modal works
- [ ] Navigation and zoom controls work
- [ ] Download and print work
- [ ] Loading and error states handled
- [ ] Unit tests passing with 95%+ coverage
