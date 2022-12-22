from typing import Dict, Union
from threading import Timer
from math import degrees, radians, pi, copysign
from simconnection import SimConnection

MSFS_RADIANS = pi / 10  # Yep: it's 0.31415[...] for...reasons?

LEVEL_FLIGHT = 'LVL'
HEADING_MODE = 'HDG'
VERTICAL_SPEED_HOLD = 'VSH'
ALTITUDE_HOLD = 'ALT'


def constrain(v, m, M):
    if m > M:
        return constrain(v, M, m)
    return M if v > M else m if v < m else v


def constrain_map(v, ds, de, ts, te):
    mapped = ts + (v-ds) * (te-ts)/(de-ds)
    return constrain(mapped, ts, te)


def get_compass_diff(current, target):
    diff = (current - 360) if current > 180 else current
    target = target - diff
    return target if target < 180 else target - 360


class AutoPilot():
    def __init__(self, api: SimConnection):
        self.api = api
        self.autopilot_enabled: bool = False
        self.modes: Dict[str, Union[bool, float]] = {
            LEVEL_FLIGHT: False,  # level flight
            HEADING_MODE: False,  # heading mode
            VERTICAL_SPEED_HOLD: False,  # vertical speed hold
            ALTITUDE_HOLD: False,  # altitude hold
        }
        self.pids = {}
        self.lvl_center = 0

    def schedule_ap_call(self) -> None:
        # call run function at (approximately) 6Hz
        Timer(0.166, self.run_auto_pilot, [], {}).start()

    def get_state(self) -> Dict[str, any]:
        state = {'AP_STATE': self.autopilot_enabled}
        for key, value in self.modes.items():
            state[key] = value
        return state

    def toggle(self, ap_type: str) -> bool:
        if ap_type not in self.modes:
            return None
        self.modes[ap_type] = not self.modes[ap_type]
        if self.modes[ap_type]:
            if ap_type == VERTICAL_SPEED_HOLD:
                print(f'Engaging VS hold')
                self.prev_vspeed = self.api.get_standard_property_value(
                    'VERTICAL_SPEED')
            if ap_type == LEVEL_FLIGHT:
                print(f'Engaging level flight')
        return self.modes[ap_type]

    def set_target(self, ap_type: str, value: float) -> float:
        if ap_type in self.modes:
            self.modes[ap_type] = value if value != None else False
            if ap_type == ALTITUDE_HOLD:
                print(f'Engaging ALT hold to {value}')
                self.prev_alt = self.api.get_standard_property_value(
                    'INDICATED_ALTITUDE')
                self.set_initial_ALT_trim(value)
            if ap_type == HEADING_MODE:
                print(f'Setting heading target to {value}')
            return value
        return None

    def toggle_autopilot(self) -> bool:
        self.autopilot_enabled = not self.autopilot_enabled
        if self.autopilot_enabled:
            self.schedule_ap_call()
        return self.autopilot_enabled

    def run_auto_pilot(self) -> None:
        if self.autopilot_enabled is False:
            return

        if self.modes[LEVEL_FLIGHT]:
            self.fly_level()

        if self.modes[VERTICAL_SPEED_HOLD] is not False:
            # print('vertical speed hold')
            self.hold_vertical_speed()

        # schedule the next call
        self.schedule_ap_call()

    def fly_level(self) -> None:
        speed = self.api.get_standard_property_value('AIRSPEED_TRUE')
        bank = self.api.get_standard_property_value('PLANE_BANK_DEGREES')
        trim = self.api.get_standard_property_value('AILERON_TRIM_PCT')
        heading = self.api.get_standard_property_value(
            'PLANE_HEADING_DEGREES_MAGNETIC')

        if (speed and bank and trim and heading) is None:
            return

        bank = degrees(bank)
        heading = degrees(heading)

        self.lvl_center = center = self.lvl_center + \
            constrain_map(bank, -5, 5, -2, 2)

        # Do we need to correct this center further in order to account for intended heading?
        target = self.modes[HEADING_MODE]
        if target is None:
            target = 360
        # not a fan of this 0.5, but it's necessary for sure
        hdiff = get_compass_diff(heading, target - 0.5)
        rate_value = speed / 80
        bump = constrain_map(hdiff, -7, 7, -rate_value, rate_value)
        self.lvl_center = center = self.lvl_center + bump

        # Done, set new trim
        self.api.set_property_value('AILERON_TRIM_PCT', (center + bank)/45)

    def hold_vertical_speed(self) -> None:
        alt = self.api.get_standard_property_value('INDICATED_ALTITUDE')
        speed = self.api.get_standard_property_value('AIRSPEED_TRUE')
        vspeed = self.api.get_standard_property_value('VERTICAL_SPEED')
        pitch = self.api.get_standard_property_value('PLANE_PITCH_DEGREES')
        trim = self.api.get_standard_property_value('ELEVATOR_TRIM_POSITION')

        if (alt and speed and vspeed and pitch and trim) is None:
            return

        # Used by both VSH and ALT code
        self.vs_limits = {
            "vs_lim_1": 100,
            "vs_max": speed * 8,
        }

        """
        Run vertical speed hold logic.
        """
        self.run_vertical_speed_hold(alt, speed, vspeed, pitch, trim)

        """
        Run additional altitude hold logic, in case we're trying
        to reach VS:0 at the wrong altitude. However, since we're
        messing with the elevator trim, make sure we never trim
        below 30% because we'll pick up so much speed we'll be
        tearing the airplane apart. Which would be bad.
        """
        # self.run_altitude_hold(alt, speed, vspeed, pitch, trim)

        self.prev_vspeed = vspeed

    def run_vertical_speed_hold(self, alt, speed, vspeed, pitch, trim) -> None:
        """
        Our action table:

               target      VS    dVS     state
               -----------------------------------------------------------------------
                below      +      +      away from target, at increasing rate
                below      +      0      heading away from target at fixed speed
                below      +      -      away from target, but slowing down
                below      -      -      heading towards target, at increasing rate
                below      -      0      heading towards target at fixed speed
                below      -      +      heading towards target, but slowing down

                above      -      -      away from target, at increasing rate
                above      -      0      heading away from target at fixed speed
                above      -      +      away from target, but slowing down
                above      +      +      heading towards target, at increasing rate
                above      +      0      heading towards target at fixed speed
                above      +      -      heading towards target, but slowing down

        And our rules:

          - VS cannot exceed (10 * speed), either up or down
          - dVS cannot exceed (speed / 10), either up or down

        Which should hopefully guarantee safe trim/airspeed values.

        Our trim correction table:

               target      VS    dVS     state
               -----------------------------------------------------------------------
                below      +      +      trim down a lot
                below      +      0      trim down
                below      +      -      trim down
                below      -      -      trim up if VS or dVS exceed their limits
                below      -      0      trim down
                below      -      +      trim down a lot

                above      -      -      trim up a lot
                above      -      0      trim up
                above      -      +      trim up
                above      +      +      trim down if VS or dVS exceed their limits
                above      +      0      trim up
                above      +      -      trim up a lot

        Looking at the dVS values, We can simplify the different actions a little:

               target      VS    dVS     state
               -----------------------------------------------------------------------
                below      -      -      trim up if VS or dVS exceed their limits
                below     +/-     +      trim down a lot
                below         else        trim down

                above      +      +      trim down if VS or dVS exceed their limits
                above     +/-     -      trim up a lot
                above        else        trim up


        Trim correction is based on VS and dVS, using constraint_map, which maps a value
        from one domain to another domain, while constraining the output to the new
        domain's min and max values. Negative Trim values represent "pitch down", positive
        trim values represent "pitch up.

            trim_limit = 1 degree
            correction = 0
            if dVS exceeds limit:
                # negative dVS means we're dropping, so should map to pitching up
                correction = correction + constraint_map(dVS, -dVS_limit, dVS_limit, trim_limit, -trim_limit)
            if vspeed exceeds limit:
                # negative vspeed means we're dropping, so should also map to pitching up
                correction = correction + constraint_map(vspeed, -vs_limit, vs_limit, trim_limit, -trim_limit)

        By running that check first, we cam further simplify our subsequent table:

               target      VS    dVS     state
               -----------------------------------------------------------------------
                below     any     +      trim down a lot
                below        else        trim down

                above     any     -      trim up a lot
                above        else        trim up

        """

        target = 0
        diff = target - vspeed

        # we want this in feet per second so we need to divide by our Timer value:
        dVS = (vspeed - self.prev_vspeed) / 0.16

        vs_max = 10 * speed
        dVS_max = speed / 8
        trim_limit = 0.16 * MSFS_RADIANS / 90
        correction = 0

        step = constrain_map(abs(diff), 0, vs_max, 0.00003, trim_limit)

        # corrections when we're over our limits
        if dVS < -dVS_max:
            correction += step
        elif dVS > dVS_max:
            correction -= step

        if vspeed < -vs_max:
            correction += step
        elif vspeed > vs_max:
            correction -= step

        # Is the target below us, meaning we need to pitch down?
        if correction == 0 and diff < 0:
            if dVS >= 0:
                # we're accelerating in the wrong direction, trim down a lot
                correction -= step
            else:
                # trim down a bit
                correction -= step

        # Is the target above us, meaning we need to pitch up?
        if correction == 0 and diff > 0:
            if dVS <= 0:
                # we're accelerating in the wrong direction, trim up a lot
                correction += step
            else:
                # trim up a bit
                correction += step

        print(f'target: {target}')
        print(f'vspeed: {vspeed}')
        print(f'diff: {diff}')
        print(f'dVS: {dVS}')
        print(f'speed: {speed}')
        print(f'vs_max: {vs_max}')
        print(f'dVS_max: {dVS_max}')
        print(f'trim: {trim}')
        print(f'step: {step}')
        print(f'correction: {correction}')

        # Then update our trim
        self.api.set_property_value(
            'ELEVATOR_TRIM_POSITION', trim + correction)

    def set_initial_ALT_trim(self, target):
        # In order to get us going, we set an initial "reasonable"
        # trim to immediatley pitch us in the right direction.
        alt = self.api.get_standard_property_value('INDICATED_ALTITUDE')
        diff = target - alt
        trim = self.api.get_standard_property_value('ELEVATOR_TRIM_POSITION')
        correct = constrain_map(diff, -1000, 1000, -0.02, 0.02)
        self.api.set_property_value('ELEVATOR_TRIM_POSITION', trim + correct)

    def run_altitude_hold(self, alt, speed, vspeed, pitch, trim) -> None:
        [vs_lim_1, vs_max] = [
            value for _, value in self.vs_limits.items()]

        target = self.modes[ALTITUDE_HOLD]
        dVS = vspeed - self.prev_vspeed
        if dVS == 0:
            dVS = copysign(1, vspeed)
        alt_diff = target - alt

        if alt_diff > 0 and trim > 0.18:
            return self.api.set_property_value('ELEVATOR_TRIM_POSITION', 0.18)

        trim_bump = 0.001

        correct = constrain_map(abs(dVS), 0, 10, 0, trim_bump)
        print(dVS, alt_diff, trim)

        # Are we going opposite of the intended direction?
        # if alt_diff > 0 and vspeed > 0 and alt_diff < vspeed:
        #     # we'll be shooting up through our target, fix that
        #     correct = constrain_map(vspeed, 0, vs_max, 0, 3 * trim_bump)
        #     self.api.set_property_value(
        #         'ELEVATOR_TRIM_POSITION', trim - correct)
        # elif alt_diff < 0 and vspeed < 0 and alt_diff > vspeed:
        #     # we'll be shooting down through our target, fix that
        #     correct = constrain_map(vspeed, -vs_max, 0, -3 * trim_bump, 0)
        #     self.api.set_property_value(
        #         'ELEVATOR_TRIM_POSITION', trim + correct)
        if dVS < 0 and alt_diff > 0:
            print('why is our vspeed going down?', trim)
            # Do we need to go up, but VS is dropping? Get that fixed!
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim + correct)
        elif dVS > 0 and alt_diff < 0:
            print('why is our vspeed going up?', trim)
            # Do we need to go down, but VS is rising? Again, fix please O_o
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim - correct)

        # Prevent downward overspeed / upward stall, fast.
        elif abs(vspeed) > vs_max:
            if vspeed < 0:
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim + correct)
            else:
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim - correct)

        # We're on a normal trajectory, bump the vspeed as needed
        elif (vspeed < vs_max and alt_diff > 0) or (vspeed > -vs_max and alt_diff < 0):
            # we want to go up or down,
            vs_threshold = constrain_map(
                abs(alt_diff), 50, 500, vs_lim_1, vs_max)
            if abs(vspeed) > vs_max:
                # print('vspeed's too high! counter trim')
                correct = 0.5 * \
                    constrain_map(alt_diff, -100, 100, trim_bump, -trim_bump)
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim + correct)
            elif abs(vspeed) < vs_max and abs(alt_diff) > 1000:
                # print('maxing out pitch to get near target altitude')
                correct = constrain_map(
                    alt_diff, -100, 100, -trim_bump, trim_bump)
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim + correct)
            elif abs(vspeed) < vs_threshold and abs(alt_diff) > 10:
                # print('bumping pitch a little to get reach target altitude')
                correct = constrain_map(
                    alt_diff, -100, 100, -trim_bump, trim_bump)
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim + correct)

        print(f'correction: {correct}')
