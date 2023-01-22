import time
from typing import Dict, Union
from threading import Timer
from simconnection import SimConnection
from fly_level import fly_level
from hold_altitude import hold_altitude
from state import State
from utils import test
from vector import Vector
from math import pi

from constants import (
    LEVEL_FLIGHT,
    HEADING_MODE,
    VERTICAL_SPEED_HOLD,
    ALTITUDE_HOLD,
    INVERTED_FLIGHT
)


class AutoPilot():
    def __init__(self, api: SimConnection, old_instance=None):
        print("RELOADING")
        self.api: SimConnection = api
        api.set_auto_pilot(self)
        self.auto_pilot_enabled: bool = False
        if old_instance is not None:
            self.modes = old_instance.modes
        else:
            self.modes: Dict[str, Union[bool, float]] = {
                LEVEL_FLIGHT: False,  # level flight
                HEADING_MODE: False,  # heading mode
                VERTICAL_SPEED_HOLD: False,  # vertical speed hold
                ALTITUDE_HOLD: False,  # altitude hold
                INVERTED_FLIGHT: False,  # fly upside down?
            }
        self.bootstrap()

    def bootstrap(self):
        """
        Set up values we need during the autopilot main loop
        """
        self.prev_state = State()
        self.anchor = Vector()
        self.inverted = 1

    def schedule_ap_call(self):
        Timer(0.5, self.run_auto_pilot, [], {}).start()

    def get(self, name):
        return self.api.get_standard_property_value(name)

    def get_special(self, name):
        return self.api.get_property_value(name)

    def set(self, name, value):
        self.api.set_property_value(name, value)

    def get_auto_pilot_parameters(self):
        state = {'AP_STATE': self.auto_pilot_enabled}
        for key, value in self.modes.items():
            state[key] = value
        return state

    def toggle(self, ap_type):
        if ap_type not in self.modes:
            return None
        self.modes[ap_type] = not self.modes[ap_type]
        if self.modes[ap_type]:
            if ap_type == VERTICAL_SPEED_HOLD:
                print(f'Engaging VS hold')
                self.prev_speed = self.get('AIRSPEED_TRUE')
                self.prev_vspeed = self.get('VERTICAL_SPEED')
        if ap_type == LEVEL_FLIGHT:
            self.lvl_center = 0
            self.prev_bank = self.get('PLANE_BANK_DEGREES')
        if ap_type == INVERTED_FLIGHT:
            self.inverted = -1 if self.modes[ap_type] else 1
            # self.anchor.x = ...
            sanity_trim = -0.1 if self.inverted else 0.05
            self.set('ELEVATOR_TRIM_POSITION', sanity_trim)
        return self.modes[ap_type]

    def set_target(self, ap_type, value):
        if ap_type in self.modes:
            self.modes[ap_type] = value if value != None else False
            if ap_type == ALTITUDE_HOLD:
                print(f'Engaging ALT hold to {value}')
                self.prev_alt = self.get('INDICATED_ALTITUDE')
            if ap_type == HEADING_MODE:
                print(f'Engaging HDG hold to {value}')
                self.set('AUTOPILOT_HEADING_LOCK_DIR', value)
            return value
        return None

    def toggle_auto_pilot(self):
        self.auto_pilot_enabled = not self.auto_pilot_enabled
        if self.auto_pilot_enabled:
            self.prev_call_time = time.perf_counter()
            self.schedule_ap_call()
        return self.auto_pilot_enabled

    def run_auto_pilot(self):
        """
        This is our master autopilot entry point,
        grabbing the current state from MSFS, and
        forwarding it to the relevant AP handlers.
        """
        if not self.auto_pilot_enabled:
            return

        # If the autopilot is enabled, even if there
        # are errors due to MSFS glitching, or the DLL
        # handling glitching, or values somehow having
        # gone missing etc. etc: schedule the next call
        self.schedule_ap_call()

        # Are we flying, or paused/in menu/etc?
        running = self.get_special('SIM_RUNNING')
        if running is None or running < 3:
            return

        speed = self.get('AIRSPEED_TRUE')
        bank = self.get('PLANE_BANK_DEGREES')
        turn_rate = self.get('TURN_INDICATOR_RATE')
        heading = self.get('PLANE_HEADING_DEGREES_MAGNETIC')
        alt = self.get('INDICATED_ALTITUDE')
        vspeed = self.get('VERTICAL_SPEED')
        trim = self.get('ELEVATOR_TRIM_POSITION')
        trim_limit = self.get('ELEVATOR_TRIM_UP_LIMIT')
        a_trim = self.get('AILERON_TRIM_PCT')

        if (speed and bank and turn_rate and heading and alt and vspeed and trim and trim_limit and a_trim) is None:
            return print(', '.join([
                f'speed: {test(speed)}',
                f'bank: {test(bank)}',
                f'turn rate: {test(turn_rate)}',
                f'heading: {test(heading)}',
                f'alt: {test(alt)}',
                f'vspeed: {test(vspeed)}',
                f'trim: {test(trim)}',
                f'limit: {test(trim_limit)}',
            ]))

        state = State(
            altitude=alt,
            speed=speed,
            heading=heading,
            bank_angle=bank,
            turn_rate=turn_rate,
            vertical_speed=vspeed,
            pitch_trim=trim,
            pitch_trim_limit=trim_limit,
            aileron_trim=a_trim,
            prev_state=self.prev_state,
        )

        # Do we need to level the wings?
        if self.modes[LEVEL_FLIGHT]:
            fly_level(self, state)

        # Do we need to hold our altitude?
        if self.modes[VERTICAL_SPEED_HOLD]:
            hold_altitude(self, state)

        self.prev_state = state
