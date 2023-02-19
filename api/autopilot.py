import time
from typing import Dict, Union
from threading import Timer
from simconnection import SimConnection
from auto_takeoff import auto_takeoff
from fly_level import fly_level
from vertical_hold import vertical_hold
from state import State
from utils import test, get_distance_between_points
from vector import Vector
from math import pi

from constants import (
    AUTO_TAKEOFF,
    LEVEL_FLIGHT,
    HEADING_MODE,
    VERTICAL_SPEED_HOLD,
    ALTITUDE_HOLD,
    ACROBATIC,
    INVERTED_FLIGHT
)

crashed = False

def gps_distance(lat1, long1, lat2, long2):
    pass


class Waypoint:
    def __init__(self, lat, long, alt=None):
        self.lat = lat
        self.long = long
        self.alt = alt

    def __str__(self):
        return f'{self.lat},{self.long},{self.alt}'

    def __eq__(self, other):
        if not hasattr(other, 'lat'):
            return False
        if not hasattr(other, 'long'):
            return False
        return self.lat == other.lat and self.long == other.long

    def __dict__(self):
        return {
            'lat': self.lat,
            'long': self.long,
            'alt': self.alt
        }


class AutoPilot():
    def __init__(self, api: SimConnection, old_instance=None):
        self.api: SimConnection = api
        api.set_auto_pilot(self)
        self.auto_pilot_enabled: bool = False
        if old_instance is not None:
            self.modes = old_instance.modes
        else:
            self.modes: Dict[str, Union[bool, float]] = {
                AUTO_TAKEOFF: False,
                LEVEL_FLIGHT: False,
                HEADING_MODE: False,
                VERTICAL_SPEED_HOLD: False,
                ALTITUDE_HOLD: False,
                ACROBATIC: False,  # use the special acrobatic code instead?
                INVERTED_FLIGHT: False,  # fly upside down?
            }
        self.bootstrap()

    def bootstrap(self):
        """
        Set up values we need during the autopilot main loop
        """
        self.prev_state = State()
        self.anchor = Vector()
        self.acrobatic = True
        self.inverted = False
        self.waypoints = []

    def add_waypoint(self, lat, long, alt=None):
        self.waypoints.append(Waypoint(lat, long, alt))

    def remove_waypoint(self, lat, long):
        self.waypoints.remove(Waypoint(lat, long))

    def schedule_ap_call(self):
        Timer(0.5, self.try_run_auto_pilot, [], {}).start()

    def get(self, name):
        return self.api.get_standard_property_value(name)

    def get_special(self, name):
        return self.api.get(name)

    def set(self, name, value):
        self.api.set(name, value)

    def get_auto_pilot_parameters(self):
        state = {
            'AP_STATE': self.auto_pilot_enabled,
            'waypoints': [w.__dict__() for w in self.waypoints]
        }
        for key, value in self.modes.items():
            state[key] = value
        return state

    def toggle(self, ap_type):
        if ap_type not in self.modes:
            return None
        self.modes[ap_type] = not self.modes[ap_type]
        if self.modes[ap_type]:
            if ap_type == VERTICAL_SPEED_HOLD:
                print(f'Engaging vertical speed hold')
                self.anchor.y = self.get('ELEVATOR_TRIM_POSITION')
        if ap_type == LEVEL_FLIGHT:
            print(f'Engaging level mode')
            self.anchor.x = self.get('AILERON_TRIM_PCT')
        if ap_type == INVERTED_FLIGHT:
            self.inverted = not self.inverted
            # reset our anchor and trim: things are about to get spicy
            self.anchor.x = 0
            self.api.set('AILERON_TRIM_PCT', 0)
            self.anchor.y = 0
            self.api.set('ELEVATOR_TRIM_POSITION', -
                         0.07 if self.inverted else 0)
        return self.modes[ap_type]

    def set_target(self, ap_type, value):
        if ap_type in self.modes:
            self.modes[ap_type] = value if value != None else False
            if ap_type == ALTITUDE_HOLD:
                print(f'Engaging altitude hold at {value} feet')
                self.prev_alt = self.get('INDICATED_ALTITUDE')
            if ap_type == HEADING_MODE:
                print(f'Engaging heading hold at {value} degrees')
                self.set('AUTOPILOT_HEADING_LOCK_DIR', value)
            return value
        return None

    def toggle_auto_pilot(self):
        print("toggling autopilot")
        self.auto_pilot_enabled = not self.auto_pilot_enabled
        if self.auto_pilot_enabled:
            self.prev_call_time = time.perf_counter()
            self.schedule_ap_call()
        return self.auto_pilot_enabled

    def try_run_auto_pilot(self):
        try:
            self.run_auto_pilot()
        except OSError:
            global crashed
            crashed = True
            print("OSError encountered, halting autopilot.")
            import traceback
            traceback.print_exc()

    def run_auto_pilot(self):
        """
        This is our master autopilot entry point,
        grabbing the current state from MSFS, and
        forwarding it to the relevant AP handlers.
        """
        if crashed:
            return

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

        on_ground = self.get('SIM_ON_GROUND')
        speed = self.get('AIRSPEED_TRUE')
        bank = self.get('PLANE_BANK_DEGREES')
        turn_rate = self.get('TURN_INDICATOR_RATE')
        lat = self.get('PLANE_LATITUDE')
        long = self.get('PLANE_LONGITUDE')
        heading = self.get('PLANE_HEADING_DEGREES_MAGNETIC')
        true_heading = self.get('PLANE_HEADING_DEGREES_TRUE')
        alt = self.get('INDICATED_ALTITUDE')
        vspeed = self.get('VERTICAL_SPEED')
        trim = self.get('ELEVATOR_TRIM_POSITION')
        a_trim = self.get('AILERON_TRIM_PCT')
        # Why are these two tuples instead of floats?
        (trim_limit_up,) = self.get('ELEVATOR_TRIM_UP_LIMIT'),
        (trim_limit_down,) = self.get('ELEVATOR_TRIM_DOWN_LIMIT'),

        if (speed and bank and turn_rate and lat and long and heading and true_heading and alt and vspeed and trim and a_trim and trim_limit_up and trim_limit_down) is None:
            return print(', '.join([
                f'speed: {test(speed)}',
                f'bank: {test(bank)}',
                f'turn rate: {test(turn_rate)}',
                f'lat: {test(lat)}',
                f'long: {test(long)}',
                f'heading: {test(heading)}',
                f'true_heading: {test(true_heading)}',
                f'alt: {test(alt)}',
                f'vspeed: {test(vspeed)}',
                f'trim: {test(trim)}',
                f'limit: {test(trim_limit_up)}, {test(trim_limit_down)}',
            ]))

        state = State(
            on_ground=(on_ground == 1),
            altitude=alt,
            speed=speed,
            latitude=lat,
            longitude=long,
            heading=heading,
            true_heading=true_heading,
            bank_angle=bank,
            turn_rate=turn_rate,
            vertical_speed=vspeed,
            pitch_trim=trim,
            pitch_trim_limit=[trim_limit_up, trim_limit_down],
            aileron_trim=a_trim,
            prev_state=self.prev_state,
        )

        # If we're close a waypoint, remove it.
        if len(self.waypoints) > 0:
            waypoint = self.waypoints[0]
            if get_distance_between_points(lat, long, waypoint.lat, waypoint.long) < 0.2:
                self.waypoints.remove(waypoint)

        # Are we in auto-takeoff?
        if self.modes[AUTO_TAKEOFF]:
            auto_takeoff(self, state)

        # Do we need to level the wings / fly a specific heading?
        if self.modes[LEVEL_FLIGHT]:
            fly_level(self, state)

        # Do we need to hold our altitude / fly a specific altitude?
        if self.modes[VERTICAL_SPEED_HOLD]:
            vertical_hold(self, state)

        self.prev_state = state


48.97532966243437, -123.70450624063572
