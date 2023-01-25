from utils import constrain, constrain_map
from math import copysign, radians, degrees
from constants import ALTITUDE_HOLD


def vertical_hold(auto_pilot, state):
    # anchor adjustments: positive numbers raise the nose, negative numbers drop it down.
    anchor = auto_pilot.anchor

    # How much should we trim by?
    trim_limit = state.pitch_trim_limit
    trim_limit = 10 if trim_limit == 0 else trim_limit
    trim_step = constrain_map(trim_limit, 5, 20, radians(0.001), radians(0.01))
    kick = 10 * trim_step

    VS = state.vertical_speed
    max_VS = 1000

    dVS = state.dVS
    max_dVS = 20

    target_VS = 0

    # Are we supposed to fly a specific altitude?
    target_altitude = auto_pilot.modes[ALTITUDE_HOLD]
    if target_altitude:
        alt_diff = target_altitude - state.altitude
        target_VS = constrain_map(alt_diff, -200, 200, -max_VS, max_VS)

    # If we're too low, diff will be positive.
    # If we're too high, diff will be negative.
    diff = target_VS - VS

    # Once we know our diff, update our maximum allowable acceleration
    max_dVS = 1 + constrain_map(abs(diff), 0, 100, 0, max_dVS - 1)

    # print(f'> VS: {VS}, target: {target_VS}, diff: {diff}, dVS: {dVS}, max_dVS: {max_dVS}')

    # Are we accelerating too much? we need to pitch in the opposite direction:
    if dVS < -max_dVS or dVS > max_dVS:
        anchor.y += constrain_map(dVS, -10 * max_dVS,
                                  10 * max_dVS, kick, -kick)

    # Also, if we're past safe vertical speeds, bring us back to safe speeds
    if (VS < -max_VS and dVS <= 0) or (VS > max_VS and dVS >= 0):
        anchor.y += constrain_map(VS, -max_VS, max_VS, trim_step, -trim_step)

    # And then regardless of those two protection measures: nudge us towards the correct vertical speed
    anchor.y += constrain_map(diff, -1000, 1000, -kick, kick)

    auto_pilot.set('ELEVATOR_TRIM_POSITION', anchor.y)
