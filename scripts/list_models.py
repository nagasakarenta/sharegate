"""List the models your Nebius Token Factory key can use, and flag the NVIDIA ones.

  uv run python scripts/list_models.py
Copy the exact Nemotron IDs into .env (MODEL_NANO / MODEL_SUPER / MODEL_ULTRA).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from openai import OpenAI  # noqa: E402

from sharegate.config import settings  # noqa: E402

if settings.mock:
    sys.exit("Set NEBIUS_API_KEY in .env first.")

models = sorted(m.id for m in OpenAI(base_url=settings.base_url, api_key=settings.api_key).models.list())
for m in models:
    mark = "  <- NVIDIA" if "nvidia" in m.lower() or "nemotron" in m.lower() else ""
    print(m + mark)
print("\nconfigured:", settings.model_nano, settings.model_super, settings.model_ultra, sep="\n  ")
missing = [m for m in (settings.model_nano, settings.model_super, settings.model_ultra) if m not in models]
if missing:
    print("\nNOT FOUND in your catalog:", *missing, sep="\n  ")
