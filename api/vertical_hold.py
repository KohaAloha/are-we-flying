from utils import constrain, constrain_map
from math import copysign, radians, degrees
from constants import ALTITUDE_HOLD, MSFS_RADIAN, ACROBATIC


def vertical_hold(auto_pilot, state):
    if auto_pilot.modes[ACROBATIC]:
        return fly_acrobatic(auto_pilot, state)

    # anchor adjustments: positive numbers raise the nose, negative numbers drop it down.
    anchor = auto_pilot.anchor

    # How much should we trim by?
    trim_limit = state.pitch_trim_limit[0]
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


def fly_acrobatic(auto_pilot, state):
    """
    Acrobatic flight is much snappier, but only really works if you're going fast enough.
    """
    factor = -1 if auto_pilot.inverted else 1

    alt = state.altitude
    alt_target = auto_pilot.modes[ALTITUDE_HOLD]
    alt_diff = (alt_target - alt) if alt_target else 0

    speed = state.speed
    lower_limit = 5 * speed
    upper_limit = 10 * speed
    vspeed = state.vertical_speed
    vs_max = upper_limit if factor * alt_diff >= 0 else lower_limit

    # if we're running altitude hold, set a vertical speed target that'll get us there.
    vs_target = 0 if alt_diff == 0 else constrain_map(
        alt_diff, -500, 500, -vs_max, vs_max)
    vs_diff = vs_target - vspeed

    dvs = state.dVS
    dvs_max = speed / 2
    correct = 0

    # Base our step size on how fast this plane is going.
    step = factor * constrain_map(speed, 50, 200,
                                  MSFS_RADIAN/200, MSFS_RADIAN/120)

    vstep = constrain_map(vs_diff, -vs_max, vs_max, -step, step)
    vstep = vstep if abs(vstep) > 0.00001 else copysign(0.00001, vstep)
    correct += vstep

    dvstep = constrain_map(dvs, -dvs_max, dvs_max, step / 2, -step / 2)
    dvstep = dvstep if abs(dvstep) > 0.000005 else copysign(0.000005, dvstep)
    correct += dvstep

    if (vs_diff < 0 and dvs > dvs_max) or (vs_diff > 0 and dvs < -dvs_max):
        correct += constrain_map(dvs, -dvs_max, dvs_max, step, -step)

    if (vs_target < -5 and vspeed > 0 and vspeed < 100):
        correct += constrain_map(vspeed, -100, 100, step/10, -step/10)

    if (vs_target > 5 and vspeed < 0 and vspeed > -100):
        correct += constrain_map(vspeed, -100, 100, step/10, -step/10)

    print(vs_target, vs_diff, vspeed, dvs, vs_max, dvs_max, vstep, dvstep)

    # "omg wtf?" protection
    protection_steps = [2, 4, 6]
    for i in protection_steps:
        if (vspeed > i * vs_max and dvs > 0) or (vspeed < -i * vs_max and dvs < 0):
            print(f'wtf, {vspeed} exceeds {vs_max} by {i}x')
            correct += constrain_map(vspeed, -1, 1, step / 4, -step / 4)

    trim = state.pitch_trim
    auto_pilot.api.set('ELEVATOR_TRIM_POSITION', trim + correct)
