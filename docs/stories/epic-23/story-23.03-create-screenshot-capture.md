# Story 23.3: Create Screenshot Capture

## Story Info
- **Epic**: User Feedback
- **Estimated Hours**: 2
- **Dependencies**: Story 23.2 (Feedback Widget)
- **Status**: `pending`

## User Story
**As a** user
**I want** to capture a screenshot when submitting feedback
**So that** I can visually show the issue or context

## Acceptance Criteria
- [ ] **AC1**: "Attach Screenshot" button captures current page
- [ ] **AC2**: Preview shown before submitting
- [ ] **AC3**: User can remove screenshot before submitting
- [ ] **AC4**: Screenshot uploaded to Supabase Storage
- [ ] **AC5**: URL included in feedback submission
- [ ] **AC6**: Works on all major browsers

## Technical Specifications

**Install html2canvas**:

```bash
cd frontend
npm install html2canvas
```

**Screenshot Capture Hook**:

```tsx
// frontend/src/hooks/useScreenshotCapture.ts
import { useState, useCallback } from 'react'
import html2canvas from 'html2canvas'

interface UseScreenshotCaptureResult {
  capturing: boolean
  capture: () => Promise<string | null>
  error: string | null
}

export function useScreenshotCapture(): UseScreenshotCaptureResult {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const capture = useCallback(async (): Promise<string | null> => {
    setCapturing(true)
    setError(null)

    try {
      // Hide the feedback widget during capture
      const widget = document.querySelector('[data-feedback-widget]')
      if (widget instanceof HTMLElement) {
        widget.style.visibility = 'hidden'
      }

      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio * 0.5, // Reduce size
        ignoreElements: (element) => {
          // Ignore feedback widget and modals
          return (
            element.hasAttribute('data-feedback-widget') ||
            element.getAttribute('role') === 'dialog'
          )
        },
      })

      // Restore widget visibility
      if (widget instanceof HTMLElement) {
        widget.style.visibility = 'visible'
      }

      // Convert to blob
      return new Promise((resolve) => {
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              setError('Failed to create screenshot')
              resolve(null)
              return
            }

            // Upload to storage
            const url = await uploadScreenshot(blob)
            resolve(url)
          },
          'image/jpeg',
          0.8 // Quality
        )
      })
    } catch (err) {
      setError('Failed to capture screenshot')
      console.error('Screenshot capture error:', err)
      return null
    } finally {
      setCapturing(false)
    }
  }, [])

  return { capturing, capture, error }
}

async function uploadScreenshot(blob: Blob): Promise<string | null> {
  const formData = new FormData()
  const filename = `screenshot-${Date.now()}.jpg`
  formData.append('file', blob, filename)

  const response = await fetch('/api/feedback/screenshot', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Failed to upload screenshot')
  }

  const data = await response.json()
  return data.url
}
```

**Backend - Screenshot Upload Endpoint**:

```python
# backend/app/api/routes/feedback.py (add to existing)
from fastapi import UploadFile, File
from uuid import uuid4

# Max 5MB screenshot
MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/screenshot")
async def upload_screenshot(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """Upload feedback screenshot to storage."""
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(400, "File must be an image")

    # Read file content
    content = await file.read()
    if len(content) > MAX_SCREENSHOT_SIZE:
        raise HTTPException(400, f"File too large. Maximum size is 5MB.")

    # Generate unique filename
    ext = file.filename.split('.')[-1] if file.filename else 'jpg'
    filename = f"feedback/{current_user.organization_id}/{uuid4()}.{ext}"

    # Upload to Supabase Storage
    result = await db.storage.from_('feedback-screenshots').upload(
        filename,
        content,
        file_options={"content-type": file.content_type or "image/jpeg"},
    )

    if result.error:
        raise HTTPException(500, "Failed to upload screenshot")

    # Get public URL
    public_url = db.storage.from_('feedback-screenshots').get_public_url(filename)

    return {"url": public_url}
```

**Updated Feedback Form with Screenshot**:

