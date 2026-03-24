# Tugboat sim — frontend

## Layout (MVC-ish)

| Area | Role |
|------|------|
| `src/App.tsx` | Main view + simulation loop (`requestAnimationFrame`) |
| `src/components/` | Presentational UI (`TopBar`, `ControlPanel`, modals, …) |
| `src/hooks/` | Controllers: `useKeyboardControls` (input → refs), `useBackendPolling` (when to call `/step`) |
| `src/services/apiClient.ts` | HTTP transport to FastAPI (`createApiClient`) |
| `src/renderer.ts`, `localState.ts`, `npcSteer.ts`, `trafficSpawn.ts` | Client-side sim / rendering |
| `src/types.ts`, `src/constants.ts` | Shared types and constants |

## Backend sync

`/sessions/.../step` is **not** called on a fixed timer while idle. `useBackendPolling` only triggers when the player is steering, throttling, braking, or the tug has meaningful speed/rudder (see `shouldSyncBackend` in `hooks/useBackendPolling.ts`).

## Env

- `VITE_API_BASE_URL` — API base (default `http://localhost:8000`).

```bash
npm install
npm run dev
```
