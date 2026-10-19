"""Thin wrapper around Nebius Token Factory (OpenAI-compatible).

Three tiers of NVIDIA Nemotron 3 are used on purpose:
  nano  - runs on every conversation (gate, re-check, topics, voice profile): cheap and fast
  super - decides the output format and writes the document in the author's voice
  ultra - answers questions from everything a person has shared (long context)
Every call is logged to the usage table so the UI can show what each tier cost.
"""

from __future__ import annotations

import json
import re
import time

from openai import OpenAI

from . import db
from .config import settings

_client: OpenAI | None = None


class LLMError(RuntimeError):
    pass


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(base_url=settings.base_url, api_key=settings.api_key)
    return _client


def complete(tier: str, system: str, user: str, *, max_tokens: int = 2000,
             temperature: float = 0.2) -> str:
    if settings.mock:
        raise LLMError("mock mode: no NEBIUS_API_KEY")
    model = settings.model(tier)
    t0 = time.time()
    resp = _get_client().chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens,
        temperature=temperature,
    )
    text = resp.choices[0].message.content or ""
    u = resp.usage
    db.log_usage(tier, model, getattr(u, "prompt_tokens", 0) or 0,
                 getattr(u, "completion_tokens", 0) or 0, time.time() - t0)
    return _strip_reasoning(text)


def _strip_reasoning(text: str) -> str:
    # Reasoning models may prepend <think>...</think>; keep only the answer.
    return re.sub(r"(?s)<think>.*?</think>", "", text).strip()


def complete_json(tier: str, system: str, user: str, *, max_tokens: int = 2000) -> dict:
    sys = system + "\n\nReply with a single JSON object only. No prose, no code fences."
    last = ""
    for _ in range(2):
        last = complete(tier, sys, user, max_tokens=max_tokens, temperature=0.0)
        parsed = parse_json(last)
        if parsed is not None:
            return parsed
        user = user + "\n\nYour previous reply was not valid JSON. Return only the JSON object."
    raise LLMError(f"invalid JSON from {tier}: {last[:200]}")


def parse_json(text: str) -> dict | None:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None
