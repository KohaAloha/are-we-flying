from math import degrees
from utils import constrain_map, get_compass_diff
from constants import HEADING_MODE


def fly_level(auto_pilot, state):
    anchor = auto_pilot.anchor
    bank = state.bank_angle
    dBank = state.dBank
    trim = state.aileron_trim - anchor.x

    # Are we getting progressively off kilter?
    if (bank < 0 and dBank < 0) or (bank > 0 and dBank > 0):
        anchor.x += bank / constrain_map(bank, -0.01, 0.01, 5, 5)

    # Are we correcting for being off kilter, but too aggressively?
    elif (bank > 0 and dBank < -0.1) or (bank < 0 and dBank > 0.1):
        anchor.x -= bank / constrain_map(bank, -0.01, 0.01, 10, 10)

    # Are we supposed to fly a specific compass heading?
    if auto_pilot.modes[HEADING_MODE]:
        heading = degrees(state.heading)
        target = auto_pilot.modes[HEADING_MODE]
        hdiff = get_compass_diff(heading, target)

        # The only reason we have two max rates is because of the Top Rudder =)
        max_turn_rate = 0.03 if state.speed > 60 else 0.01
        bump = constrain_map(hdiff, -30, 30, -max_turn_rate, max_turn_rate)
        anchor.x += bump

        # And the only reason we have this one is the Gee Bee R3 Special =)
        if state.speed > 200:
            anchor.x -= bump
            anchor.x += constrain_map(hdiff, -30, 30, -
                                      1.5 * max_turn_rate, 1.5 * max_turn_rate)

    auto_pilot.api.set_property_value('AILERON_TRIM_PCT', trim + anchor.x)
