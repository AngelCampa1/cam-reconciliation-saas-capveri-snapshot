"""
Application configuration via Pydantic Settings.

Loads from environment variables with validation.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_APP_DIR = Path(__file__).resolve().parent


def _resolve_public_knowledge_path(app_dir: Path = _APP_DIR) -> Path:
    """Resolve public knowledge in repo checkouts and backend-only deploy images."""
    paths = (
        app_dir.parent.parent / "knowledge" / "generated" / "public-knowledge.json",
        app_dir / "generated" / "public-knowledge.json",
    )
    return next((path for path in paths if path.exists()), paths[-1])


_PUBLIC_KNOWLEDGE_PATH = _resolve_public_knowledge_path()
_PUBLIC_KNOWLEDGE = json.loads(_PUBLIC_KNOWLEDGE_PATH.read_text(encoding="utf-8"))
_COMPANY_KNOWLEDGE = _PUBLIC_KNOWLEDGE["company"]
_CONTACTS_KNOWLEDGE = _PUBLIC_KNOWLEDGE["contacts"]["items"]
_SITE_URL = _COMPANY_KNOWLEDGE["siteUrl"]
_APP_URL = _COMPANY_KNOWLEDGE["appUrl"]
_CONTACT_EMAIL = next(
    contact["email"] for contact in _CONTACTS_KNOWLEDGE if contact["id"] == "founder"
)
_APEX_SITE_URL = _SITE_URL.replace("https://www.", "https://", 1)
_PRODUCTION_ORIGINS = [_APEX_SITE_URL, _APP_URL, _SITE_URL]


def get_public_knowledge() -> dict:
    """Return the generated public knowledge artifact."""
    return _PUBLIC_KNOWLEDGE


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All settings can be overridden via environment variables.
    The .env file is loaded automatically if present.

    Attributes:
        app_version: Current application version.
        environment: Deployment environment (development, staging, production).
        debug: Enable debug mode (enables /docs and /redoc endpoints).
        cors_origins: List of allowed CORS origins.
        supabase_url: Supabase project URL.
        supabase_anon_key: Supabase anonymous/public API key.
        supabase_service_role_key: Supabase service role key (server-side only).
        database_url: PostgreSQL database connection URL.
        documents_r2_bucket: Cloudflare R2 bucket for document uploads.
        documents_r2_endpoint_url: S3-compatible Cloudflare R2 endpoint.
        documents_r2_access_key_id: Cloudflare R2 access key.
        documents_r2_secret_access_key: Cloudflare R2 secret key.
        documents_r2_region: Region string for the R2 bucket (default auto).
        openrouter_api_key: OpenRouter API key (every LLM call routes via OpenRouter).
        extraction_primary_model: Native-PDF extractor A in the dual-extract pipeline.
        extraction_sibling_model: Native-PDF extractor B in the dual-extract pipeline.
        extraction_judge_model: Arbitrates every per-field disagreement between A and B.
        gap_filler_model: Re-extracts specific missing critical fields on demand.
        cross_doc_model: Reconciles lease ↔ statement findings (text-only).
        gl_analysis_model: GL anomaly analysis (text-only).
        pool_matching_model: Classifies GL line items to expense pools (text-only).
        resend_api_key: Resend API key for transactional emails.
        resend_from_address: Default sender email address for Resend emails.
        resend_webhook_secret: Resend webhook secret for verifying inbound.
        unsubscribe_hmac_secret: HMAC-SHA256 secret for unsubscribe link tokens.
        celery_broker_url: Celery broker URL (Redis).
        celery_result_backend: Celery result backend URL (Redis).
        celery_task_default_queue: Default Celery queue name.
        celery_task_soft_time_limit_seconds: Soft task timeout.
        celery_task_time_limit_seconds: Hard task timeout.
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_format: Log output format ("json" for production, "text" for development).
        sentry_dsn: Sentry DSN for error tracking. Leave empty to disable Sentry.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App settings
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    # CORS - Allowed origins for production
    # In development, we use regex to allow all localhost origins (see main.py)
    # In production, list specific domains here:
    cors_origins: list[str] = _PRODUCTION_ORIGINS

    # Supabase - Required in production, optional with defaults for testing
    supabase_url: str = "http://localhost:54321"
    supabase_anon_key: str = "test-anon-key"
    supabase_service_role_key: str = "test-service-role-key"

    # Database - Required in production, optional with defaults for testing
    database_url: str = "postgresql://postgres:postgres@localhost:54322/postgres"

    # Cloudflare R2 configuration - for document storage
    documents_r2_bucket: str = "capveri-documents"
    documents_r2_endpoint_url: str = ""
    documents_r2_access_key_id: str = ""
    documents_r2_secret_access_key: str = ""
    documents_r2_region: str = "auto"

    # Cloudflare R2 configuration - for lead-magnet downloadable assets
    lead_magnets_r2_bucket: str = "capveri-lead-magnets"

    # OpenRouter Configuration - for dual-extract pipeline + every other LLM call
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Dual-extract: primary native-PDF extraction (Google Gemini 3.1 Flash Lite)
    extraction_primary_model: str = "google/gemini-3.1-flash-lite"
    extraction_primary_fallback: str = "google/gemini-3-flash-preview"
    extraction_primary_fallback_2: str = "moonshotai/kimi-k2.6"

    # Dual-extract: sibling native-PDF extraction (Google Gemini 3.1 Flash Lite)
    extraction_sibling_model: str = "google/gemini-3.1-flash-lite"
    extraction_sibling_fallback: str = "google/gemini-3-flash-preview"
    extraction_sibling_fallback_2: str = "openai/gpt-5.4-mini"

    # Dual-extract: judge arbitrates every disagreement (text-only role)
    extraction_judge_model: str = "z-ai/glm-5.1"
    extraction_judge_fallback: str = "openai/gpt-5.4-mini"
    extraction_judge_fallback_2: str = "moonshotai/kimi-k2.6"

    # Gap-filler: re-extracts specific missing fields on demand (multimodal)
    gap_filler_model: str = "google/gemini-3.1-flash-lite"
    gap_filler_fallback: str = "google/gemini-3-flash-preview"
    gap_filler_fallback_2: str = "moonshotai/kimi-k2.6"

    # Validation reflexion: re-prompts the model to reconcile inconsistent
    # fields (e.g. an orphaned cap_rate) after gap-fill, before final validation.
    validation_reprompt_model: str = "google/gemini-3.1-flash-lite"
    validation_reprompt_fallback: str = "google/gemini-3-flash-preview"
    validation_reprompt_fallback_2: str = "moonshotai/kimi-k2.6"

    # Cross-doc reconciliation orchestrator (text reasoning, no PDF)
    cross_doc_model: str = "z-ai/glm-5.1"
    cross_doc_fallback: str = "openai/gpt-5.4-mini"
    cross_doc_fallback_2: str = "moonshotai/kimi-k2.6"

    # GL anomaly analysis (text reasoning over GL summaries)
    gl_analysis_model: str = "z-ai/glm-5.1"
    gl_analysis_fallback: str = "openai/gpt-5.4-mini"
    gl_analysis_fallback_2: str = "moonshotai/kimi-k2.6"

    # Pool matching (cheap classification of GL line items to expense pools)
    pool_matching_model: str = "moonshotai/kimi-k2.6"
    pool_matching_fallback: str = "openai/gpt-5.4-mini"
    pool_matching_fallback_2: str = "google/gemini-3-flash-preview"

    # Document character truncation cap for text-only LLM calls
    extraction_max_document_chars: int = 100_000

    # Hard wall-clock timeout (seconds) for a single text-only OpenRouter call.
    # Approximates the per-attempt read timeout of the native-PDF path; unlike
    # that path the text path has no client-side retry, so this is the total
    # wall-clock ceiling (not per-attempt). A hung upstream surfaces as
    # ServiceUnavailableError instead of blocking forever.
    extraction_request_timeout_seconds: float = 180.0

    # Validation reflexion loop: max re-prompt rounds to reconcile inconsistent
    # extraction fields. Fail-open — exhaustion just leaves the data for HITL.
    extraction_validation_max_attempts: int = 2

    # Resend Configuration - for transactional emails
    resend_api_key: str = "test-resend-key"
    resend_from_address: str = "Angel Campa <angel.campa@capveri.com>"
    resend_webhook_secret: str = "test-resend-webhook-secret"
    email_logo_url: str = f"{_SITE_URL}/email-logo.png"
    unsubscribe_hmac_secret: str = "dev-unsub-hmac-secret"
    turnstile_secret_key: str = ""
    turnstile_allowed_hostnames: str = (
        "capveri.com,www.capveri.com,app.capveri.com,localhost,127.0.0.1"
    )
    admin_notification_email: str = _CONTACT_EMAIL
    app_base_url: str = _APP_URL
    marketing_base_url: str = _SITE_URL
    sequencer_base_url: str = "https://sequencer.ventoralabs.com"
    sequencer_cf_access_client_id: str = ""
    sequencer_cf_access_client_secret: str = ""

    # Celery Configuration - background extraction jobs
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    celery_task_default_queue: str = "extractions"
    celery_task_soft_time_limit_seconds: int = 600
    celery_task_time_limit_seconds: int = 720
    # Run tasks synchronously in-process (no broker). Enable for tests/local
    # dev when no Celery worker is running. Production keeps this False.
    celery_task_always_eager: bool = False

    # Stripe Configuration - for billing
    stripe_secret_key: str = "sk_test_..."
    stripe_publishable_key: str = "pk_test_..."
    stripe_webhook_secret: str = "whsec_..."
    stripe_price_id_growth_annual: str = "price_growth_annual"
    checkout_offer_token_secret: str = "dev-checkout-offer-token-secret"

    # Logging Configuration
    log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    log_format: str = "json"  # "json" for production, "text" for development

    # Sentry — error tracking (leave empty to disable)
    sentry_dsn: str = ""

    # PostHog - server-side revenue lifecycle analytics from Stripe webhooks
    posthog_project_api_key: str = ""
    posthog_host: str = "https://us.i.posthog.com"

    # AI SDR - signed product context endpoint consumed by Ventora platform worker
    ai_sdr_context_secret: str = ""
    ai_sdr_product_context_secret: str = ""
    ai_cs_context_secret: str = ""

    @model_validator(mode="after")
    def add_localhost_origins_in_dev(self) -> Self:
        """Add localhost origins in development mode."""
        if self.environment == "development":
            # Add common development origins if not already present
            dev_origins = [
                "http://localhost:5173",  # Vite default
                "http://localhost:3000",  # React default
                "http://localhost:8000",  # FastAPI default
            ]
            for origin in dev_origins:
                if origin not in self.cors_origins:
                    self.cors_origins.append(origin)
        # Always ensure canonical production origins are present
        # (env var override may omit these)
        for origin in _PRODUCTION_ORIGINS:
            if origin not in self.cors_origins:
                self.cors_origins.append(origin)
        return self


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance - imported by other modules
settings = Settings()
