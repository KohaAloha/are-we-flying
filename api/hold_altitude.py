from utils import constrain, constrain_map
from math import copysign, radians, degrees
from constants import ALTITUDE_HOLD


# TODO: this code doesn't quite do what the code comments suggests it does, it actually holds VS quite poorly

def hold_altitude(auto_pilot, state):
    anchor = auto_pilot.anchor

    # anchor adjustments: positive numbers raise the nose, negative numbers drop it down.

    VS = state.vertical_speed
    max_VS = 1000
    dVS = state.dVS
    max_dVS = 20
    trim = state.pitch_trim - anchor.y
    trim_step = radians(0.01)
    target_VS = 0
    alt_diff = 0

    # Are we supposed to fly a specific altitude?
    if auto_pilot.modes[ALTITUDE_HOLD]:
        altitude = state.altitude
        target = auto_pilot.modes[ALTITUDE_HOLD]
        target_VS = constrain(target - altitude, -max_VS, max_VS)
        alt_diff = target - altitude
        if abs(alt_diff) > 200:
            target_VS = constrain_map(alt_diff, -1000, 1000, -max_VS, max_VS)
        else:
            target_VS = constrain_map(alt_diff, -200, 200, -max_VS, max_VS)

    # If we're too low, diff will be positive.
    # If we're too high, diff will be negative.
    diff = target_VS - VS
    max_dVS = 1 + constrain_map(abs(diff), 0, 100, 0, max_dVS - 1)

    print(
        f'> VS: {VS}, target: {target_VS}, diff: {diff}, dVS: {dVS}, max_dVS: {max_dVS}')

    # Are we accelerating too much? we need to pitch in the opposite direction:
    if dVS < -max_dVS or dVS > max_dVS:
        anchor.y += constrain_map(dVS, -10 * max_dVS,
                                  10 * max_dVS, 10 * trim_step, -10 * trim_step)

    # Also, if we're past safe vertical speeds, bring us back to safe speeds
    if (VS < -max_VS and dVS <= 0) or (VS > max_VS and dVS >= 0):
        anchor.y += constrain_map(VS, -max_VS, max_VS, trim_step, -trim_step)

    # And then regardless of those two protection measures: nudge us towards the correct vertical speed
    anchor.y += constrain_map(diff, -1000, 1000, -10 * trim_step, 10 * trim_step)

    auto_pilot.api.set_property_value(
        'ELEVATOR_TRIM_POSITION', trim + anchor.y)


"""

    # Are we getting progressively off kilter?
    if (VS < target_VS and dVS < 0) or (VS > target_VS and dVS > 0):
        anchor.y += constrain_map(diff, -max_VS, max_VS, -0.005, 0.005)

    # Are we correcting for being off kilter, but too aggressively?
    elif (VS > target_VS and dVS < -10) or (VS < target_VS and dVS > 10):
        anchor.y -= constrain_map(diff, -max_VS, max_VS, -0.0015, 0.0015)

    # Do we just need to bump in the right direction?
    elif VS > -max_VS and VS < max_VS:
        anchor.y += constrain_map(alt_diff, -max_VS, max_VS, -0.005, 0.005)

"""
