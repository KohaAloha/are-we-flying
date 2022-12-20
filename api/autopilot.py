from typing import Dict, Union
from threading import Timer
from math import degrees, radians, pi
from simconnection import SimConnection

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
        # call run function 1 second from now
        Timer(1, self.run_auto_pilot, [], {}).start()

    def get_state(self) -> Dict[str, any]:
        state = {'AP_STATE': self.autopilot_enabled}
        for key, value in self.modes.items():
            state[key] = value
        return state

    def toggle(self, ap_type: str) -> bool:
        if ap_type not in self.modes:
            return None
        self.modes[ap_type] = not self.modes[ap_type]
        return self.modes[ap_type]

    def set_target(self, ap_type: str, value: float) -> float:
        if ap_type in self.modes:
            self.modes[ap_type] = value if value != None else False
            if ap_type == VERTICAL_SPEED_HOLD:
                print(f'Engaging VS hold to {value}')
                self.prev_vspeed = self.api.get_standard_property_value(
                    'VERTICAL_SPEED')
            if ap_type == ALTITUDE_HOLD:
                print(f'Engaging ALT hold to {value}')
                self.prev_alt = self.api.get_standard_property_value(
                    'INDICATED_ALTITUDE')
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
        bank = self.api.get_standard_property_value('PLANE_BANK_DEGREES')
        trim = self.api.get_standard_property_value('AILERON_TRIM_PCT')

        if bank is None or trim is None:
            return

        bank = degrees(bank)
        self.lvl_center = center = self.lvl_center + \
            constrain_map(bank, -5, 5, -2, 2)
        print(f'trim: {trim}, bank: {bank}, center: {center}')

        # Do we need to correct this center further in order to account for intended heading?
        heading = self.api.get_standard_property_value(
            'PLANE_HEADING_DEGREES_MAGNETIC')
        if heading is None:
            return
        heading = degrees(heading)
        target = self.modes[HEADING_MODE]
        if target is None:
            target = 360
        hdiff = get_compass_diff(heading, target - 1)  # not a fan of this 0.5, but it's necessary for sure
        bump = constrain_map(hdiff, -7, 7, -1.7, 1.7)
        self.lvl_center = center = self.lvl_center + bump

        # Done, set new trim
        self.api.set_property_value('AILERON_TRIM_PCT', (center + bank)/45)

    def hold_vertical_speed(self) -> None:
        alt = self.api.get_standard_property_value('INDICATED_ALTITUDE')
        speed = self.api.get_standard_property_value('AIRSPEED_TRUE')
        vspeed = self.api.get_standard_property_value('VERTICAL_SPEED')
        pitch = self.api.get_standard_property_value('PLANE_PITCH_DEGREES')
        trim = self.api.get_standard_property_value('ELEVATOR_TRIM_POSITION')

        if alt is None or speed is None or vspeed is None or pitch is None or trim is None:
            return

        # Used by both VSH and ALT code
        self.vs_limits = {
            "vs_lim_1": 100,
            "vs_lim_2": 300,
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
        self.run_altitude_hold(alt, speed, vspeed, pitch, trim)

        self.prev_vspeed = vspeed

    def run_vertical_speed_hold(self, alt, speed, vspeed, pitch, trim) -> None:
        target = self.modes[VERTICAL_SPEED_HOLD]
        diff = target - vspeed
        dVS = vspeed - self.prev_vspeed
        min_max = constrain_map(speed, 50, 150, 0.0003, 0.001)
        correct = constrain_map(diff, -100, 100, -min_max, min_max)

        [vs_lim_1, vs_lim_2, vs_max] = [
            value for key, value in self.vs_limits.items()]
        dVS_max = constrain(abs(vspeed)/10, 1, 10)

        print(f'vspeed: {vspeed}')
        print(f'diff: {diff}')
        print(f'dVS: {dVS}')
        print(f'trim: {trim}')
        print(f'pitch: {pitch}')
        print(f'correct: {correct}')

        if diff > 0 and dVS < dVS_max and vspeed < vs_lim_1:
            # print('pitch up')
            if correct > 0 and correct < min_max/5:
                correct = min_max/5
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim + correct)
        elif diff > 0 and (dVS > 3*dVS_max or vspeed > vs_lim_2):
            # print('pitching up way too fast')
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim - correct * 0.75)
        elif diff > 0 and (dVS < 2*dVS_max or vspeed > vs_lim_1):
            # print('pitching up too fast')
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim - correct * 0.5)
        elif diff < 0 and dVS > -dVS_max and vspeed > -vs_lim_1:
            # print('pitch down')
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim + correct)
        elif diff < 0 and (dVS < 3 * -dVS_max or vspeed < -vs_lim_2):
            # print('pitching down way too much')
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim - correct * 0.75)
        elif diff < 0 and (dVS < 2 * -dVS_max or vspeed < -vs_lim_1):
            # print('pitching down too much')
            self.api.set_property_value(
                'ELEVATOR_TRIM_POSITION', trim - correct * 0.5)
        else:
            # print('do nothing?')
            pass

    def run_altitude_hold(self, alt, speed, vspeed, pitch, trim) -> None:
        [vs_lim_1, vs_lim_2, vs_max] = [
            value for key, value in self.vs_limits.items()]

        target = self.modes[ALTITUDE_HOLD]

        if (-0.10 < trim):
            trim_bump = 0.001
            alt_diff = target - alt
            vs_threshold = constrain_map(
                abs(alt_diff), 50, 500, vs_lim_1, vs_max)
            if abs(vspeed) > vs_max:
                # print('vspeed's too high! counter trim')
                correct = 0.5 * \
                    constrain_map(alt_diff, -1, 1, trim_bump, -trim_bump)
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim + correct)
            elif abs(vspeed) < vs_max and abs(alt_diff) > 1000:
                # print('maxing out pitch to get near target altitude')
                correct = constrain_map(alt_diff, -1, 1, -trim_bump, trim_bump)
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim + correct)
            elif abs(vspeed) < vs_threshold and abs(alt_diff) > 10:
                # print('bumping pitch a little to get reach target altitude')
                correct = constrain_map(
                    alt_diff, -100, 100, -trim_bump, trim_bump)
                self.api.set_property_value(
                    'ELEVATOR_TRIM_POSITION', trim + correct)
