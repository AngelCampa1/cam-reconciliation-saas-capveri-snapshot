"""Tests for the OpenRouter client."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pybreaker
import pytest

from app.config import settings
from app.core.circuit_breakers import get_openrouter_breaker
from app.exceptions import ServiceUnavailableError
from app.services.extraction.openrouter_client import (
    OpenRouterClient,
    get_openrouter_client,
)


def _make_client() -> OpenRouterClient:
    """Make a client with dummy credentials (no real HTTP calls)."""
    return OpenRouterClient(
        api_key="test-key",
        base_url="https://openrouter.ai/api/v1",
    )


class TestOpenRouterClientInit:
    def test_accepts_explicit_api_key(self) -> None:
        client = OpenRouterClient(
            api_key="explicit-key", base_url="https://example.com"
        )
        assert client.api_key == "explicit-key"

    def test_uses_default_provider_config_when_none_provided(self) -> None:
        client = _make_client()
        assert client.provider == OpenRouterClient.DEFAULT_PROVIDER_CONFIG

    def test_custom_provider_overrides_default(self) -> None:
        custom = {"only": ["openai"]}
        client = OpenRouterClient(
            api_key="k",
            base_url="https://example.com",
            provider=custom,
        )
        assert client.provider == custom

    def test_none_provider_uses_default(self) -> None:
        client = OpenRouterClient(api_key="k", base_url="https://x.com", provider=None)
        assert client.provider == OpenRouterClient.DEFAULT_PROVIDER_CONFIG

    def test_default_provider_config_sorts_by_latency(self) -> None:
        # OpenRouter routes to the fastest available provider in the allow-list.
        assert OpenRouterClient.DEFAULT_PROVIDER_CONFIG["sort"] == "latency"
        assert "only" in OpenRouterClient.DEFAULT_PROVIDER_CONFIG

    def test_uses_default_request_timeout_when_none_provided(self) -> None:
        client = _make_client()
        assert client.request_timeout == settings.extraction_request_timeout_seconds

    def test_custom_request_timeout_overrides_default(self) -> None:
        client = OpenRouterClient(
            api_key="k",
            base_url="https://x.com",
            request_timeout=12.5,
        )
        assert client.request_timeout == 12.5


class TestExtract:
    @pytest.mark.asyncio
    async def test_returns_text_and_tokens(self) -> None:
        client = _make_client()
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='{"cap_rate": "0.05"}'))
        ]
        mock_response.usage = MagicMock(prompt_tokens=50, completion_tokens=30)

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_response),
        ):
            text, tokens = await client.extract(
                prompt="extract CAM data",
                document_text="lease text here",
                model="z-ai/glm-5.1",
            )

        assert '{"cap_rate": "0.05"}' in text
        assert tokens == 80  # 50 + 30

    @pytest.mark.asyncio
    async def test_raises_service_unavailable_on_circuit_breaker(self) -> None:
        client = _make_client()

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            side_effect=pybreaker.CircuitBreakerError("open"),
        ):
            with pytest.raises(ServiceUnavailableError):
                await client.extract(
                    prompt="extract",
                    document_text="text",
                    model="z-ai/glm-5.1",
                )

    @pytest.mark.asyncio
    async def test_raises_service_unavailable_on_timeout(self) -> None:
        client = OpenRouterClient(
            api_key="test-key",
            base_url="https://openrouter.ai/api/v1",
            request_timeout=0.01,
        )

        async def _hang(breaker: object, fn: object) -> MagicMock:
            await asyncio.sleep(1.0)
            return MagicMock()

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            side_effect=_hang,
        ):
            with pytest.raises(ServiceUnavailableError):
                await client.extract(
                    prompt="extract",
                    document_text="text",
                    model="z-ai/glm-5.1",
                )

    @pytest.mark.asyncio
    async def test_timeout_does_not_record_breaker_failure(self) -> None:
        # A wall-clock timeout cancels the in-flight call. Cancellation must NOT
        # be counted as a circuit-breaker failure (CancelledError is
        # BaseException-derived and escapes the breaker's `except Exception`),
        # otherwise repeated slow calls would spuriously trip the breaker open.
        breaker = get_openrouter_breaker()
        breaker.close()  # baseline: fail_counter == 0
        assert breaker.fail_counter == 0

        client = OpenRouterClient(
            api_key="test-key",
            base_url="https://openrouter.ai/api/v1",
            request_timeout=0.01,
        )

        async def _slow_create(**kwargs: object) -> MagicMock:
            await asyncio.sleep(1.0)
            return MagicMock()

        try:
            with patch.object(
                client._client.chat.completions, "create", side_effect=_slow_create
            ):
                with pytest.raises(ServiceUnavailableError):
                    await client.extract(
                        prompt="extract",
                        document_text="text",
                        model="z-ai/glm-5.1",
                    )

            assert breaker.fail_counter == 0
        finally:
            breaker.close()

    @pytest.mark.asyncio
    async def test_strips_thinking_tags_from_response(self) -> None:
        client = _make_client()
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(
                message=MagicMock(content='<think>reasoning</think>{"base_year": 2020}')
            )
        ]
        mock_response.usage = MagicMock(prompt_tokens=10, completion_tokens=20)

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_response),
        ):
            text, _ = await client.extract(
                prompt="extract",
                document_text="text",
                model="z-ai/glm-5.1",
            )

        assert "<think>" not in text
        assert '{"base_year": 2020}' in text

    @pytest.mark.asyncio
    async def test_handles_empty_choices_gracefully(self) -> None:
        client = _make_client()
        mock_response = MagicMock()
        mock_response.choices = []
        mock_response.usage = MagicMock(prompt_tokens=5, completion_tokens=0)

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_response),
        ):
            text, tokens = await client.extract(
                prompt="extract",
                document_text="text",
                model="z-ai/glm-5.1",
            )

        assert text == ""
        assert tokens == 5

    @pytest.mark.asyncio
    async def test_passes_fallback_models_to_extra_body(self) -> None:
        client = _make_client()
        client.provider = {}  # Clear provider to isolate fallback test

        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="result"))]
        mock_response.usage = MagicMock(prompt_tokens=10, completion_tokens=5)

        captured_kwargs: dict = {}

        async def _capture_call(breaker: object, fn: object) -> MagicMock:
            captured_kwargs.update({"called": True})
            return mock_response

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            side_effect=_capture_call,
        ):
            await client.extract(
                prompt="extract",
                document_text="text",
                model="z-ai/glm-5.1",
                fallback_models=["openai/gpt-5.4-mini"],
            )

        assert captured_kwargs["called"]

    @pytest.mark.asyncio
    async def test_custom_system_prompt_used(self) -> None:
        client = _make_client()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="ok"))]
        mock_response.usage = MagicMock(prompt_tokens=5, completion_tokens=3)

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_response),
        ) as mock_breaker:
            await client.extract(
                prompt="do something",
                document_text="text",
                model="z-ai/glm-5.1",
                system_prompt="Custom system prompt",
            )

        assert mock_breaker.called

    @pytest.mark.asyncio
    async def test_lease_prompt_prioritizes_late_recovery_excerpts(self) -> None:
        client = _make_client()
        client.max_doc_chars = 700
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="ok"))]
        mock_response.usage = MagicMock(prompt_tokens=5, completion_tokens=3)
        captured_kwargs: dict = {}

        async def _capture_create(**kwargs: object) -> MagicMock:
            captured_kwargs.update(kwargs)
            return mock_response

        document_text = (
            "Opening lease text. "
            + "x" * 1_200
            + "The Common Area Maintenance billed may include an "
            "administrative fee equal to ten percent of Common Area costs."
        )

        with patch.object(
            client._client.chat.completions,
            "create",
            side_effect=_capture_create,
        ):
            await client.extract(
                prompt='{"pro_rata_share": "<decimal>", "admin_fee_percentage": "<decimal>"}',
                document_text=document_text,
                model="z-ai/glm-5.1",
            )

        user_content = captured_kwargs["messages"][1]["content"]
        assert "High-signal lease recovery excerpts" in user_content
        assert "administrative fee equal to ten percent" in user_content
        assert "Opening lease text" in user_content

    def test_non_lease_prompt_uses_plain_truncation(self) -> None:
        client = _make_client()
        client.max_doc_chars = 700
        document_text = (
            "Opening GL text. "
            + "x" * 1_200
            + "The Common Area Maintenance billed may include an administrative fee."
        )

        user_content = client._build_user_content(
            prompt="Analyze GL variance narrative.",
            document_text=document_text,
        )

        assert "High-signal lease recovery excerpts" not in user_content
        assert "administrative fee" not in user_content


class TestExtractPdf:
    @pytest.mark.asyncio
    async def test_returns_text_tokens_and_model(self) -> None:
        client = _make_client()

        response_data = {
            "choices": [{"message": {"content": '{"base_year": 2020}'}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "model": "google/gemini-3-flash-preview",
        }
        mock_http_response = MagicMock()
        mock_http_response.json.return_value = response_data

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_http_response),
        ):
            text, tokens, model = await client.extract_pdf(
                prompt="extract CAM data",
                pdf_bytes=b"%PDF-1.4 fake",
                filename="lease.pdf",
                model="google/gemini-3-flash-preview",
            )

        assert '{"base_year": 2020}' in text
        assert tokens == 150  # 100 + 50
        assert model == "google/gemini-3-flash-preview"

    @pytest.mark.asyncio
    async def test_falls_back_to_request_model_when_response_missing(self) -> None:
        client = _make_client()

        response_data = {
            "choices": [{"message": {"content": "result"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }
        mock_http_response = MagicMock()
        mock_http_response.json.return_value = response_data

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_http_response),
        ):
            _, _, model = await client.extract_pdf(
                prompt="extract",
                pdf_bytes=b"pdf",
                filename="test.pdf",
                model="fallback-model",
            )

        assert model == "fallback-model"

    @pytest.mark.asyncio
    async def test_raises_service_unavailable_on_circuit_breaker(self) -> None:
        client = _make_client()

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            side_effect=pybreaker.CircuitBreakerError("open"),
        ):
            with pytest.raises(ServiceUnavailableError):
                await client.extract_pdf(
                    prompt="extract",
                    pdf_bytes=b"pdf",
                    filename="test.pdf",
                    model="google/gemini-3-flash-preview",
                )

    @pytest.mark.asyncio
    async def test_empty_choices_returns_empty_text(self) -> None:
        client = _make_client()

        response_data: dict = {
            "choices": [],
            "usage": {"prompt_tokens": 5, "completion_tokens": 0},
            "model": "google/gemini-3-flash-preview",
        }
        mock_http_response = MagicMock()
        mock_http_response.json.return_value = response_data

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_http_response),
        ):
            text, tokens, _ = await client.extract_pdf(
                prompt="extract",
                pdf_bytes=b"pdf",
                filename="test.pdf",
                model="google/gemini-3-flash-preview",
            )

        assert text == ""
        assert tokens == 5

    @pytest.mark.asyncio
    async def test_strips_thinking_tags_from_pdf_response(self) -> None:
        client = _make_client()
        raw_content = "<think>skip</think>  " + json.dumps({"base_year": 2021})

        response_data = {
            "choices": [{"message": {"content": raw_content}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "model": "google/gemini-3-flash-preview",
        }
        mock_http_response = MagicMock()
        mock_http_response.json.return_value = response_data

        with patch(
            "app.services.extraction.openrouter_client.call_async_with_breaker",
            new=AsyncMock(return_value=mock_http_response),
        ):
            text, _, _ = await client.extract_pdf(
                prompt="extract",
                pdf_bytes=b"pdf",
                filename="test.pdf",
                model="google/gemini-3-flash-preview",
            )

        assert "<think>" not in text
        assert '"base_year"' in text


class TestGetOpenRouterClient:
    def test_returns_singleton(self) -> None:
        with patch(
            "app.services.extraction.openrouter_client._openrouter_client", None
        ):
            with patch(
                "app.services.extraction.openrouter_client.settings"
            ) as mock_settings:
                mock_settings.openrouter_api_key = "test"
                mock_settings.openrouter_base_url = "https://openrouter.ai/api/v1"
                mock_settings.extraction_max_document_chars = 50000

                c1 = get_openrouter_client()
                c2 = get_openrouter_client()

        assert c1 is c2
