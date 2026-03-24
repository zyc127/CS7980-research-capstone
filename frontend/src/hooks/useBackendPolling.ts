import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { LocalState } from "../types";
import type { HelmKeys } from "./useKeyboardControls";

const POLL_MS = 280;

/**
 * Only POST /step when the player is actually driving (keys, speed, or helm).
 * Avoids spamming the backend while idle at the pier.
 */
export function shouldSyncBackend(ls: LocalState | null, keys: HelmKeys): boolean {
  if (!ls) return false;
  const k = keys;
  if (k.fwd || k.rev || k.brake || k.left || k.right || k.throttleUp || k.throttleDown) return true;
  if (Math.abs(ls.tug.speed) > 0.08) return true;
  if (Math.abs(ls.tug.rudder) > 0.55) return true;
  return false;
}

type PollingOpts = {
  status: "connecting" | "ok" | "error" | "no-backend";
  localStateRef: MutableRefObject<LocalState | null>;
  keysRef: MutableRefObject<HelmKeys>;
  raceCompleteRef: MutableRefObject<boolean>;
  sendStep: () => Promise<void>;
};

/**
 * Controller: periodic rule-engine sync with the FastAPI session (only when needed).
 */
export function useBackendPolling({ status, localStateRef, keysRef, raceCompleteRef, sendStep }: PollingOpts) {
  useEffect(() => {
    const id = window.setInterval(() => {
      if (raceCompleteRef.current) return;
      if (status !== "ok") return;
      const ls = localStateRef.current;
      if (!shouldSyncBackend(ls, keysRef.current)) return;
      void sendStep();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [sendStep, status, localStateRef, keysRef, raceCompleteRef]);
}
