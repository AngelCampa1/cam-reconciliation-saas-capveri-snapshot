"""Celery application configuration for background extraction jobs."""

from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

try:
    from celery import Celery
    from celery.signals import celeryd_init

    @celeryd_init.connect
    def _init_sentry(**kwargs: Any) -> None:
        from app.core.sentry import init_sentry

        init_sentry()

except ModuleNotFoundError as exc:
    if exc.name != "celery":
        raise

    class _MissingCeleryTask:
        """Fallback task wrapper when Celery is not installed."""

        def __init__(self, func: Callable[..., Any], *, max_retries: int = 0) -> None:
            self._func = func
            self.max_retries = max_retries
            self.request = SimpleNamespace(retries=0)

        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            return self._func(*args, **kwargs)

        def run(self, *args: Any, **kwargs: Any) -> Any:
            return self._func(*args, **kwargs)

        def retry(self, *args: Any, **kwargs: Any) -> None:
            raise ModuleNotFoundError(
                "Celery is not installed; retries are unavailable."
            )

        def apply_async(self, *args: Any, **kwargs: Any) -> None:
            raise ModuleNotFoundError(
                "Celery is not installed; background extraction queue is unavailable."
            )

    class Celery:  # type: ignore[no-redef]
        """Minimal fallback API for application startup without Celery."""

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.conf: dict[str, Any] = {}

        def task(
            self, *args: Any, **kwargs: Any
        ) -> Callable[[Callable[..., Any]], Any]:
            max_retries = int(kwargs.get("max_retries", 0))

            def decorator(func: Callable[..., Any]) -> _MissingCeleryTask:
                return _MissingCeleryTask(func, max_retries=max_retries)

            return decorator

        def autodiscover_tasks(self, *args: Any, **kwargs: Any) -> None:
            return None


from app.config import settings

celery_app = Celery(
    "capveri",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_default_queue=settings.celery_task_default_queue,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=settings.celery_task_soft_time_limit_seconds,
    task_time_limit=settings.celery_task_time_limit_seconds,
    task_always_eager=settings.celery_task_always_eager,
    task_eager_propagates=True,
)

celery_app.autodiscover_tasks(
    ["app.services.extraction.job_queue"],
    force=True,
)
