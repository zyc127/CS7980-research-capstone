"""
api.py
======
FastAPI server — the bridge between Unity and the rule engine.

Endpoints
---------
POST  /sessions                  Create a new simulation session
DELETE /sessions/{id}            End a session

POST  /sessions/{id}/start       (Re-)initialise a session with a scenario
POST  /sessions/{id}/step        Advance one tick (accepts UserInput)
POST  /sessions/{id}/reset       Reset to initial state
GET   /sessions/{id}/state       Current SystemState as JSON
GET   /sessions/{id}/history     All past StateSnapshots
GET   /sessions/{id}/rules       Summary of loaded rules (debug / UI)

GET   /health                    Liveness probe

Run with:
    cd backend
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload
"""

import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Path, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.input import UserInput
from models.state import SystemState, StateSnapshot
from session import SessionManager, SCENARIO_FACTORIES

# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("API")

app = FastAPI(
    title="Vancouver Maritime Museum — Simulation API",
    description=(
        "Rule-driven tugboat simulation backend. "
        "Exposes SystemState and educational Explanations over HTTP/JSON "
        "for consumption by a Unity frontend."
    ),
    version="1.0.0",
)

# Allow Unity (localhost) and any development origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = SessionManager()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    scenario: str = "default"
    """
    Available scenarios
    -------------------
    default   — open-water start, all rules active
    fog       — harbour entry in low visibility
    docking   — approaching berth with heading error
    emergency — engine failure, full rule-chain demo
    """


class CreateSessionResponse(BaseModel):
    session_id: str
    scenario: str
    state: Dict[str, Any]


class StepRequest(BaseModel):
    target_speed: Optional[float] = None
    target_heading: Optional[float] = None
    emergency_stop: Optional[bool] = False
    """
    All fields are optional.
    Omitting a field means "no change" for that control.
    """


class ConditionEvaluationOut(BaseModel):
    field: str
    operator: str
    threshold: Any
    actual_value: Any
    result: bool
    message: str


class ExplanationOut(BaseModel):
    rule_id: str
    priority: int
    triggered: bool
    timestamp: int
    logic_used: str
    message: str
    conditions: List[ConditionEvaluationOut]
    actions: List[Dict[str, Any]]
    side_effects: List[str]
    events_generated: List[str]
    triggered_by: Optional[str]
    triggered_rules: List[str]
    educational_summary: Dict[str, Any]


class StepResponse(BaseModel):
    time_step: int
    state: Dict[str, Any]
    explanations: List[ExplanationOut]
    rules_triggered: List[str]


class HistoryResponse(BaseModel):
    session_id: str
    total_steps: int
    snapshots: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean(text: Any) -> Any:
    """Strip literal newlines / control characters from strings so JSON stays valid."""
    if isinstance(text, str):
        # Collapse any whitespace sequence (including \n, \r, \t) to a single space
        return re.sub(r"\s+", " ", text).strip()
    return text


