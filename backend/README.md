# Rule engine + FastAPI backend

## Layout (MVC-ish)

| Area | Role |
|------|------|
| `api.py` | HTTP layer: routes, request/response models, CORS |
| `session.py` | Session manager (per-client state, scenario factories) |
| `rule_engine.py` | Rule evaluation / explanations |
| `models/` | Domain types (`SystemState`, `UserInput`, …) |

The browser frontend calls **`POST /sessions/{id}/step`** only when the player is actively driving (see frontend `useBackendPolling` + `shouldSyncBackend`), so idle UIs should not spam `/step`.

## Run

```bash
cd backend
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```
