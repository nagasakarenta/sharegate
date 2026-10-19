"""Settings loaded from .env. With no NEBIUS_API_KEY the app runs in mock mode."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    api_key: str = os.getenv("NEBIUS_API_KEY", "").strip()
    base_url: str = os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1")
    model_nano: str = os.getenv("MODEL_NANO", "nvidia/nemotron-3-nano-30b-a3b")
    model_super: str = os.getenv("MODEL_SUPER", "nvidia/nemotron-3-super-120b-a12b")
    model_ultra: str = os.getenv("MODEL_ULTRA", "nvidia/nemotron-3-ultra-550b-a55b")
    chrome_path: str = os.getenv(
        "CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    )
    db_path: Path = ROOT / "sharegate.db"
    artifact_dir: Path = ROOT / "artifacts"
    demo_dir: Path = ROOT / "data" / "demo"

    @property
    def mock(self) -> bool:
        return not self.api_key

    def model(self, tier: str) -> str:
        return {"nano": self.model_nano, "super": self.model_super, "ultra": self.model_ultra}[tier]


settings = Settings()
