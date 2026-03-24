import { useEffect, useRef } from "react";

export type HelmKeys = {
  left: boolean;
  right: boolean;
  fwd: boolean;
  rev: boolean;
  brake: boolean;
  throttleUp: boolean;
  throttleDown: boolean;
};

/**
 * Controller: keyboard → helm / engine input (refs updated every frame for the sim loop).
 */
export function useKeyboardControls() {
  const keysRef = useRef<HelmKeys>({
    left: false,
    right: false,
    fwd: false,
    rev: false,
    brake: false,
    throttleUp: false,
    throttleDown: false,
  });

  useEffect(() => {
    const map: Record<string, keyof HelmKeys> = {
      arrowleft: "rev",
      arrowright: "fwd",
      arrowup: "throttleUp",
      arrowdown: "throttleDown",
      q: "left",
      e: "right",
      " ": "brake",
    };

    const dn = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (map[k]) {
        keysRef.current[map[k]] = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (map[k]) keysRef.current[map[k]] = false;
    };
    window.addEventListener("keydown", dn, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return keysRef;
}
