# TugSim — Maritime Navigation Simulator

An interactive, browser-based tugboat navigation simulator built for museum education. The system uses an explainable rule engine to make every decision visible to the learner: every speed limit enforced, every emergency triggered, and every navigation rule applied is traced back to explicit conditions and explained in plain language.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Architecture](#architecture)
- [Game Mechanics](#game-mechanics)
  - [Controls](#controls)
  - [Navigation Zones](#navigation-zones)
  - [Scoring System](#scoring-system)
  - [NPCs and Traffic](#npcs-and-traffic)
  - [Scenarios](#scenarios)
  - [Collision Detection](#collision-detection)
- [Rule Engine](#rule-engine)
  - [Rule Structure](#rule-structure)
  - [Action Types](#action-types)
  - [Conflict Resolution](#conflict-resolution)
- [API Reference](#api-reference)
- [Educational Design](#educational-design)

---

## Overview

TugSim simulates a tugboat navigating from an open-water departure point through a fog bank, a busy sea-lane, and into a final harbor berth. Along the way a Python-based rule engine evaluates the vessel's state against a YAML rule set on every tick, surfacing explanations about what rules fired and why — teaching maritime navigation principles through transparent cause-and-effect.

Key design choices:

- **Explainability over immersion** — every rule that fires is shown to the player in real time.
- **Decoupled engine** — the frontend runs a full 60 FPS physics simulation locally; the backend is polled every ~200 ms for rule evaluation without blocking the game loop.
- **No-code rule authoring** — all maritime rules live in `backend/rules/harbor_rules.yaml` and can be extended without touching Python.

---

## Project Structure

```
Research-capstone/
├── backend/
│   ├── api.py                    # FastAPI app, CORS, all HTTP routes
│   ├── session.py                # SessionManager — one isolated engine per visitor
│   ├── rule_engine.py            # Core decision engine (rule eval, chaining, explanations)
│   ├── models/
│   │   ├── state.py              # SystemState, AgentState, EnvironmentState
│   │   ├── rule.py               # Rule, Condition schemas
│   │   ├── action.py             # Action types and payloads
│   │   ├── explanation.py        # Explanation, ConditionEvaluation output
│   │   ├── enums.py              # Operator, ActionType, Zone, ConflictStrategy
│   │   ├── event.py              # Event model
│   │   ├── input.py              # UserInput schema
│   │   └── conflict_resolution.py
│   ├── rules/
│   │   └── harbor_rules.yaml     # 20+ maritime rules (all scenarios)
│   ├── scenarios/
│   │   └── vancouver_harbor.py   # 4 scenario factory functions
│   ├── tests/
│   │   └── test_rules.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main game loop, physics, collision, scoring
│   │   ├── constants.ts          # World dimensions, physics tuning, weather presets
│   │   ├── types.ts              # TypeScript types for backend + local state
│   │   ├── localState.ts         # Initial client-side state factory
│   │   ├── renderer.ts           # Canvas 2D top-down renderer
│   │   ├── fpvRenderer.ts        # First-person bridge-view renderer
│   │   ├── npcSteer.ts           # NPC vessel AI (target-heading interpolation)
│   │   ├── trafficSpawn.ts       # Ephemeral traffic spawn/cull logic
│   │   ├── proximity.ts          # Distance helpers
│   │   ├── components/
│   │   │   ├── TopBar.tsx        # Scenario + weather selector, score display
│   │   │   ├── ControlPanel.tsx  # Live speed / heading / zone gauges
│   │   │   ├── ExplanationPanel.tsx  # Rule popup (triggered rules + conditions)
│   │   │   ├── RuleLog.tsx       # Scrolling history of all fired rules
│   │   │   ├── PortCompleteModal.tsx  # End-of-run score + star rating
│   │   │   ├── RudderWheel.tsx   # Visual rudder angle indicator
│   │   │   ├── AnalogGauge.tsx   # Speed gauge
│   │   │   ├── ThrottleLever.tsx # Throttle control visual
│   │   │   └── WarningLight.tsx  # NPC / zone warning indicator
│   │   ├── services/
│   │   │   └── apiClient.ts      # HTTP client for /sessions endpoints
│   │   ├── hooks/
│   │   │   ├── useBackendPolling.ts   # Sends step requests when the tug moves
│   │   │   └── useKeyboardControls.ts # Keyboard state tracker
│   │   ├── styles.css
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
└── README.md
```

---

## Getting Started

### Backend

**Requirements:** Python 3.10+

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt

# 2. Start the server
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

The API is now available at `http://localhost:8000`. Visit `http://localhost:8000/docs` for the interactive Swagger UI.

**Backend dependencies:**

| Package | Version |
|---------|---------|
| fastapi | 0.115.0 |
| uvicorn[standard] | 0.30.6 |
| pydantic | 2.8.2 |
| pyyaml | 6.0.2 |

---

### Frontend

**Requirements:** Node.js 18+

```bash
# 1. Install dependencies
cd frontend
npm install

# 2. Start the dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

Additional scripts:

```bash
npm run build    # TypeScript check + production Vite bundle
npm run preview  # Serve the production build locally
```

> The frontend works in **demo mode** without the backend running — all physics and rendering are local. Backend connection unlocks the rule engine, explanations, and scenario events.

---

## Architecture

```
Browser (React + Canvas)
│
│  60 FPS game loop (physics, NPC AI, collision, scoring)
│  ↕ keyboard input
│  ↕ state read/write (localStateRef)
│
│  every ~200 ms (if tug is moving)
│  ─────────────────────────────────────────────► FastAPI  :8000
│                                                  │
│                                                  │  SessionManager
│                                                  │  └─ Session
│                                                  │     ├─ SystemState
│                                                  │     └─ RuleEngine
│                                                  │        └─ harbor_rules.yaml
│  ◄─────────────────────────────────────────────
│  { state, explanations, rules_triggered }
│
│  ExplanationPanel / RuleLog updated
```

**Frontend** owns all real-time simulation:
- Physics (speed, heading, rudder, drag)
- NPC steering and collision detection
- Camera follow-cam
- Canvas rendering (top-down + first-person view)
- Score tracking

**Backend** handles rule evaluation only:
- Receives `{ target_speed, target_heading, emergency_stop }` per tick
- Evaluates 20+ YAML rules against the current `SystemState`
- Returns triggered explanations and any state overrides (engine failure cap, zone update)
- Each browser session has its own isolated `Session` object with independent state

---

## Game Mechanics

### Controls

| Key | Action |
|-----|--------|
| `↑` | Increase throttle (forward) |
| `↓` | Decrease throttle / reverse |
| `Q` | Port (left) rudder |
| `E` | Starboard (right) rudder |
| `Space` | Brake / emergency stop |
| `V` | Toggle first-person bridge view |

The `↑ / ↓` arrow keys also adjust the **throttle cap** (5–18 knots). The tug accelerates toward the cap with a ramp-up for realistic response.

---

### Navigation Zones

The world is 12 000 units wide. Zones are determined automatically by the tug's X position:

| Zone | X Range | Description |
|------|---------|-------------|
| Open Water | 0 – 4 499 | Unrestricted navigation, 12 kn cap |
| Sea Lanes (Fog) | 4 500 – 7 499 | Automatic fog, 6 kn advisory, rules active |
| Channel | 7 500 – 11 199 | Narrow approach, no-wake rules active |
| Port | 11 200 + | Docking complete — run ends |

Entering the **fog zone** (X = 4 500) automatically switches weather to fog and triggers the `fog` backend scenario. Approaching the **final berth** (X ≥ 10 000) triggers the `docking` scenario.

---

### Scoring System

**Passive score** accumulates while the tug is moving (~0.7 pts/sec at 60 FPS).

**Cherry blossom pickups** — falling petals scattered across the world. Collecting them awards combo-based points:

| Combo streak | Points per flower |
|---|---|
| 1 – 2 in a row | +10 |
| 3 – 4 in a row | +12 |
| 5 – 7 in a row | +15 |
| 8+ in a row | +18 |

The combo resets after 4 seconds without a pickup.

**Safe navigation bonus** — +5 points every 20 continuous seconds of collision-free movement. Resets on any collision.

**Penalties:**

| Event | Score change |
|---|---|
| NPC vessel collision | −15 |
| Moored ship graze | −3 |

**Milestone toasts** appear at:

| Score | Message |
|-------|---------|
| 10 | Nice Start! |
| 20 | Smooth Sailing! |
| 50 | Flower Collector! |
| 100 | Master Navigator! |
| 200 | Sea Legend! |

**End-of-run star rating:**

| Stars | Score required |
|-------|---------------|
| ★☆☆ | 20 |
| ★★☆ | 50 |
| ★★★ | 100 |

---

### NPCs and Traffic

| Vessel | Collision radius | Behavior |
|--------|----------------|----------|
| Ferry | 52 px | Persistent, slow heading interpolation |
| Fishers | 38 px | Persistent, moderate agility |
| Traffic | 40 px | Ephemeral — spawn/despawn near camera |

All NPCs use a target-heading interpolation AI and steer around `WATER_ROCKS` obstacles scattered through the world. Colliding with an NPC sinks it with a splash + debris particle effect and triggers a screen flash and camera shake.

---

### Scenarios

| Scenario | Trigger | Key rules active |
|----------|---------|-----------------|
| `default` | Game start / manual select | Open-water speed limit, cargo escort separation |
| `fog` | Tug enters X 4 500 – 7 500 | Low-visibility speed limit (6 kn), guidance prompt |
| `docking` | Tug reaches X ≥ 10 000 | Final approach speed (3 kn), heading error, moored ship proximity |
| `emergency` | Manual select in top bar | Engine failure event, anchor deployment, Mayday protocol |

Scenarios can also be manually selected from the top bar to explore specific rule sets independently.

---

### Collision Detection

- **NPC vessels** — circle vs. circle check every frame. On hit: vessel sinks, 18 splash + 8 debris particles emitted, screen red-flash, 1-second camera shake, 0.85-second collision cooldown.
- **Moored ships** — axis-aligned bounding box (3 static ships at quay). Tug is pushed out of overlap; sustained contact deducts −3 pts.
- **Reefs/rocks** — 11 positions in the world. Not directly fatal to the player, but all NPC vessels steer away from them via avoidance radius checks.

---

## Rule Engine

Rules are defined in `backend/rules/harbor_rules.yaml`. The engine evaluates them every tick in descending priority order (higher number = higher priority).

### Rule Structure

```yaml
- id: low_visibility_speed_limit
  priority: 62
  description: "Reduce speed in fog or low visibility"
  conditions:
    logic: AND
    items:
      - field: environment.visibility
        operator: lt
        threshold: 1.0
      - field: agents.tugboat.speed
        operator: gt
        threshold: 6.0
  actions:
    - type: RECOMMEND
      target: agents.tugboat.speed
      value: 6.0
  explanation_template: >
    Visibility is {environment.visibility} km — below the 1 km threshold.
    Maximum safe speed in low visibility is 6 knots.
  metadata:
    category: safety
    educational_focus: "Reduced visibility requires reduced speed to allow reaction time."
    tags: [fog, speed_limit, colregs]
```

**Condition fields** support dot-path resolution into `SystemState`:
- `agents.tugboat.speed` — agent attribute
- `environment.visibility` — environment attribute
- `global_metrics.collision_risk` — computed metric
- `events.engine_failure` — active event flag

**Template expressions** in action values support arithmetic: `{{agents.tugboat.speed + 2.0}}`

### Action Types

| Type | Effect |
|------|--------|
| `SET` | Directly assign a value to a state field |
| `ADD` | Increment a metric by a value |
| `CLAMP` | Constrain a field to `[min, max]` |
| `RECOMMEND` | Informational — no state change, surfaces as explanation |
| `TRIGGER_RULE` | Chain execution to another rule by ID |
| `SPAWN_EVENT` | Set an active event flag (e.g. `engine_failure`) |
| `LOG` | Write an audit entry to the session history |

### Conflict Resolution

When multiple rules are satisfied in the same tick, the engine uses a **PRIORITY** strategy by default: the highest-priority rule's actions are applied first. Lower-priority rules that modify the same field are skipped to avoid contradictions.

Rule chaining via `TRIGGER_RULE` allows multi-level decision flows (e.g. collision risk → emergency stop → anchor deployment) without coupling the rules directly.

---

## API Reference

Base URL: `http://localhost:8000`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check; returns active session count |
| `GET` | `/scenarios` | List available scenario names and descriptions |
| `POST` | `/sessions` | Create session — body: `{"scenario": "default"}` |
| `DELETE` | `/sessions/{id}` | Destroy session and free state |
| `POST` | `/sessions/{id}/start` | Re-initialize with a different scenario |
| `POST` | `/sessions/{id}/step` | Advance one tick — body: `{"target_speed": 8.0, "target_heading": 90.0, "emergency_stop": false}` |
| `POST` | `/sessions/{id}/reset` | Reset to initial scenario state |
| `GET` | `/sessions/{id}/state` | Current `SystemState` as JSON |
| `GET` | `/sessions/{id}/history` | All past state snapshots |
| `GET` | `/sessions/{id}/rules` | Rule summary (for debug UI) |

**Step response:**
```json
{
  "time_step": 42,
  "state": { ... },
  "explanations": [
    {
      "rule_id": "low_visibility_speed_limit",
      "priority": 62,
      "triggered": true,
      "message": "Visibility is 0.5 km ...",
      "conditions": [ ... ],
      "actions": [ ... ],
      "educational_summary": {
        "category": "safety",
        "educational_focus": "...",
        "tags": ["fog", "speed_limit"]
      }
    }
  ],
  "rules_triggered": ["low_visibility_speed_limit"]
}
```

---

## Educational Design

TugSim is designed around the principle that **transparency aids learning**. Rather than hiding the simulation's decision logic, the system surfaces it:

- **Explanation Panel** — pops up whenever a rule fires, showing which conditions were met, what action was taken, and why.
- **Rule Log** — a persistent scrollable history of every rule triggered during the run, colour-coded by category (navigation / safety / emergency / educational).
- **First-Person View** — pressing `V` switches to an immersive bridge view with visibility, engine status, and guidance indicators.
- **Live HUD** — real-time speed, heading, zone, and throttle cap display below the canvas.

The rule categories map to real maritime frameworks:

| Category | Colour | Examples |
|----------|--------|---------|
| Navigation | Blue | Speed limits, heading constraints |
| Safety | Yellow | Fog protocols, no-wake zones |
| Emergency | Red | Engine failure, collision risk, anchor deployment |
| Educational | Purple | Low-priority summaries for learner context |

Rules are plain YAML — domain experts can add, remove, or adjust rules without touching any application code.
