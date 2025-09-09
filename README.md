# SoAWebApp

This repository contains a Flask backend and a React frontend.

## Backend setup

```
python -m venv .venv
# On Windows
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

To run the backend locally:

```
python app.py
```

The app will start with debug mode enabled and will initialize the SQLite database if it doesn't exist.

### CSV Import/Export

- Endpoints:
  - `GET /api/export/csv/<table>`: Exports a single table as CSV. Columns are ordered with `id`, `slug` first (if present), followed by all other fields.
  - `GET /api/export/all-csv-zip`: Exports all tables as CSVs in a ZIP.
  - `POST /api/import/csv/<table>`: Imports a CSV into a table. Existing rows are cleared before import (replace-all behavior).

- Required columns when importing:
  - `id`: Required for all entities (ULID string). Imports fail if missing or empty.
  - `slug`: Optional. If missing for tables that have a slug column, the server will derive one from `name` or `title` (fallback: `id`).

- Notes:
  - Many link tables do not have a `slug` column; import/export will therefore not include it for those tables.
  - For development, you can reset the database with `POST /api/db/reset`.

## Frontend setup

The React frontend lives in the `soa-editor` directory.

```
cd soa-editor
npm install
npm run dev
```

This starts the Vite dev server with hot reload enabled.

