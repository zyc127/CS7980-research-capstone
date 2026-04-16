import type { CreateSessionResponse, StepResponse, BackendState } from "../types";

export type ApiClientConfig = {
  baseUrl: string;
};

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function asJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${text ? ` — ${text}` : ""}`);
  }
  return (await r.json()) as T;
}

/**
 * HTTP client for the FastAPI backend (`backend/api.py`).
 * @see services/ — API / transport layer (MVC: “model” access to server state)
 */
export function createApiClient(cfg?: Partial<ApiClientConfig>) {
  const baseUrl = cfg?.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

  return {
    baseUrl,

    async health() {
      const r = await fetch(joinUrl(baseUrl, "/health"));
      return asJson<{ status: string; active_sessions: number }>(r);
    },

    async createSession(scenario = "default"): Promise<CreateSessionResponse> {
      const r = await fetch(joinUrl(baseUrl, "/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      return asJson<CreateSessionResponse>(r);
    },

    async deleteSession(sessionId: string) {
      await fetch(joinUrl(baseUrl, `/sessions/${encodeURIComponent(sessionId)}`), { method: "DELETE" });
    },

    async reset(sessionId: string): Promise<{ session_id: string; time_step: number; state: BackendState }> {
      const r = await fetch(joinUrl(baseUrl, `/sessions/${encodeURIComponent(sessionId)}/reset`), { method: "POST" });
      return asJson<{ session_id: string; time_step: number; state: BackendState }>(r);
    },

    async startScenario(sessionId: string, scenario: string) {
      const r = await fetch(joinUrl(baseUrl, `/sessions/${encodeURIComponent(sessionId)}/start`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      return asJson<{ session_id: string; scenario: string; state: BackendState }>(r);
    },

    async getState(sessionId: string): Promise<BackendState> {
      const r = await fetch(joinUrl(baseUrl, `/sessions/${encodeURIComponent(sessionId)}/state`));
      return asJson<BackendState>(r);
    },

    async getRules(sessionId: string) {
      const r = await fetch(joinUrl(baseUrl, `/sessions/${encodeURIComponent(sessionId)}/rules`));
      return asJson<{ session_id: string; rules: unknown }>(r);
    },

    async step(
      sessionId: string,
      body: {
        target_speed?: number;
        target_heading?: number;
        emergency_stop?: boolean;
        tug_position_x?: number;
        tug_position_y?: number;
        cargo_position_x?: number;
        cargo_position_y?: number;
      },
    ): Promise<StepResponse> {
      const r = await fetch(joinUrl(baseUrl, `/sessions/${encodeURIComponent(sessionId)}/step`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return asJson<StepResponse>(r);
    },
  };
}

/** @deprecated Use createApiClient */
export const createBackendClient = createApiClient;
