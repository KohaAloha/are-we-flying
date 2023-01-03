from typing import Dict, Union
from threading import Timer
from math import degrees, pi, copysign
from simconnection import SimConnection

MSFS_RADIAN = pi / 10

LEVEL_FLIGHT = 'LVL'
HEADING_MODE = 'HDG'
VERTICAL_SPEED_HOLD = 'VSH'
ALTITUDE_HOLD = 'ALT'
INVERTED_FLIGHT = 'INV'


def test(x: any) -> str: return 'bad' if x is None else 'good'


def map(v: float, ds: float, de: float, ts: float, te: float) -> float:
    d: float = (de-ds)
    if d == 0:
        return ts
    return ts + (v-ds) * (te-ts)/d


def constrain(v: float, m: float, M: float) -> float:
    if m > M:
        return constrain(v, M, m)
    return M if v > M else m if v < m else v


def constrain_map(v: float, ds: float, de: float, ts: float, te: float) -> float:
    return constrain(map(v, ds, de, ts, te), ts, te)


def get_compass_diff(current: float, target: float, direction: float = 1) -> float:
    diff: float = (current - 360) if current > 180 else current
    target: float = target - diff
    result: float = target if target < 180 else target - 360
    if direction > 0:
        return result
    return 360 - target if target < 180 else target - 360


