"""Upload helpers for API endpoints."""

from typing import Protocol

from fastapi import HTTPException


class ChunkReadableUpload(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


async def read_upload_with_limit(
    file: ChunkReadableUpload,
    *,
    max_size: int,
    too_large_detail: str,
    chunk_size: int = 1024 * 1024,
) -> bytes:
    """Read an upload in bounded chunks and reject as soon as max_size is exceeded."""
    chunks: list[bytes] = []
    total_size = 0

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break

        total_size += len(chunk)
        if total_size > max_size:
            raise HTTPException(status_code=400, detail=too_large_detail)

        chunks.append(chunk)

    return b"".join(chunks)
