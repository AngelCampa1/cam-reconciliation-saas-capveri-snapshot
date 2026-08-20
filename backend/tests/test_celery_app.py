"""Tests for Celery app configuration and worker signal hooks."""

from unittest.mock import MagicMock, patch

import app.celery_app  # noqa: F401 — registers celeryd_init signal handler


class TestCeleryWorkerSentryInit:
    def test_celeryd_init_signal_calls_init_sentry(self) -> None:
        """celeryd_init signal fires init_sentry() so errors are captured in worker."""
        from celery.signals import celeryd_init

        with patch("app.core.sentry.init_sentry") as mock_init_sentry:
            celeryd_init.send(sender=MagicMock())
            mock_init_sentry.assert_called_once()


class TestCeleryEagerConfig:
    def test_eager_flag_wired_from_settings(self) -> None:
        """task_always_eager mirrors settings; eager exceptions propagate.

        Default is non-eager (real broker) but the flag must be wired so
        tests/local dev can run extraction tasks in-process without a worker.
        """
        from app.celery_app import celery_app
        from app.config import settings

        assert celery_app.conf.task_always_eager == settings.celery_task_always_eager
        assert celery_app.conf.task_eager_propagates is True

    def test_eager_setting_defaults_off(self) -> None:
        """Production must not silently run tasks inline."""
        from app.config import Settings

        assert Settings().celery_task_always_eager is False
