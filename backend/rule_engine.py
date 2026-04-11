"""
rule_engine.py
==============
Core decision engine for the Vancouver Maritime Museum tugboat simulation.

Responsibilities
----------------
1. Load rules from harbor_rules.yaml
2. Each time step: evaluate all rules against current SystemState
3. Execute triggered rules' actions in priority order
4. Handle advanced action types:
     - SET / ADD / CLAMP / RECOMMEND    — state mutation
     - SPAWN_EVENT                       — activate a named event
     - TRIGGER_RULE                      — chain to another rule
     - LOG                               — write to audit trail
5. Detect and resolve conflicts (multiple rules targeting same field)
6. Generate full Explanation objects (causal chain) for educational display
7. Save StateSnapshot to history for replay / rewind
"""

import re
import logging
import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
import math

from models.state import AgentState, EnvironmentState, StateSnapshot, SystemState
from models.rule import Condition, Rule
from models.action import Action
from models.event import Event
from models.explanation import ActionApplication, ConditionEvaluation, Explanation
from models.conflict_resolution import ConflictRecord
from models.enums import ActionType, ConditionLogic, ConflictStrategy, Operator
from models.input import UserInput

logger = logging.getLogger("RuleEngine")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _copy(model, **updates):
    """Pydantic v1 / v2 compatible model copy."""
    try:
        return model.model_copy(update=updates)  # pydantic v2
    except AttributeError:
        return model.copy(update=updates)          # pydantic v1


# ---------------------------------------------------------------------------
# RuleEngine
# ---------------------------------------------------------------------------

