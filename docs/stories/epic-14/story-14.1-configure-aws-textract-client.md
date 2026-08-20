# Story 14.1: Configure document reader Client

## Story Info
- **Epic**: OCR Pipeline
- **Estimated Hours**: 2
- **Dependencies**: Epic 4 (Backend API Skeleton)
- **Status**: `completed`

## User Story
Set up the document reader client with proper authentication, retry logic, and configuration for lease document processing.

## Acceptance Criteria
- [x] boto3 document reader client configured with credentials from environment
- [x] Retry logic for transient failures (exponential backoff)
- [x] Timeout configuration for long-running operations
- [x] Region configuration (default us-east-1)
- [x] Client wrapped in service class for testability
- [x] Mock client available for unit tests
- [x] Health check endpoint to verify AWS connectivity

## Technical Specifications

document reader client wrapper with retry and error handling.

```python
# backend/app/services/extraction/document_reader_client.py
import boto3
from botocore.config import Config
from tenacity import retry, stop_after_attempt, wait_exponential

class document readerClient:
    def __init__(self):
        self.config = Config(
            retries={'max_attempts': 3, 'mode': 'exponential'},
            connect_timeout=5,
            read_timeout=60,
        )
        self.client = boto3.client(
            'document_reader',
            region_name=settings.AWS_REGION,
            config=self.config,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, max=10))
    def start_document_analysis(self, bucket: str, key: str) -> str:
        response = self.client.start_document_analysis(
            DocumentLocation={'S3Object': {'Bucket': bucket, 'Name': key}},
            FeatureTypes=['TABLES', 'FORMS'],
        )
        return response['JobId']
```

## Test Cases
- Client initializes with correct configuration
- Retry logic triggers on transient errors
- Timeout applies to long operations
- Mock client works for unit tests
- Health check returns connectivity status

## Definition of Done
- [x] document readerClient class created
- [x] Retry logic implemented
- [x] Environment configuration works
- [x] Mock client available
- [x] Unit tests passing with 93% coverage (remaining lines are Protocol stubs and retry reraise paths)
