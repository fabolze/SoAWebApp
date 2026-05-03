# SoA Editor Frontend

React 19 + TypeScript + Vite frontend for the SoAWebApp local RPG content editor.

## Run

```powershell
npm install
npm run dev
```

The frontend expects the Flask backend at `http://localhost:5000` by default. Override it with `VITE_API_BASE_URL` when needed.

## Main Systems

- `src/AppRoot.tsx`: route registration.
- `src/components/SchemaEditor.tsx`: generic dataset editor used by the normal CRUD pages and Advanced Form fallback.
- `src/config/editorDatasets.ts`: dataset registry used for navigation, reference scans, and relationship helpers.
- `src/components/authoring`: immersive authoring components for item, shop, character, and location workflows.
- `src/studio` and `src/presets`: offline recipes, generation providers, variants, and draft bundle helpers.
- `src/health`: project health and reference-quality scanning.
- `src/simulation`: local heuristic balancing sandbox.

## Authoring Modes

Use immersive Author Views for normal content entry when available:

- `/author/items/new` and `/author/items/<id>`
- `/author/shops/new` and `/author/shops/<id>`
- `/author/characters/new` and `/author/characters/<id>`
- `/author/locations/new` and `/author/locations/<id>`
- `/author/locations/map`

Use the generic schema editor routes for full schema coverage, rare fields, debugging, and datasets without a specialized authoring surface. Query selection works through `?selected=<id>`.

## Validation

```powershell
npm run lint
npm run build
```