class RuleEngine:
    """
    Priority-ordered, event-aware rule engine that drives the simulation and
    produces educational explanations of every decision made.

    Usage
    -----
    engine = RuleEngine("rules/harbor_rules.yaml")
    state, explanations = engine.step(state, user_input)
    """

    def __init__(
        self,
        rules_path: str,
        conflict_strategy: ConflictStrategy = ConflictStrategy.PRIORITY,
    ):
        self.rules_path = rules_path
        self.conflict_strategy = conflict_strategy
        self.rules: List[Rule] = []
        self.rules_by_id: Dict[str, Rule] = {}
        self._load_rules()

    # =========================================================================
    # 1. Rule Loading
    # =========================================================================

    def _load_rules(self) -> None:
        """Parse harbor_rules.yaml and populate self.rules / self.rules_by_id."""
        path = Path(self.rules_path)
        if not path.exists():
            raise FileNotFoundError(f"Rules file not found: {self.rules_path}")

        with open(path, "r") as f:
            data = yaml.safe_load(f)

        raw_rules = data.get("rules", [])
        self.rules = []

        for raw in raw_rules:
            # ---- conditions ----
            conditions: List[Condition] = []
            raw_conditions = raw.get("conditions", raw.get("condition", []))
            for c in raw_conditions:
                # Accept both new format (left/right) and old format (field/value)
                left = c.get("left", c.get("field", ""))
                right = c.get("right", c.get("value", 0))
                operator = c.get("operator", "==")
                conditions.append(
                    Condition(left=str(left), operator=operator, right=right)
                )

            # ---- actions ----
            actions: List[Action] = []
            for a in raw.get("action", []):
                actions.append(
                    Action(
                        type=ActionType(a["type"]),
                        target=a.get("target", ""),
                        value=a.get("value"),
                        min_value=a.get("min_value"),
                        max_value=a.get("max_value"),
                        rule_id=a.get("rule_id"),
                        event_type=a.get("event_type"),
                        event_payload=a.get("event_payload"),
                        log_level=a.get("log_level", "info"),
                        log_message=a.get("log_message"),
                        metadata=a.get("metadata"),
                    )
                )

            logic_raw = raw.get("logic", "AND")
            rule = Rule(
                id=raw["id"],
                priority=raw.get("priority", 0),
                conditions=conditions,
                logic=ConditionLogic(logic_raw),
                action=actions,
                explanation_template=raw.get("explanation_template", ""),
                metadata=raw.get("metadata", {}),
            )
            self.rules.append(rule)
            self.rules_by_id[rule.id] = rule

        # Sort highest priority first so conflicts resolve naturally
        self.rules.sort(key=lambda r: r.priority, reverse=True)
        logger.info("Loaded %d rules from %s", len(self.rules), self.rules_path)

    # =========================================================================
    # 2. Main Step Function
    # =========================================================================

    def step(
        self,
        state: SystemState,
        user_input: Optional[UserInput] = None,
    ) -> Tuple[SystemState, List[Explanation]]:
        """
        Execute one simulation tick.

        Returns
        -------
        (updated_state, explanations)
            updated_state   — SystemState after this tick
            explanations    — one Explanation per triggered rule (educational output)
        """
        # Apply user input before rule evaluation
        if user_input:
            state = self._apply_user_input(state, user_input)

        # Advance simple kinematics so speed/heading affect position.
        # Without this, a connected frontend will appear "stuck" because backend positions never change.
        state = self._advance_simulation(state, dt_seconds=1.0)

        # Evaluate every rule → collect (rule, condition_evals) for triggered ones
        triggered: List[Tuple[Rule, List[ConditionEvaluation]]] = []
        for rule in self.rules:
            fired, evals = self._evaluate_rule(state, rule)
            if fired:
                triggered.append((rule, evals))

        # Detect conflicts among triggered rules
        conflicts = self._detect_conflicts(triggered)

        # Resolve conflicts (modifies order / filters list by strategy)
        if conflicts:
            triggered = self._resolve_conflicts(triggered, conflicts)

        # Execute triggered rules in priority order; collect explanations
        all_explanations: List[Explanation] = []
        chained_rule_ids: Set[str] = set()

        for rule, evals in triggered:
            state, explanation = self._execute_rule(state, rule, evals, triggered_by=None)
            all_explanations.append(explanation)
            for rid in explanation.triggered_rules:
                chained_rule_ids.add(rid)

        # Execute chained rules (one level deep; evaluated against updated state)
        for rule_id in chained_rule_ids:
            if rule_id not in self.rules_by_id:
                logger.warning("TRIGGER_RULE target not found: %s", rule_id)
                continue
            chained = self.rules_by_id[rule_id]
            fired, evals = self._evaluate_rule(state, chained)
            if fired:
                state, explanation = self._execute_rule(
                    state, chained, evals, triggered_by=rule_id
                )
                all_explanations.append(explanation)

        # Update running counters
        n_triggered = len(triggered) + len(
            [e for e in all_explanations if e.triggered_by is not None]
        )
        n_actions = sum(len(e.actions_applied) for e in all_explanations)
        metrics = dict(state.global_metrics)
        metrics["rules_triggered_count"] = metrics.get("rules_triggered_count", 0.0) + n_triggered
        metrics["decision_count"] = metrics.get("decision_count", 0.0) + n_actions
        state = _copy(state, global_metrics=metrics)

        # Advance time step
        state = _copy(state, time_step=state.time_step + 1)

        # Persist snapshot to history
        snapshot = state.create_snapshot(
            rules_triggered=[e.rule_id for e in all_explanations if e.triggered]
        )
        state = _copy(state, history=list(state.history) + [snapshot])

        return state, all_explanations

    def _advance_simulation(self, state: SystemState, dt_seconds: float = 1.0) -> SystemState:
        """
        Minimal motion integration for the museum prototype.

        Coordinate convention (matches the original frontend prototype):
          - heading 90° -> +X (east)
          - heading 0°  -> -Y (north)
        """
        agents = dict(state.agents)

        def advance_agent(a: AgentState) -> AgentState:
            # speed is stored in knots in scenarios; convert to m/s
            v = float(a.speed) * 0.514444
            rad = float(a.heading) * math.pi / 180.0
            dx = v * math.sin(rad) * dt_seconds
            dy = -v * math.cos(rad) * dt_seconds
            return _copy(a, position_x=float(a.position_x) + dx, position_y=float(a.position_y) + dy)

        if "tugboat" in agents:
            agents["tugboat"] = advance_agent(agents["tugboat"])
        if "cargo_ship" in agents:
            agents["cargo_ship"] = advance_agent(agents["cargo_ship"])

        # Update common derived metrics used by rules/UI
        metrics = dict(state.global_metrics)
        try:
            t = agents.get("tugboat")
            c = agents.get("cargo_ship")
            if t and c:
                dist = math.sqrt((t.position_x - c.position_x) ** 2 + (t.position_y - c.position_y) ** 2)
                metrics["tugboat_cargo_distance"] = float(dist)
        except Exception:
            pass

        # Update heading_error if berth_heading present
        try:
            berth = state.environment.berth_heading
            t = agents.get("tugboat")
            if berth is not None and t is not None:
                # smallest signed difference in degrees
                diff = (float(t.heading) - float(berth) + 180.0) % 360.0 - 180.0
                metrics["heading_error"] = float(abs(diff))
        except Exception:
            pass

        return _copy(state, agents=agents, global_metrics=metrics)

    # =========================================================================
    # 3. Rule Evaluation
    # =========================================================================

    def _evaluate_rule(
        self, state: SystemState, rule: Rule
    ) -> Tuple[bool, List[ConditionEvaluation]]:
        """
        Evaluate all conditions of *rule* against *state*.

        Returns (triggered: bool, condition_evaluations: List[ConditionEvaluation])
        """
        evals: List[ConditionEvaluation] = []
        for condition in rule.conditions:
            result, ev = self._evaluate_condition(state, condition)
            evals.append(ev)

        results = [e.result for e in evals]
        if rule.logic == ConditionLogic.AND:
            triggered = all(results)
        else:  # OR
            triggered = any(results)

        return triggered, evals

    def _evaluate_condition(
        self, state: SystemState, condition: Condition
    ) -> Tuple[bool, ConditionEvaluation]:
        """Evaluate a single condition. Returns (result, ConditionEvaluation)."""
        try:
            left_val = self._resolve_value(state, condition.left)
            right_val = self._resolve_value(state, condition.right)
            result = self._compare(left_val, condition.operator, right_val)
            message = (
                f"{condition.left} [{left_val!r}] "
                f"{condition.operator.value} "
                f"{condition.right} [{right_val!r}] "
                f"→ {'✓ true' if result else '✗ false'}"
            )
        except Exception as exc:  # noqa: BLE001
            result = False
            left_val = right_val = None
            message = f"Evaluation error: {exc}"
            logger.warning("Condition eval error: %s", exc)

        return result, ConditionEvaluation(
            condition=condition,
            left_value=left_val,
            right_value=right_val,
            result=result,
            message=message,
        )

    def _compare(self, left: Any, operator: Operator, right: Any) -> bool:
        """Numeric and equality comparison between two resolved values."""
        op = Operator(operator) if isinstance(operator, str) else operator

        # Bool-aware equality (events return bool)
        if op == Operator.EQ:
            if isinstance(left, bool) or isinstance(right, bool):
                return bool(left) == bool(right)
            try:
                return float(left) == float(right)
            except (TypeError, ValueError):
                return str(left) == str(right)

        if op == Operator.IN:
            return left in right

        # Numeric comparisons
        try:
            lf, rf = float(left), float(right)
        except (TypeError, ValueError):
            return False

        return {
            Operator.LT: lf < rf,
            Operator.GT: lf > rf,
            Operator.LE: lf <= rf,
            Operator.GE: lf >= rf,
        }.get(op, False)

    # =========================================================================
    # 4. Action Execution
    # =========================================================================

    def _execute_rule(
        self,
        state: SystemState,
        rule: Rule,
        condition_evals: List[ConditionEvaluation],
        triggered_by: Optional[str],
    ) -> Tuple[SystemState, Explanation]:
        """Execute all actions of *rule* and return updated state + Explanation."""
        apps: List[ActionApplication] = []
        side_effects: List[str] = []
        events_generated: List[str] = []
        triggered_rules: List[str] = []

        for action in rule.action:
            state, app = self._execute_action(state, action, rule.id)
            apps.append(app)

            if action.type == ActionType.TRIGGER_RULE and action.rule_id:
                triggered_rules.append(action.rule_id)
                side_effects.append(f"Triggered rule: {action.rule_id}")
            elif action.type == ActionType.SPAWN_EVENT and action.event_type:
                events_generated.append(action.event_type)
                side_effects.append(f"Spawned event: {action.event_type}")
            elif action.type == ActionType.LOG:
                side_effects.append(
                    f"[{action.log_level.upper()}] {action.log_message}"
                )

        message = self._render_template(state, rule.explanation_template)

        explanation = Explanation(
            rule_id=rule.id,
            priority=rule.priority,
            triggered=True,
            timestamp=state.time_step,
            conditions_evaluated=condition_evals,
            logic_used=rule.logic.value if hasattr(rule.logic, "value") else str(rule.logic),
            actions_applied=apps,
            side_effects=side_effects,
            events_generated=events_generated,
            conflicts_encountered=[],
            message=message,
            cause={
                "conditions_met": [
                    {"field": e.condition.left, "actual_value": e.left_value}
                    for e in condition_evals
                    if e.result
                ],
                "category": rule.metadata.get("category", "navigation"),
                "educational_focus": rule.metadata.get("educational_focus", ""),
                "tags": rule.metadata.get("tags", []),
            },
            effect={
                "changes": [
                    {
                        "type": a.action.type,
                        "target": a.action.target,
                        "from": a.target_old_value,
                        "to": a.target_new_value,
                    }
                    for a in apps
                    if a.success
                ]
            },
            triggered_by=triggered_by,
            triggered_rules=triggered_rules,
        )
        return state, explanation

    def _execute_action(
        self, state: SystemState, action: Action, rule_id: str
    ) -> Tuple[SystemState, ActionApplication]:
        """Execute a single action, mutate state, and return an application record."""
        old_val: Any = None
        new_val: Any = None
        success = True
        message = ""

        try:
            if action.type == ActionType.SET:
                old_val = self._resolve_path(state, action.target)
                resolved = self._resolve_value(state, action.value)
                state = self._set_path(state, action.target, resolved)
                new_val = resolved
                message = f"SET {action.target}: {old_val!r} → {new_val!r}"

            elif action.type == ActionType.ADD:
                old_val = self._resolve_path(state, action.target)
                resolved = self._resolve_value(state, action.value)
                new_val = float(old_val) + float(resolved)
                state = self._set_path(state, action.target, new_val)
                message = f"ADD {resolved!r} to {action.target}: {old_val!r} → {new_val!r}"

            elif action.type == ActionType.CLAMP:
                old_val = self._resolve_path(state, action.target)
                current = float(old_val)
                if action.min_value is not None and current < action.min_value:
                    new_val = action.min_value
                elif action.max_value is not None and current > action.max_value:
                    new_val = action.max_value
                else:
                    new_val = current
                state = self._set_path(state, action.target, new_val)
                message = (
                    f"CLAMP {action.target}: {old_val!r} → {new_val!r} "
                    f"(min={action.min_value}, max={action.max_value})"
                )

            elif action.type == ActionType.RECOMMEND:
                # Does NOT modify state — records a recommendation for educational display
                old_val = self._resolve_path(state, action.target)
                resolved = self._resolve_value(state, action.value)
                new_val = old_val  # unchanged
                message = (
                    f"RECOMMEND {action.target} = {resolved!r} "
                    f"(current: {old_val!r}, not enforced)"
                )

            elif action.type == ActionType.SPAWN_EVENT:
                event_type = action.event_type or ""
                old_val = state.active_events.get(event_type, False)
                updated_events = {**state.active_events, event_type: True}
                state = _copy(state, active_events=updated_events)
                new_val = True
                message = f"SPAWN_EVENT: {event_type} activated"
                logger.info("[%s] Event spawned: %s", rule_id, event_type)

            elif action.type == ActionType.TRIGGER_RULE:
                old_val = None
                new_val = action.rule_id
                message = f"TRIGGER_RULE: scheduling {action.rule_id!r}"

            elif action.type == ActionType.LOG:
                old_val = None
                new_val = action.log_message
                level = (action.log_level or "info").lower()
                log_fn = getattr(logger, level, logger.info)
                log_fn("[%s] %s", rule_id, action.log_message)
                message = f"LOG [{level.upper()}]: {action.log_message}"

        except Exception as exc:  # noqa: BLE001
            success = False
            message = f"Action failed: {exc}"
            logger.error("Action execution error in rule %s: %s", rule_id, exc)

        return state, ActionApplication(
            action=action,
            target_old_value=old_val,
            target_new_value=new_val,
            success=success,
            message=message,
        )

    # =========================================================================
    # 5. Conflict Detection & Resolution
    # =========================================================================

    def _detect_conflicts(
        self, triggered: List[Tuple[Rule, List[ConditionEvaluation]]]
    ) -> List[ConflictRecord]:
        """
        Detect cases where multiple triggered rules write to the same field.
        Returns a ConflictRecord for each conflicting target field.
        """
        target_map: Dict[str, List[Rule]] = {}
        for rule, _ in triggered:
            for action in rule.action:
                if action.type in (ActionType.SET, ActionType.ADD, ActionType.CLAMP):
                    target_map.setdefault(action.target, []).append(rule)

        records: List[ConflictRecord] = []
        for target, rules in target_map.items():
            if len(rules) > 1:
                all_actions = [
                    a for r in rules for a in r.action if a.target == target
                ]
                logger.warning(
                    "Conflict on '%s': rules %s", target, [r.id for r in rules]
                )
                records.append(
                    ConflictRecord(
                        timestamp=0,
                        conflicting_rules=[r.id for r in rules],
                        conflicting_actions=all_actions,
                        resolution_strategy=ConflictStrategy(self.conflict_strategy),
                        resolution_result={"winner": rules[0].id},
                        resolved=True,
                    )
                )
        return records

    def _resolve_conflicts(
        self,
        triggered: List[Tuple[Rule, List[ConditionEvaluation]]],
        conflicts: List[ConflictRecord],
    ) -> List[Tuple[Rule, List[ConditionEvaluation]]]:
        """
        Apply conflict resolution strategy.
        PRIORITY (default): list is already sorted by descending priority,
        so earlier rules overwrite later ones — highest priority wins.
        """
        if self.conflict_strategy == ConflictStrategy.LAST_WRITE_WINS:
            return list(reversed(triggered))
        # PRIORITY and MERGE: keep sorted order (highest priority first)
        return triggered

    # =========================================================================
    # 6. Path Resolution & State Mutation
    # =========================================================================

    def _resolve_path(self, state: SystemState, path: str) -> Any:
        """
        Resolve a dot-notation field path to a value in *state*.

        Supported prefixes
        ------------------
        agents.{id}.{field}         → AgentState field
        environment.{field}         → EnvironmentState field
        global_metrics.{name}       → float metric
        events.{event_type}         → bool (True if event is active)
        """
        if not isinstance(path, str):
            return path

        parts = path.split(".")

        if parts[0] == "agents":
            if len(parts) < 3:
                raise ValueError(f"Invalid agent path: {path!r}")
            agent_id, field = parts[1], parts[2]
            if agent_id not in state.agents:
                raise KeyError(f"Agent not found: {agent_id!r}")
            return getattr(state.agents[agent_id], field)

        if parts[0] == "environment":
            if len(parts) < 2:
                raise ValueError(f"Invalid environment path: {path!r}")
            return getattr(state.environment, parts[1])

        if parts[0] == "global_metrics":
            if len(parts) < 2:
                raise ValueError(f"Invalid global_metrics path: {path!r}")
            return state.global_metrics.get(parts[1], 0.0)

        if parts[0] == "events":
            if len(parts) < 2:
                raise ValueError(f"Invalid events path: {path!r}")
            return state.active_events.get(parts[1], False)

        raise ValueError(f"Unknown path prefix in: {path!r}")

    def _set_path(self, state: SystemState, path: str, value: Any) -> SystemState:
        """Write *value* at dot-notation *path* and return an updated SystemState."""
        parts = path.split(".")

        if parts[0] == "agents":
            agent_id, field = parts[1], parts[2]
            if agent_id not in state.agents:
                raise KeyError(f"Agent not found: {agent_id!r}")
            updated_agent = _copy(state.agents[agent_id], **{field: value})
            updated_agents = {**state.agents, agent_id: updated_agent}
            return _copy(state, agents=updated_agents)

        if parts[0] == "environment":
            field = parts[1]
            updated_env = _copy(state.environment, **{field: value})
            return _copy(state, environment=updated_env)

        if parts[0] == "global_metrics":
            metric = parts[1]
            updated = {**state.global_metrics, metric: float(value)}
            return _copy(state, global_metrics=updated)

        raise ValueError(f"Cannot set path: {path!r}")

    def _resolve_value(self, state: SystemState, value: Any) -> Any:
        """
        Resolve an action value that may be:
        - A plain scalar    (float, int, str, bool)
        - A field path      ("agents.tugboat.speed")
        - A template expr   ("{{agents.cargo_ship.speed + 2.0}}")
        """
        if value is None:
            return None

        if isinstance(value, str):
            # Template expression: {{ expr }}
            m = re.fullmatch(r"\{\{(.+)\}\}", value.strip())
            if m:
                return self._eval_expr(state, m.group(1).strip())

            # Field path
            prefix = value.split(".")[0] if "." in value else ""
            if prefix in ("agents", "environment", "global_metrics", "events"):
                try:
                    return self._resolve_path(state, value)
                except (KeyError, ValueError, AttributeError):
                    pass  # fall through: treat as literal string

        return value

    def _eval_expr(self, state: SystemState, expr: str) -> Any:
        """
        Safely evaluate a template arithmetic expression such as
        "agents.cargo_ship.speed + 2.0" or "environment.wind_direction + 90".

        Only numeric addition/subtraction/multiplication/division are allowed.
        """
        # Replace field paths with their numeric values
        path_re = re.compile(
            r"\b("
            r"agents\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*"
            r"|environment\.[a-zA-Z_]\w*"
            r"|global_metrics\.[a-zA-Z_]\w*"
            r"|events\.[a-zA-Z_]\w*"
            r")\b"
        )

        def _sub(match: re.Match) -> str:  # type: ignore[type-arg]
            try:
                v = self._resolve_path(state, match.group(0))
                return str(float(v))
            except Exception:  # noqa: BLE001
                return "0.0"

        resolved = path_re.sub(_sub, expr)

        # Restricted eval: only numeric literals and operators
        try:
            result = eval(resolved, {"__builtins__": {}}, {})  # noqa: S307
            return float(result)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Template expression eval failed %r: %s", expr, exc)
            return 0.0

    def _render_template(self, state: SystemState, template: str) -> str:
        """
        Render an explanation_template string by substituting {{field.path}}
        and {{arithmetic expressions}} with actual values from *state*.
        """
        if not template:
            return ""

        def _replace(match: re.Match) -> str:  # type: ignore[type-arg]
            expr = match.group(1).strip()
            try:
                val = self._eval_expr(state, expr)
                # Pretty-print: drop ".0" for whole numbers
                if isinstance(val, float) and val == int(val):
                    return str(int(val))
                return f"{val:.2f}" if isinstance(val, float) else str(val)
            except Exception:  # noqa: BLE001
                return match.group(0)

        return re.sub(r"\{\{(.+?)\}\}", _replace, template)

    # =========================================================================
    # 7. User Input Application
    # =========================================================================

    def _apply_user_input(
        self, state: SystemState, user_input: UserInput
    ) -> SystemState:
        """
        Apply visitor / operator input to state before rule evaluation.
        Rules then constrain or override these values as appropriate.
        """
        if user_input.target_speed is not None and "tugboat" in state.agents:
            state = self._set_path(
                state, "agents.tugboat.speed", user_input.target_speed
            )

        if user_input.target_heading is not None and "tugboat" in state.agents:
            state = self._set_path(
                state, "agents.tugboat.heading", user_input.target_heading
            )

        if user_input.emergency_stop:
            for agent_id in state.agents:
                state = self._set_path(state, f"agents.{agent_id}.speed", 0.0)

        return state

    # =========================================================================
    # 8. Public Utilities
    # =========================================================================

    def get_rules_summary(self) -> List[Dict[str, Any]]:
        """Return a lightweight summary of all loaded rules (for debugging / UI)."""
        return [
            {
                "id": r.id,
                "priority": r.priority,
                "logic": r.logic,
                "n_conditions": len(r.conditions),
                "n_actions": len(r.action),
                "category": r.metadata.get("category", ""),
                "tags": r.metadata.get("tags", []),
            }
            for r in self.rules
        ]
