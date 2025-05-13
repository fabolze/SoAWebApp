from backend.app import create_app
from backend.app.db.init_db import init_db



# Run DB setup before the app starts
init_db()


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