class AutoPilot():
    def __init__(self, api: SimConnection):
        self.api: SimConnection = api
        self.autopilot_enabled: bool = False
        self.modes: Dict[str, Union[bool, float]] = {
            LEVEL_FLIGHT: False,  # level flight
            HEADING_MODE: False,  # heading mode
            VERTICAL_SPEED_HOLD: False,  # vertical speed hold
            ALTITUDE_HOLD: False,  # altitude hold
            INVERTED_FLIGHT: False,  # fly upside down?
        }
        self.lvl_center: float = 0
        self.inverted: float = 1

    def schedule_ap_call(self) -> None:
        # call run function 1 second from now
        Timer(0.5, self.run_auto_pilot, [], {}).start()

    def get_state(self) -> Dict[str, any]:
        state: Dict[str, any] = {'AP_STATE': self.autopilot_enabled}
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
                self.prev_speed = self.api.get_standard_property_value(
                    'AIRSPEED_TRUE')
                self.prev_vspeed = self.api.get_standard_property_value(
                    'VERTICAL_SPEED')
        if ap_type == LEVEL_FLIGHT:
            self.lvl_center = 0
        if ap_type == INVERTED_FLIGHT:
            self.inverted = -1 if self.modes[ap_type] else 1
            self.lvl_center = 0
            sanity_trim = -0.1 if self.inverted else 0.05
            self.api.set_property_value('ELEVATOR_TRIM_POSITION', sanity_trim)
        return self.modes[ap_type]

    def set_target(self, ap_type: str, value: float) -> float:
        if ap_type in self.modes:
            self.modes[ap_type] = value if value != None else False
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
        if not self.autopilot_enabled:
            return

        self.schedule_ap_call()

        running = self.api.get_property_value('SIM_RUNNING')
        if running is None or running < 3:
            return

        speed: float = self.api.get_standard_property_value('AIRSPEED_TRUE')
        bank: float = self.api.get_standard_property_value(
            'PLANE_BANK_DEGREES')
        turn_rate: float = self.api.get_standard_property_value(
            'TURN_INDICATOR_RATE')
        heading: float = self.api.get_standard_property_value(
            'PLANE_HEADING_DEGREES_MAGNETIC')
        alt: float = self.api.get_standard_property_value('INDICATED_ALTITUDE')
        vspeed: float = self.api.get_standard_property_value('VERTICAL_SPEED')
        trim: float = self.api.get_standard_property_value(
            'ELEVATOR_TRIM_POSITION')
        # a_trim: float = self.api.get_standard_property_value(
        #     'AILERON_TRIM_PCT')

        if (speed and bank and turn_rate and heading and alt and vspeed and trim) is None:
            report = ', '.join([
                f'speed: {test(speed)}',
                f'bank: {test(bank)}',
                f'turn rate: {test(turn_rate)}',
                f'heading: {test(heading)}',
                f'alt: {test(alt)}',
                f'vspeed: {test(vspeed)}',
                f'trim: {test(trim)}'
            ])
            return print(report)

        if self.modes[LEVEL_FLIGHT]:
            self.fly_level(bank, turn_rate, heading)
        if self.modes[VERTICAL_SPEED_HOLD]:
            self.hold_vertical_speed(alt, speed, vspeed, trim)

    def fly_level(self, bank: float, turn_rate: float, heading: float) -> None:
        factor = self.inverted
        center = 0 if factor == 1 else pi
        bank = degrees(center + bank) if bank < 0 else degrees(bank - center)
        self.lvl_center += constrain_map(bank, -5, 5, -2, 2)

        if self.modes[HEADING_MODE]:
            heading = degrees(heading)
            target = self.modes[HEADING_MODE]
            hdiff = get_compass_diff(heading, target)
            turn_limit = constrain_map(abs(hdiff), 0, 10, 0.01, 0.03)
            bump = constrain_map(hdiff, -20, 20, -5, 5)
            bump = bump if abs(bump) > 1 else copysign(1, hdiff)
            if (hdiff < 0 and turn_rate > -turn_limit) or (hdiff > 0 and turn_rate < turn_limit):
                self.lvl_center += bump

            # Do we need to prevent our upside-down plane trying to fall out of the sky?
            if factor == -1:
                if (hdiff < 0 and turn_rate > turn_limit) or (hdiff > 0 and turn_rate < -turn_limit):
                    self.lvl_center -= 1.1 * bump

        self.api.set_property_value(
            'AILERON_TRIM_PCT', (self.lvl_center + bank)/180)

    def hold_vertical_speed(self, alt: float, speed: float, vspeed: float, trim: float) -> None:
        alt_target = self.modes[ALTITUDE_HOLD]
        alt_diff = (alt_target - alt) if alt_target else 0

        factor = self.inverted
        lower_limit = 5 * speed
        upper_limit = 10 * speed
        vs_max = upper_limit if factor * alt_diff >= 0 else lower_limit

        # if we're running altitude hold, set a vertical speed target that'll get us there.
        vs_target = 0 if alt_diff == 0 else constrain_map(
            alt_diff, -500, 500, -vs_max, vs_max)
        vs_diff = vs_target - vspeed

        dvs = vspeed - self.prev_vspeed
        dvs_max = speed / 2
        correct = 0

        # Base our step size on how fast this plane is going.
        step = factor * map(speed, 50, 200, MSFS_RADIAN/200, MSFS_RADIAN/120)

        vstep = constrain_map(vs_diff, -vs_max, vs_max, -step, step)
        vstep = vstep if abs(vstep) > 0.00001 else copysign(0.00001, vstep)
        correct += vstep

        dvstep = constrain_map(dvs, -dvs_max, dvs_max, step / 2, -step / 2)
        dvstep = dvstep if abs(dvstep) > 0.000005 else copysign(0.000005, dvstep)
        correct += dvstep

        if (vs_diff < 0 and dvs > dvs_max) or (vs_diff > 0 and dvs < -dvs_max):
            correct += constrain_map(dvs, -dvs_max, dvs_max, step, -step)

        if (vs_target < -5 and vspeed > 0 and vspeed < 100):
            print("got the fuck down")
            correct += constrain_map(vspeed, -100, 100, step/10, -step/10)
        if (vs_target > 5 and vspeed < 0 and vspeed > -100):
            print("got the fuck up")
            correct += constrain_map(vspeed, -100, 100, step/10, -step/10)


        print(vs_target, vs_diff, vspeed, dvs, vs_max, dvs_max, vstep, dvstep)

        # "omg wtf?" protection
        protection_steps = [2, 4, 6]
        for i in protection_steps:
            if (vspeed > i * vs_max and dvs > 0) or (vspeed < -i * vs_max and dvs < 0):
                print(f'wtf, {vspeed} exceeds {vs_max} by {i}x')
                correct += constrain_map(vspeed, -1, 1, step / 4, -step / 4)

        self.api.set_property_value('ELEVATOR_TRIM_POSITION', trim + correct)
        self.prev_vspeed = vspeed
        self.prev_speed = speed
