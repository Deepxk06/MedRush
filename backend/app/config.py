from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MedRush AI"
    environment: str = "development"
    database_url: str = "sqlite:///./medrush.db"
    jwt_secret: str = "medrush-dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    refresh_token_expire_days: int = 7
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    osrm_url: str = "https://router.project-osrm.org"
    map_provider: str = "openstreetmap"
    seed_demo_data: bool = True
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    ml_models_dir: str = "ml_models"
    datasets_dir: str = "datasets"

    def cors_origin_list(self) -> list[str]:
        origins = list(self.cors_origins)
        if self.frontend_url and self.frontend_url not in origins:
            origins.append(self.frontend_url)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()