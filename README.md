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

## Exporting Data

The backend exposes an `/api/export` endpoint for dumping the database
contents in a format that can be imported into Unreal Engine 5:

```
GET /api/export?format=csv        # Returns a ZIP of CSV files (default)
GET /api/export?format=json       # Returns a JSON file
GET /api/export?format=csv&tables=items,quests
```

When exporting as CSV the first column header is `Name`, containing the
record's ID so it can be used as the row key in UE5 DataTables.

The React frontend exposes these exports under **Database Tools** with quick CSV
and JSON buttons.

