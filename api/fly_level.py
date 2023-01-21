from math import degrees, radians, copysign
from utils import constrain, constrain_map, get_compass_diff
from constants import HEADING_MODE


def fly_level(auto_pilot, state):
    anchor = auto_pilot.anchor
    trim = state.aileron_trim

    bank = degrees(state.bank_angle)
    dBank = state.dBank
    target_bank = 0
    turn_rate = degrees(state.turn_rate)

    # We need to account for everything from 50kts aircraft like the
    # Asobo Top Rudder, to the 250kts Gee Bee R3 Special. The faster
    # the plane, the harder it needs to bank in order to get to a
    # reasonable rate of turn.
    max_bank = constrain_map(state.speed, 50, 250, 10, 30)
    max_dBank = radians(1)
    max_turn_rate = 3

    step = radians(1)
    bump = 0
    diff = 0
    flight_heading = auto_pilot.modes[HEADING_MODE]
    h_diff = 0

    # Are we supposed to fly a specific compass heading?
    if flight_heading:
        heading = degrees(state.heading)
        target = flight_heading
        h_diff = get_compass_diff(heading, target)
        target_bank = -constrain_map(h_diff, -30, 30, -max_bank, max_bank)

    # Now then: we want a diff==0 and dBank==0, so let's minimize both!

    # First off, what is our banking difference?
    diff = target_bank - bank

    # correct for non-zero diff first:
    nudge = -constrain_map(diff, -15, 15, -step, step)
    bump += nudge
    if abs(diff) < 2:
        bump += nudge

    # then correct for non-zero dBank
    nudge = constrain_map(dBank, -max_dBank, max_dBank, -step/2, step/2)
    bump += nudge

    # And finally, make sure we're not turning too fast. The closer
    # to our target we get, the smaller our allowed turn rate should be:
    if flight_heading:
        max_turn_rate = constrain_map(abs(h_diff), 0, 10, 0.02, max_turn_rate)
        if turn_rate < -max_turn_rate or turn_rate > max_turn_rate:
            overshoot = turn_rate - max_turn_rate
            nudge = constrain_map(overshoot, -max_turn_rate,
                                   max_turn_rate, -step/5, step/5)
            bump -= nudge

    anchor.x += bump
    auto_pilot.api.set_property_value('AILERON_TRIM_PCT', anchor.x)

    print(f'diff: {diff}, turn rate: {turn_rate}, max turn rate: {max_turn_rate}, trim: {trim}, anchor: {anchor.x}')
