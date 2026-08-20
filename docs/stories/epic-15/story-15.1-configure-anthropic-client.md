# Story 15.1: Configure Anthropic Client

## Story Info
- **Epic**: LLM Lease Extraction
- **Estimated Hours**: 2
- **Dependencies**: Epic 4 (Backend API Skeleton)
- **Status**: `completed`

## User Story
Set up the Anthropic Claude client with Zero Data Retention (ZDR) configuration for secure lease data extraction.

## Acceptance Criteria
- [x] Anthropic Python SDK configured with API key from environment
- [x] Zero Data Retention header enabled on all requests
- [x] Retry logic for rate limits and transient errors
- [x] Timeout configuration for long responses
- [x] Model selection configurable (default claude-3-5-sonnet)
- [x] Token usage tracking for cost monitoring
- [x] Mock client available for unit tests

## Technical Specifications

Anthropic client wrapper with ZDR and retry configuration.

```python
# backend/app/services/extraction/anthropic_client.py
import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

class AnthropicClient:
    def __init__(self):
        self.client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            default_headers={
                "anthropic-beta": "zdr-2024-10-22",  # Zero Data Retention
            },
        )
        self.model = settings.ANTHROPIC_MODEL or "claude-sonnet-4-5-20250929"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, max=30))
    async def extract(self, prompt: str, document_text: str) -> tuple[str, int]:
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": f"{prompt}\n\nDocument:\n{document_text}"}
            ],
        )
        tokens_used = response.usage.input_tokens + response.usage.output_tokens
        return response.content[0].text, tokens_used
```

## Test Cases
- Client initializes with correct configuration
- ZDR header included in requests
- Retry triggers on rate limit errors
- Token usage returned with response
- Mock client works for unit tests

## Definition of Done
- [x] AnthropicClient class created
- [x] ZDR configuration verified
- [x] Retry logic works correctly
- [x] Token tracking implemented
- [x] Unit tests passing with 95%+ coverage (100% for anthropic_client.py)