def _explanation_to_out(exp) -> ExplanationOut:
    conditions_out = [
        ConditionEvaluationOut(
            field=ce.condition.left,
            operator=ce.condition.operator.value
            if hasattr(ce.condition.operator, "value")
            else str(ce.condition.operator),
            threshold=ce.condition.right,
            actual_value=ce.left_value,
            result=ce.result,
            message=ce.message,
        )
        for ce in exp.conditions_evaluated
    ]

    actions_out = [
        {
            "type": aa.action.type.value
            if hasattr(aa.action.type, "value")
            else str(aa.action.type),
            "target": aa.action.target,
            "old_value": aa.target_old_value,
            "new_value": aa.target_new_value,
            "success": aa.success,
            "message": aa.message,
        }
        for aa in exp.actions_applied
    ]

    edu = exp.to_educational_format()
    # Recursively sanitize the educational summary for JSON safety
    edu["message"] = _clean(edu.get("message", ""))
    # Propagate rule metadata fields for frontend educational display
    edu["category"] = exp.cause.get("category", "navigation")
    edu["educational_focus"] = exp.cause.get("educational_focus", "")
    edu["tags"] = exp.cause.get("tags", [])

    return ExplanationOut(
        rule_id=exp.rule_id,
        priority=exp.priority,
        triggered=exp.triggered,
        timestamp=exp.timestamp,
        logic_used=exp.logic_used,
        message=_clean(exp.message),
        conditions=conditions_out,
        actions=actions_out,
        side_effects=exp.side_effects,
        events_generated=exp.events_generated,
        triggered_by=exp.triggered_by,
        triggered_rules=exp.triggered_rules,
        educational_summary=edu,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
def health():
    """Quick liveness check for Unity to verify the server is reachable."""
    return {"status": "ok", "active_sessions": sessions.active_count}


@app.get("/scenarios", tags=["meta"])
def list_scenarios():
    """List available scenario names and their descriptions."""
    return {
        "scenarios": {
            "default":   "Open-water start — all rules active",
            "fog":       "Harbour entry in low visibility (fog rules demo)",
            "docking":   "Approaching berth with heading error (docking rules demo)",
            "emergency": "Engine failure — full rule-chain demo",
        }
    }


# ------------------------------------------------------------------
# Session lifecycle
# ------------------------------------------------------------------

@app.post("/sessions", response_model=CreateSessionResponse, tags=["session"])
def create_session(body: CreateSessionRequest = Body(default=CreateSessionRequest())):
    """
    Create a new isolated simulation session.
    Returns a session_id that must be passed to all subsequent calls.
    """
    try:
        session = sessions.create(scenario=body.scenario)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CreateSessionResponse(
        session_id=session.session_id,
        scenario=session.scenario,
        state=session.state.model_dump(),
    )


@app.delete("/sessions/{session_id}", tags=["session"])
def end_session(session_id: str = Path(...)):
    """Destroy a session and free its memory."""
    sessions.delete(session_id)
    return {"deleted": session_id}


# ------------------------------------------------------------------
# Simulation control
# ------------------------------------------------------------------

@app.post("/sessions/{session_id}/start", tags=["simulation"])
def start_session(
    session_id: str = Path(...),
    body: CreateSessionRequest = Body(default=CreateSessionRequest()),
):
    """
    (Re-)initialise the session with a chosen scenario.
    Useful when the visitor wants to try a different demo mode.
    """
    try:
        session = sessions.require(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")

    try:
        from scenarios.vancouver_harbor import (
            create_initial_state,
            create_fog_scenario,
            create_docking_scenario,
            create_emergency_scenario,
        )
        factory = SCENARIO_FACTORIES.get(body.scenario)
        if factory is None:
            raise HTTPException(status_code=400, detail=f"Unknown scenario: {body.scenario!r}")
        session.state = factory()
        session.scenario = body.scenario
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"session_id": session_id, "scenario": session.scenario, "state": session.state.model_dump()}


@app.post(
    "/sessions/{session_id}/step",
    response_model=StepResponse,
    tags=["simulation"],
)
def step(
    session_id: str = Path(...),
    body: StepRequest = Body(default=StepRequest()),
):
    """
    Advance the simulation by one tick.

    Pass visitor input (speed slider, heading dial, emergency button).
    The rule engine evaluates all rules, executes actions, and returns:
      - updated state     (for Unity to render)
      - explanations      (for the educational display panel)
    """
    try:
        session = sessions.require(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")

    user_input = UserInput(
        target_speed=body.target_speed,
        target_heading=body.target_heading,
        emergency_stop=body.emergency_stop or False,
    )

    try:
        session.state, explanations = session.engine.step(session.state, user_input)
    except Exception as exc:
        logger.exception("Error during step in session %s", session_id)
        raise HTTPException(status_code=500, detail=str(exc))

    return StepResponse(
        time_step=session.state.time_step,
        state=session.state.model_dump(),
        explanations=[_explanation_to_out(e) for e in explanations],
        rules_triggered=[e.rule_id for e in explanations if e.triggered],
    )


@app.post("/sessions/{session_id}/reset", tags=["simulation"])
def reset_session(session_id: str = Path(...)):
    """Reset the session back to its initial state (same scenario)."""
    try:
        session = sessions.reset(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")

    return {"session_id": session_id, "time_step": session.state.time_step, "state": session.state.model_dump()}


# ------------------------------------------------------------------
# State / History inspection
# ------------------------------------------------------------------

@app.get("/sessions/{session_id}/state", tags=["inspection"])
def get_state(session_id: str = Path(...)):
    """Return the current SystemState as JSON."""
    try:
        session = sessions.require(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")

    return session.state.model_dump()


@app.get(
    "/sessions/{session_id}/history",
    response_model=HistoryResponse,
    tags=["inspection"],
)
def get_history(session_id: str = Path(...)):
    """
    Return all past StateSnapshots for this session.
    Unity can use this for the educational rewind feature.
    """
    try:
        session = sessions.require(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")

    return HistoryResponse(
        session_id=session_id,
        total_steps=session.state.time_step,
        snapshots=[s.model_dump() for s in session.state.history],
    )


@app.get("/sessions/{session_id}/rules", tags=["inspection"])
def get_rules(session_id: str = Path(...)):
    """
    Return a summary of all loaded rules.
    Useful for Unity to build a dynamic rules-list panel.
    """
    try:
        session = sessions.require(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")

    return {
        "session_id": session_id,
        "rules": session.engine.get_rules_summary(),
    }
