# SoAWebApp

This repository contains a Flask backend and a React frontend.

## Backend setup

```
python -m venv .venv
# On Windows
.\.venv\Scripts\Activate.ps1
# On macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
```

To run the backend locally:

```
python app.py
```

The app will start with debug mode enabled and will initialize the SQLite database if it doesn't exist.

## Frontend setup

The React frontend lives in the `soa-editor` directory.

```
cd soa-editor
npm install
npm run dev
```

This starts the Vite dev server with hot reload enabled.

