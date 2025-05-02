from pathlib import Path
from dotenv import load_dotenv
import os

# Load .env
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Ensure data/ exists
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SQLALCHEMY_DATABASE_URI = f"sqlite:///{DATA_DIR / 'db.sqlite'}"
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
