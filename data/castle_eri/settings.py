from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = REPO_ROOT / "data" / "castle_eri" / "cache"
OUT_DIR = REPO_ROOT / "public" / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    congress_api_key: str = Field(default="", alias="CONGRESS_API_KEY")
    kalshi_api_key_id: str = Field(default="", alias="KALSHI_API_KEY_ID")
    kalshi_private_key_path: str = Field(default="", alias="KALSHI_PRIVATE_KEY_PATH")

    anthropic_model: str = Field(default="claude-sonnet-4-6")

    def ensure_required(self) -> list[str]:
        missing = []
        if not self.anthropic_api_key:
            missing.append("ANTHROPIC_API_KEY")
        if not self.congress_api_key:
            missing.append("CONGRESS_API_KEY")
        return missing


settings = Settings()
