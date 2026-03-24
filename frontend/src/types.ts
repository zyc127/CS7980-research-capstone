export type BackendAgent = {
  position_x: number;
  position_y: number;
  heading: number;
  speed: number;
};

export type BackendState = {
  time_step?: number;
  agents?: {
    tugboat?: BackendAgent;
    cargo_ship?: BackendAgent;
  };
  environment?: {
    zone?: string;
  };
  global_metrics?: Record<string, unknown> & {
    engine_status?: number;
    tugboat_cargo_distance?: number;
  };
  active_events?: Record<string, unknown> & {
    fog_alert?: boolean;
    guidance_request_sent?: boolean;
    engine_failure?: boolean;
    escort_collision_risk?: boolean;
  };
};

export type ConditionEvaluationOut = {
  field: string;
  operator: string;
  threshold: unknown;
  actual_value: unknown;
  result: boolean;
  message: string;
};

export type ExplanationOut = {
  rule_id: string;
  priority: number;
  triggered: boolean;
  timestamp: number;
  logic_used: string;
  message: string;
  conditions: ConditionEvaluationOut[];
  actions: Record<string, unknown>[];
  side_effects: string[];
  events_generated: string[];
  triggered_by?: string | null;
  triggered_rules: string[];
  educational_summary: Record<string, unknown> & { category?: string };
};

export type CreateSessionResponse = {
  session_id: string;
  scenario: string;
  state: BackendState;
};

export type StepResponse = {
  time_step: number;
  state: BackendState;
  explanations: ExplanationOut[];
  rules_triggered: string[];
};

export type LocalVessel = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  /** AI: slowly steers toward this course (degrees). */
  targetHeading?: number;
  /** Collision: vessel sinks and stops. */
  sunk?: boolean;
  /** 0–1 sink animation; at 1 hull is fully submerged (no draw). */
  sinkT?: number;
};

/** Falling cherry-blossom pickup (bonus score). */
export type CherryFlower = {
  id: number;
  x: number;
  y: number;
  rot: number;
  vy: number;
  vx: number;
};

export type LocalState = {
  tug: LocalVessel & { rudder: number };
  cargo: LocalVessel;
  ferry: LocalVessel;
  fishers: LocalVessel[];
  /** Extra NPC vessels (collisions deduct score). */
  traffic: LocalVessel[];
  cam: { x: number; y: number };
  zone: string;
  time: number;
  cherryFlowers: CherryFlower[];
};

