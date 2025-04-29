# backend/app/config.py

from pathlib import Path
from dotenv import load_dotenv
import os

# 1. load the .env file (once)
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# 2. expose your settings
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///db.sqlite")
SECRET_KEY   = os.getenv("SECRET_KEY", "dev-secret")
# …any other config vars…