```tsx
// frontend/src/components/FeedbackWidget/FeedbackForm.tsx (update)
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture'

export function FeedbackForm({ onSuccess }: FeedbackFormProps) {
  // ... existing state ...
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const { capturing, capture, error: captureError } = useScreenshotCapture()

  const handleCaptureScreenshot = async () => {
    const url = await capture()
    if (url) {
      setScreenshotUrl(url)
      toast.success('Screenshot captured')
    } else if (captureError) {
      toast.error('Failed to capture screenshot')
    }
  }

  // ... rest of form ...

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      {/* ... type selector and message ... */}

      {/* Screenshot Section */}
      {screenshotUrl ? (
        <div className="space-y-2">
          <Label>Screenshot</Label>
          <div className="relative">
            <img
              src={screenshotUrl}
              alt="Screenshot preview"
              className="rounded-md border max-h-40 w-full object-contain bg-muted"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => setScreenshotUrl(null)}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleCaptureScreenshot}
          disabled={capturing}
        >
          <Camera className="h-4 w-4 mr-2" />
          {capturing ? 'Capturing...' : 'Attach Screenshot'}
        </Button>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending || message.length < 10 || capturing}
      >
        {mutation.isPending ? 'Submitting...' : 'Submit Feedback'}
      </Button>
    </form>
  )
}
```

**Supabase Storage Bucket Setup**:

```sql
-- Run in Supabase SQL Editor or add to migrations
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', true);

-- Allow authenticated users to upload to their org folder
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = 'feedback'
);

-- Allow public read for screenshot viewing
CREATE POLICY "Public read for feedback screenshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'feedback-screenshots');

-- Allow org admins to delete old screenshots
CREATE POLICY "Admins can delete feedback screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots'
    AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
);
```

## Test Cases

```tsx
// frontend/src/hooks/useScreenshotCapture.test.tsx
import { renderHook, act } from '@testing-library/react'
import { useScreenshotCapture } from './useScreenshotCapture'

// Mock html2canvas
jest.mock('html2canvas', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({
    toBlob: (cb: (blob: Blob) => void) => cb(new Blob(['test'], { type: 'image/jpeg' })),
  })),
}))

// Mock fetch for upload
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ url: 'https://example.com/screenshot.jpg' }),
  })
) as jest.Mock

describe('useScreenshotCapture', () => {
  it('starts with not capturing', () => {
    const { result } = renderHook(() => useScreenshotCapture())

    expect(result.current.capturing).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('captures and uploads screenshot', async () => {
    const { result } = renderHook(() => useScreenshotCapture())

    let url: string | null = null
    await act(async () => {
      url = await result.current.capture()
    })

    expect(url).toBe('https://example.com/screenshot.jpg')
  })

  it('handles capture errors', async () => {
    const html2canvas = require('html2canvas').default
    html2canvas.mockRejectedValueOnce(new Error('Canvas error'))

    const { result } = renderHook(() => useScreenshotCapture())

    await act(async () => {
      await result.current.capture()
    })

    expect(result.current.error).toBe('Failed to capture screenshot')
  })
})
```

```python
# backend/tests/test_feedback_screenshot.py
import pytest
from io import BytesIO
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_upload_screenshot(async_client: AsyncClient, auth_headers: dict):
    """Verify screenshot upload works."""
    # Create test image
    image_data = BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
    image_data.name = 'test.png'

    response = await async_client.post(
        "/api/feedback/screenshot",
        files={"file": ("test.png", image_data, "image/png")},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert "url" in response.json()


@pytest.mark.asyncio
async def test_upload_screenshot_size_limit(async_client: AsyncClient, auth_headers: dict):
    """Verify size limit is enforced."""
    # 6MB file (over 5MB limit)
    large_data = BytesIO(b'\x00' * (6 * 1024 * 1024))

    response = await async_client.post(
        "/api/feedback/screenshot",
        files={"file": ("large.jpg", large_data, "image/jpeg")},
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert "too large" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_upload_non_image_rejected(async_client: AsyncClient, auth_headers: dict):
    """Verify non-images are rejected."""
    response = await async_client.post(
        "/api/feedback/screenshot",
        files={"file": ("test.txt", BytesIO(b"hello"), "text/plain")},
        headers=auth_headers,
    )

    assert response.status_code == 400
```

## Definition of Done
- [ ] html2canvas installed and configured
- [ ] Capture hook works on all major browsers
- [ ] Screenshot uploaded to Supabase Storage
- [ ] Preview displays in form
- [ ] Remove button works
- [ ] URL passed to feedback submission
- [ ] File size validation (5MB max)
- [ ] Storage policies configured
- [ ] Tests pass
