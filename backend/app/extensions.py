# File: backend/app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

# Global instances, initialized once
db = SQLAlchemy()
migrate = Migrate()