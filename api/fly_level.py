from math import degrees, radians, copysign, pi
from utils import constrain, constrain_map, get_compass_diff
from constants import HEADING_MODE

# TODO: we need to speed up more, and slow down faster for the 310R, this heading mode is pretty slow...


def fly_level(auto_pilot, state):
    anchor = auto_pilot.anchor

    bank = degrees(state.bank_angle)
    max_bank = constrain_map(state.speed, 50, 200, 10, 30)

    dBank = state.dBank
    max_dBank = radians(1)

    step = constrain_map(state.speed, 50, 150, radians(1), radians(2))
    target_bank = 0

    turn_rate = degrees(state.turn_rate)
    max_turn_rate = 3

    # Are we supposed to fly a specific compass heading?
    flight_heading = auto_pilot.modes[HEADING_MODE]
    if flight_heading:
        h_diff = get_compass_diff(degrees(state.heading), flight_heading)
        target_bank = -constrain_map(h_diff, -30, 30, -max_bank, max_bank)
        max_turn_rate = constrain_map(abs(h_diff), 0, 10, 0.02, max_turn_rate)

    # Now then: we want a diff==0 and dBank==0, so let's minimize both!

    # First off, what is our banking difference?
    diff = target_bank - bank

    # correct for non-zero diff first:
    anchor.x += -constrain_map(diff, -max_bank, max_bank, -step, step)

    # then correct for non-zero dBank
    anchor.x += constrain_map(dBank, -max_dBank,
                              max_dBank, -0.5 * step, 0.5 * step)

    # and then if we're turning, make sure we're not actually turning too fast
    if turn_rate < -max_turn_rate or turn_rate > max_turn_rate:
        overshoot = turn_rate - max_turn_rate if turn_rate > 0 else turn_rate + max_turn_rate
        nudge = constrain_map(overshoot, -max_turn_rate, max_turn_rate, -step/5, step/5)
        anchor.x -= nudge

    auto_pilot.api.set_property_value('AILERON_TRIM_PCT', anchor.x)
