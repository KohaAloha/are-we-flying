from math import degrees, radians, copysign, pi, sqrt
from utils import constrain, constrain_map, get_compass_diff
from constants import HEADING_MODE, ACROBATIC

# TODO: we need to speed up more, and slow down faster for the 310R, this heading mode is pretty slow...


def fly_level(auto_pilot, state):
    if auto_pilot.modes[ACROBATIC]:
        return fly_acrobatic(auto_pilot, state)

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
        target_bank = constrain_map(h_diff, -30, 30, max_bank, -max_bank)
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
        nudge = constrain_map(overshoot, -max_turn_rate,
                              max_turn_rate, -step/5, step/5)
        anchor.x -= nudge

    auto_pilot.api.set('AILERON_TRIM_PCT', anchor.x)


def fly_acrobatic(auto_pilot, state):
    """
    Acrobatic flight is much snappier, but only really works if you're going fast enough.
    """

    factor = -1 if auto_pilot.inverted else 1
    center = 0 if factor == 1 else pi
    bank = state.bank_angle
    bank = degrees(center + bank) if bank < 0 else degrees(bank - center)

    anchor = auto_pilot.anchor
    anchor.x += constrain_map(bank, -5, 5, -2, 2)

    if auto_pilot.modes[HEADING_MODE]:
        heading = degrees(state.heading)
        target = auto_pilot.modes[HEADING_MODE]
        hdiff = get_compass_diff(heading, target)
        turn_rate = state.turn_rate
        turn_limit = constrain_map(abs(hdiff), 0, 10, 0.01, 0.03)
        bump = constrain_map(hdiff, -20, 20, -5, 5)
        bump = bump if abs(bump) > 0.25 else copysign(0.25, hdiff)
        if (hdiff < 0 and turn_rate > -turn_limit) or (hdiff > 0 and turn_rate < turn_limit):
            anchor.x += bump

        # Do we need to prevent our upside-down plane trying to fall out of the sky?
        if factor == -1:
            if (hdiff < 0 and turn_rate > turn_limit) or (hdiff > 0 and turn_rate < -turn_limit):
                anchor.x -= 1.1 * bump

    auto_pilot.api.set('AILERON_TRIM_PCT', (anchor.x + bank)/180)
