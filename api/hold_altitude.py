from utils import constrain, constrain_map
from constants import ALTITUDE_HOLD


def hold_altitude(auto_pilot, state):
    anchor = auto_pilot.anchor

    VS = state.vertical_speed
    max_VS = 1000
    dVS = state.dVS
    trim = state.pitch_trim - anchor.y
    target_VS = 0
    alt_diff = 0

    # Are we supposed to fly a specific altitude?
    if auto_pilot.modes[ALTITUDE_HOLD]:
        altitude = state.altitude
        target = auto_pilot.modes[ALTITUDE_HOLD]
        target_VS = constrain(target - altitude, -max_VS, max_VS)
        alt_diff = target - altitude

    diff = target_VS - VS

    # Are we getting progressively off kilter?
    if (VS < target_VS and dVS < 0) or (VS > target_VS and dVS > 0):
        correction = 0.005 if abs(diff) > 200 else 0.003 if abs(
            diff) > 100 else 0.0018
        anchor.y += constrain_map(diff, -max_VS,
                                  max_VS, -correction, correction)

    # Are we correcting for being off kilter, but too aggressively?
    elif (VS > target_VS and dVS < -10) or (VS < target_VS and dVS > 10):
        anchor.y -= constrain_map(diff, -max_VS, max_VS, -0.0015, 0.0015)

    # Do we just need to bump in the right direction?
    elif VS > -max_VS and VS < max_VS:
        anchor.y += constrain_map(alt_diff, -max_VS, max_VS, -0.005, 0.005)

    auto_pilot.api.set_property_value(
        'ELEVATOR_TRIM_POSITION', trim + anchor.y)
