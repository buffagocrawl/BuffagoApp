from __future__ import annotations

import logging
from io import StringIO
from pathlib import Path
import sys

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from image_pipeline.image_generator import OpenAIImageGenerationClient, OpenAIImageGenerationError  # noqa: E402


class _FakeResponse:
    def __init__(self, *, status_code: int, text: str, payload: dict[str, object] | None = None) -> None:
        self.status_code = status_code
        self.text = text
        self._payload = payload

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 400

    def json(self) -> dict[str, object]:
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class _FakeSession:
    def __init__(self, response: _FakeResponse) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def post(self, *args, **kwargs):
        self.calls.append({"args": args, "kwargs": kwargs})
        return self.response


def _logger() -> tuple[logging.Logger, StringIO]:
    stream = StringIO()
    logger = logging.getLogger("test.openai_image_generation")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.handlers.clear()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    return logger, stream


def test_openai_image_request_logs_diagnostic_payload_before_send() -> None:
    logger, stream = _logger()
    session = _FakeSession(
        _FakeResponse(
            status_code=200,
            text='{"data":[{"b64_json":"aGVsbG8="}]}',
            payload={"data": [{"b64_json": "aGVsbG8="}]},
        )
    )
    client = OpenAIImageGenerationClient(api_key="test-key", logger=logger, session=session)  # type: ignore[arg-type]

    result = client.generate_image(
        prompt="x" * 600,
        model="gpt-image-2",
        size=(1024, 1536),
        content_type="restaurant_spotlight",
        image_type="restaurant",
    )

    assert result["bytes"] == b"hello"
    request_payload = session.calls[0]["kwargs"]["json"]  # type: ignore[index]
    assert request_payload["model"] == "gpt-image-2"
    assert request_payload["size"] == "1024x1536"
    assert request_payload["quality"] == "high"
    assert request_payload["output_format"] == "jpeg"
    assert request_payload["moderation"] == "auto"
    assert "response_format" not in request_payload
    log_output = stream.getvalue()
    assert "openai_image_generation_request" in log_output
    assert "endpoint=https://api.openai.com/v1/images/generations" in log_output
    assert "model=gpt-image-2" in log_output
    assert "size=1024x1536" in log_output
    assert "quality=high" in log_output
    assert "response_format=null" in log_output
    assert "output_format=jpeg" in log_output
    assert "moderation=auto" in log_output
    assert "prompt_length=600" in log_output
    assert f"prompt_preview={'x' * 500}" in log_output


def test_openai_image_error_logs_raw_and_parsed_error_fields() -> None:
    logger, stream = _logger()
    error_payload = {
        "error": {
            "message": "Invalid value for 'model'",
            "type": "invalid_request_error",
            "param": "model",
            "code": "invalid_value",
        }
    }
    session = _FakeSession(_FakeResponse(status_code=400, text='{"error":{"param":"model"}}', payload=error_payload))
    client = OpenAIImageGenerationClient(api_key="test-key", logger=logger, session=session)  # type: ignore[arg-type]

    with pytest.raises(OpenAIImageGenerationError, match="HTTP 400"):
        client.generate_image(
            prompt="A plate of wings",
            model="gpt-image-2",
            size=(1024, 1536),
            content_type="restaurant_spotlight",
            image_type="restaurant",
        )

    log_output = stream.getvalue()
    assert "openai_image_generation_error" in log_output
    assert "response_status_code=400" in log_output
    assert 'response_text={"error":{"param":"model"}}' in log_output
    assert "parsed_json_error=" in log_output
    assert "invalid_parameter=model" in log_output


def test_incompatible_image_model_fails_before_openai_request() -> None:
    logger, _stream = _logger()
    session = _FakeSession(_FakeResponse(status_code=200, text="{}", payload={}))
    client = OpenAIImageGenerationClient(api_key="test-key", logger=logger, session=session)  # type: ignore[arg-type]

    with pytest.raises(OpenAIImageGenerationError, match="incompatible with the OpenAI Image API endpoint"):
        client.generate_image(
            prompt="A plate of wings",
            model="gpt-5.4",
            size=(1024, 1536),
            content_type="restaurant_spotlight",
            image_type="restaurant",
        )

    assert session.calls == []
