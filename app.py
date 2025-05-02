from backend.app import create_app
from backend.app.db.init_db import init_db
from backend.app.db.validate_schema import validate_models
from backend.app.db.schema_sync import sync_schema

# Run DB setup before the app starts
init_db()
sync_schema()
validate_models()

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
