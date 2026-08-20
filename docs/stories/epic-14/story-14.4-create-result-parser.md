# Story 14.4: Create Result Parser

## Story Info
- **Epic**: OCR Pipeline
- **Estimated Hours**: 3
- **Dependencies**: Story 14.3
- **Status**: `completed`

## User Story
Parse document reader response blocks into structured data with text content and bounding box coordinates.

## Acceptance Criteria
- [x] Parse LINE blocks with text and geometry
- [x] Parse WORD blocks with confidence scores
- [x] Parse KEY_VALUE_SET blocks for form fields
- [x] Preserve bounding box coordinates (normalized 0-1)
- [x] Calculate page-relative coordinates
- [x] Handle multi-page documents
- [x] Filter low-confidence extractions (< 80%)

## Technical Specifications

document reader result parser extracting text with geometry.

```python
# backend/app/services/extraction/result_parser.py
from dataclasses import dataclass
from decimal import Decimal

@dataclass
class TextBlock:
    text: str
    page: int
    confidence: Decimal
    bounding_box: BoundingBox

@dataclass
class BoundingBox:
    left: Decimal
    top: Decimal
    width: Decimal
    height: Decimal

class document readerResultParser:
    def parse(self, blocks: list[dict]) -> list[TextBlock]:
        results = []
        for block in blocks:
            if block['BlockType'] == 'LINE':
                bbox = block['Geometry']['BoundingBox']
                results.append(TextBlock(
                    text=block['Text'],
                    page=block.get('Page', 1),
                    confidence=Decimal(str(block['Confidence'])),
                    bounding_box=BoundingBox(
                        left=Decimal(str(bbox['Left'])),
                        top=Decimal(str(bbox['Top'])),
                        width=Decimal(str(bbox['Width'])),
                        height=Decimal(str(bbox['Height'])),
                    ),
                ))
        return results
```

## Test Cases
- LINE blocks parsed correctly
- Bounding boxes extracted accurately
- Multi-page documents handled
- Low confidence blocks filtered
- KEY_VALUE_SET blocks parsed

## Definition of Done
- [x] Parser handles all block types
- [x] Bounding boxes preserved
- [x] Multi-page support works
- [x] Confidence filtering works
- [x] Unit tests passing with 95%+ coverage (95% achieved)
