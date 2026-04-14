from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Base
    APP_NAME: str = "StockControl"
    ENVIRONMENT: str = "production"
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    RESET_CODE_EXPIRE_MINUTES: int = 15

    # Admin inicial
    FIRST_ADMIN_EMAIL: str
    FIRST_ADMIN_PASSWORD: str
    FIRST_ADMIN_NAME: str = "Administrador"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "StockControl"
    

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
