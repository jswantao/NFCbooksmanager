# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python FastAPI)

```bash
# Start dev server (from backend/)
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Install deps
pip install -r requirements.txt

# Run tests
pytest
pytest -xvs                           # verbose, stop on first failure
pytest -k "test_name_pattern"         # run matching tests only
```

### Frontend (React + TypeScript + Vite)

```bash
# Start dev server (from frontend/)
npm run dev                           # runs on 0.0.0.0:5173, proxies /api to localhost:8000

# Build
npm run build                         # runs tsc -b && vite build

# Lint
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Three-Tier Design (外模式 / 中间模式 / 内模式)

- **外模式 (External)** — NFC tag read/write, physical shelf management, mobile callback endpoints. Routes: `/api/nfc/*`, `/api/physical-shelves/*`
- **中间模式 (Mapping)** — Physical-to-logical shelf mapping, location code resolution. Routes: `/api/mapping/*`, `/api/shelves/*`
- **内模式 (Internal)** — Book metadata storage, Douban sync, analytics. Routes: `/api/books/*`, `/api/admin/*`

### Backend Structure

- `app/main.py` — FastAPI app with lifespan (logging setup, DB init, seed data). Registers 9 route modules.
- `app/core/config.py` — pydantic-settings config, loads `.env` + `app_settings.json` (for persisted runtime config like Douban cookie). Singleton via `get_settings()`.
- `app/core/database.py` — SQLAlchemy sync + async engines with SQLite PRAGMA config (WAL mode, FK enforcement). Session factories: `SyncSessionLocal`, `AsyncSessionLocal`, `get_db()` (FastAPI dependency), `get_db_context()` (context manager).
- `app/models/models.py` — 8 tables: `physical_shelves`, `logical_shelves`, `physical_logical_mappings`, `book_metadata`, `logical_shelf_books`, `sync_logs`, `activity_logs`, `import_tasks`. All use `TimestampMixin` (created_at/updated_at). Key constraint: ISBN is unique on `book_metadata`.
- `app/services/douban_service.py` — Douban web scraper with multi-strategy search, used via `/api/books/sync`.
- `app/services/nfc_service.py` — NFC payload generation/validation.
- `app/api/` — Route modules. Each uses FastAPI's `APIRouter`. Notable: `nfc_bridge.py` implements the four-level NFC scan decision chain.

### Frontend Structure

- `src/App.tsx` — Root component. All 14 pages are `React.lazy` loaded. Routes defined in `routes[]` array. Uses `BrowserRouter` + `Routes`. Includes `ScrollToTop`, `NotFoundPage`, and per-route `ErrorBoundary` wrapping.
- `src/services/api.ts` — Single axios instance (`/api` base). GET request deduplication via cancel token map. Automatic retry (up to 2) on network errors with exponential backoff. All API calls go through this file.
- `src/types/index.ts` — All TypeScript interfaces (40+ types). Mirrors backend models.
- `src/theme/` — 5 themes (classic, dark, bamboo, ocean, sakura) with CSS variables + Ant Design token overrides. `ThemeContext` provides `useTheme()` hook.
- `src/components/` — Shared components (AppHeader, BookCard, ErrorBoundary, ShelfSelector, etc.).
- `src/utils/` — Utility functions: `format.ts`, `image.ts`, `helpers.ts`.

### Path Aliases (vite.config.ts)

```
@              → src/
@components    → src/components/
@pages         → src/pages/
@services      → src/services/
@utils         → src/utils/
@hooks         → src/hooks/
@types         → src/types/
@theme         → src/theme/
@assets        → src/assets/
```

### Key Conventions

- **API calls**: Never use axios directly. Always add functions to `api.ts` and export from there.
- **Error messages**: Use `extractErrorMessage(error)` from `api.ts` to get user-facing error strings.
- **File naming**: Components use PascalCase, utilities use camelCase.
- **Import order in components**: React → third-party → internal modules → types → styles.
- **Component structure**: types → constants → custom hooks → sub-components → main component.
- **Database**: Uses `Base.metadata.create_all()` for schema (no Alembic migrations). SQLite with WAL journal mode, FK enforcement enabled.
- **Douban cookie**: Stored in `backend/app_settings.json`, managed via `/api/config/cookie` endpoints. Required for Douban sync to work. Validate on startup.
- **NFC flow**: Scanning a tag triggers a four-level decision chain (NDEF payload → tag UID binding → physical shelf lookup → binding prompts). See README for the decision tree.
- **Image caching**: Backend proxies Douban cover images, caches locally for 7 days. Use `getImageProxyUrl(url)` from `api.ts` for all cover image src attributes.
- **Vite proxy**: Dev server proxies `/api` to `http://localhost:8000`. Both server host and proxy target are configurable.
