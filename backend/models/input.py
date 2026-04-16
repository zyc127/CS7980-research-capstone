from pydantic import BaseModel
from typing import Optional


class UserInput(BaseModel):
    target_speed: Optional[float] = None
    target_heading: Optional[float] = None
    emergency_stop: Optional[bool] = False
    # When all four are set, the frontend is authoritative for tug/cargo positions:
    # backend skips integrating those agents for this tick and recomputes distance metrics.
    tug_position_x: Optional[float] = None
    tug_position_y: Optional[float] = None
    cargo_position_x: Optional[float] = None
    cargo_position_y: Optional[float] = None
