"""
scenarios/vancouver_harbor.py
==============================
Initial SystemState for the Vancouver Maritime Museum tugboat exhibit.

Two agents
----------
- tugboat       : the exhibit vessel; visitors control its speed / heading
- cargo_ship    : large vessel being escorted through the harbour channel

Scenario phases (driven by environment.zone transitions)
---------------------------------------------------------
open_water  →  escort_corridor  →  harbour_entry  →  no_wake_zone  →  docking_zone

Global metrics tracked
----------------------
tugboat_cargo_distance  : metres between the two vessels
collision_risk          : 0.0 = safe, 1.0 = active collision risk
anchor_deployed         : 0.0 = stowed, 1.0 = deployed
engine_status           : 1.0 = operational, 0.0 = failed
guidance_requested      : 0.0 = not requested, 1.0 = requested
heading_error           : degrees off from berth alignment
distance_to_berth       : metres to target berth
rules_triggered_count   : cumulative rules fired this session
decision_count          : cumulative automated decisions this session
"""

from models.state import AgentState, EnvironmentState, SystemState


def create_initial_state() -> SystemState:
    """
    Return the starting SystemState for the Vancouver harbour scenario.

    Call this once at simulation startup; then pass the state into
    RuleEngine.step() each tick.
    """
    tugboat = AgentState(
        id="tugboat",
        type="tugboat",
        position_x=0.0,
        position_y=0.0,
        speed=8.0,        # 8 knots — comfortable open-water cruise
        heading=90.0,     # heading due east toward the harbour
        metadata={"name": "MV Pacific Highlander", "flag": "CA"},
    )

    cargo_ship = AgentState(
        id="cargo_ship",
        type="cargo_ship",
        position_x=50.0,  # 50 m ahead of tugboat along the escort corridor
        position_y=0.0,
        speed=6.0,        # 6 knots — slower, heavier vessel
        heading=90.0,
        metadata={"name": "MV Fraser Spirit", "flag": "CA", "tonnage": 12000},
    )

    environment = EnvironmentState(
        wind_speed=10.0,       # 10 knots — light breeze, manageable
        wind_direction=45.0,   # NE wind
        visibility=1.5,        # 1.5 km — good visibility
        zone="open_water",     # starting zone
        berth_heading=0.0,     # berth faces north (will matter in docking_zone)
    )

    # All numeric metrics used by harbor_rules.yaml
    global_metrics = {
        "tugboat_cargo_distance": 50.0,  # metres apart at start
        "collision_risk": 0.0,           # 1.0 = engine-failure collision risk (triggers anchor)
        "escort_separation_active": 0.0, # 1.0 = escort too close, separation protocol active
        "anchor_deployed": 0.0,
        "engine_status": 1.0,            # engine is operational
        "guidance_requested": 0.0,
        "heading_error": 0.0,            # perfectly aligned at start
        "distance_to_berth": 500.0,      # 500 m to the berth
        "rules_triggered_count": 0.0,
        "decision_count": 0.0,
    }

    return SystemState(
        agents={
            "tugboat": tugboat,
            "cargo_ship": cargo_ship,
        },
        environment=environment,
        global_metrics=global_metrics,
        active_events={},
        time_step=0,
        history=[],
    )


# ---------------------------------------------------------------------------
# Pre-built scenario variants (for museum exhibit mode selection)
# ---------------------------------------------------------------------------

def create_fog_scenario() -> SystemState:
    """
    Fog scenario: low visibility forces speed reduction and guidance request.
    Demonstrates rules: low_visibility_speed_reduction, fog_event_response,
                        request_harbour_guidance.
    """
    state = create_initial_state()
    # Drop visibility to trigger fog rules
    from models.state import EnvironmentState
    updated_env = state.environment.model_copy(
        update={"visibility": 0.2, "zone": "harbour_entry"}
    )
    return state.model_copy(update={"environment": updated_env})


def create_docking_scenario() -> SystemState:
    """
    Docking scenario: tugboat approaching berth at wrong heading.
    Demonstrates rules: docking_approach_speed, docking_heading_alignment,
                        docking_final_stop.
    """
    state = create_initial_state()
    updated_env = state.environment.model_copy(
        update={"zone": "docking_zone", "berth_heading": 0.0}
    )
    updated_metrics = {
        **state.global_metrics,
        "heading_error": 25.0,      # 25° 偏差 — 将触发对准规则
        "distance_to_berth": 200.0, # 200 m — 给玩家足够的接近空间
    }
    # 初始速度适中，让玩家体验 docking_approach_speed 规则（最大 2 节限制）
    updated_tugboat = state.agents["tugboat"].model_copy(
        update={"speed": 3.0, "heading": 65.0}
    )
    # 靠泊模式不需要货轮移动：将其停在港口外等候
    updated_cargo = state.agents["cargo_ship"].model_copy(
        update={"speed": 0.0, "position_x": 8500.0, "position_y": 0.0}
    )
    return state.model_copy(
        update={
            "environment": updated_env,
            "global_metrics": updated_metrics,
            "agents": {**state.agents, "tugboat": updated_tugboat, "cargo_ship": updated_cargo},
        }
    )


def create_emergency_scenario() -> SystemState:
    """
    Engine failure scenario: demonstrates multi-step rule chaining.
    engine_failure_detection → emergency_anchor (via trigger_rule + event).
    """
    state = create_initial_state()
    updated_metrics = {
        **state.global_metrics,
        "engine_status": 0.0,  # engine is down
    }
    updated_tugboat = state.agents["tugboat"].model_copy(update={"speed": 10.0})
    return state.model_copy(
        update={
            "global_metrics": updated_metrics,
            "agents": {**state.agents, "tugboat": updated_tugboat},
        }
    )
