from typing import Dict, Union
from threading import Timer
from math import degrees, pi, copysign
from simconnection import SimConnection

MSFS_RADIAN = pi / 10
LEVEL_FLIGHT = 'LVL'
HEADING_MODE = 'HDG'
VERTICAL_SPEED_HOLD = 'VSH'
ALTITUDE_HOLD = 'ALT'


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


def get_compass_diff(current: float, target: float) -> float:
    diff: float = (current - 360) if current > 180 else current
    target: float = target - diff
    return target if target < 180 else target - 360


class AutoPilot():
    def __init__(self, api: SimConnection):
        self.api: SimConnection = api
        self.autopilot_enabled: bool = False
        self.modes: Dict[str, Union[bool, float]] = {
            LEVEL_FLIGHT: False,  # level flight
            HEADING_MODE: False,  # heading mode
            VERTICAL_SPEED_HOLD: False,  # vertical speed hold
            ALTITUDE_HOLD: False,  # altitude hold
        }
        self.lvl_center: float = 0

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
                self.vs_max_correction = 0
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
        speed: float = self.api.get_standard_property_value('AIRSPEED_TRUE')
        bank: float = self.api.get_standard_property_value(
            'PLANE_BANK_DEGREES')
        heading: float = self.api.get_standard_property_value(
            'PLANE_HEADING_DEGREES_MAGNETIC')
        alt: float = self.api.get_standard_property_value('INDICATED_ALTITUDE')
        vspeed: float = self.api.get_standard_property_value('VERTICAL_SPEED')
        trim: float = self.api.get_standard_property_value(
            'ELEVATOR_TRIM_POSITION')

        def test(x: any) -> str: return 'bad' if x is None else 'good'
        if (speed and bank and heading and alt and vspeed and trim) is None:
            report = ', '.join([
                f'speed: {test(speed)}',
                f'bank: {test(bank)}',
                f'heading: {test(heading)}',
                f'alt: {test(alt)}',
                f'vspeed: {test(vspeed)}',
                f'trim: {test(trim)}'
            ])
            return print(report)

        # print(f'{round(speed,1)}\t{round(bank,1)}\t{round(heading,1)}\t{round(alt,0)}\t{round(vspeed,1)}\t{round(trim,5)}')

        if self.autopilot_enabled is False:
            return
        if self.modes[LEVEL_FLIGHT]:
            self.fly_level(speed, bank, heading)
        if self.modes[VERTICAL_SPEED_HOLD]:
            self.hold_vertical_speed(alt, speed, vspeed, trim)
        self.schedule_ap_call()

    def fly_level(self, speed: float, bank: float, heading: float) -> None:
        bank = degrees(bank)
        self.lvl_center += constrain_map(bank, -5, 5, -2, 2)

        if self.modes[HEADING_MODE]:
            heading = degrees(heading)
            target = self.modes[HEADING_MODE]
            hdiff = get_compass_diff(heading, target)
            max_bump = map(speed, 50, 150, 1.2, 2)
            self.lvl_center += constrain_map(hdiff, -10,
                                             10, -max_bump, max_bump)

        self.api.set_property_value(
            'AILERON_TRIM_PCT', (self.lvl_center + bank)/180)

    def hold_vertical_speed(self, alt: float, speed: float, vspeed: float, trim: float) -> None:
        alt_target = self.modes[ALTITUDE_HOLD]
        alt_diff = (alt_target - alt) if alt_target else 0
        vs_target = 0
        vs_diff = vs_target - vspeed
        vs_max = 10 * speed - self.vs_max_correction if alt_diff >= 0 else 5 * speed
        dvs = vspeed - self.prev_vspeed
        dvs_max = speed / 2
        alt_hold_limit = 20
        correct = 0

        dv = speed - self.prev_speed
        if alt_diff > 0 and (dv < 0) and abs(vs_diff) > 200:
            self.vs_max_correction -= constrain_map(dv, -1, 0, 300, 0)
            vs_max = max(vs_max + self.vs_max_correction, 100)
            # print(dv, self.vs_max_correction, vs_max)

        # We make our step size contingent on how fast this plane (can) go(es)
        step = map(speed, 50, 150, MSFS_RADIAN / 200, MSFS_RADIAN / 100)

        # we want both vspeed *and* dVS to become zero.
        correct += constrain_map(vs_diff, -vs_max, vs_max, -step, step)
        correct += constrain_map(dvs, -dvs_max, dvs_max, step, -step)

        # special handling for when we're close to our target
        if abs(vs_diff) < 200 and abs(alt_diff) < alt_hold_limit:
            self.vs_max_correction = 0
            vs_correct = constrain_map(vs_diff, -200, 200, -step / 4, step / 4)
            if abs(vs_correct) > 0.0003:
                correct += copysign(0.0003, vs_correct)
            else:
                correct += vs_correct
                correct += constrain_map(dvs, -20, 20, step / 9.99, -step / 10)

        # "omg, stop, what are you doing??" protection
        if (vspeed > 2 * vs_max and dvs > 0) or (vspeed < -2 * vs_max and dvs < 0):
            limit = 10 * vs_max
            kick = 4 * step
            correct += constrain_map(vspeed, -limit, limit, kick, -kick)

        # Same trick as for heading: nudge us up or down if we need to be at a specific altitude
        if alt_diff != 0:
            alt_correct = constrain_map(alt_diff, -200, 200, -step, step)
            correct += alt_correct
            # Do we need an extra kick, though?
            if alt_diff > 20 and vspeed < -20:
                correct += alt_correct
            elif alt_diff < -20 and vspeed > 20:
                correct += alt_correct

        self.api.set_property_value('ELEVATOR_TRIM_POSITION', trim + correct)
        self.prev_vspeed = vspeed
        self.prev_speed = speed
