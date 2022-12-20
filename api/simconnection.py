from threading import Timer
from time import time
from SimConnect import *


class SimConnection():
    def __init__(self):  # throws ConnectionError if no sim is running
        self.connected = False
        self.sim_events = []
        self.sim_running = 0
        self.reset_position = False

    def handle_id_event(self, eventId):
        self.sim_events.append(eventId)
        self.sim_running = eventId
        sequence = self.sim_events[-3:]
        if sequence == [1, 0, 3]:
            # unix timestamp in milliseconds
            self.reset_position = int(time() * 1000)

    def handle_simobject_event(self, event):
        # print(event)
        pass

    def handle_exception_event(self, exception, definition):
        # print(exception, definition)
        pass

    def connect(self):
        print("Connecting to simulator...")
        try:
            self.sm = SimConnect(self)
            self.connected = True
            self.aq = AircraftRequests(self.sm, _time=200)
            self.ae = AircraftEvents(self.sm)
            camera = self.get_property_value("CAMERA_STATE")
            if camera is not None and camera <= 6:
                self.sim_running = 3

        except ConnectionError:
            seconds = 5.0
            print(f'No simulator found, retrying in {seconds}s')
            Timer(seconds, self.connect, [], {}).start()

    def get_property_value(self, name):
        # Special property for determining whether the user's playing the sim or not
        if name == "SIM_RUNNING":
            camera = self.get_property_value("CAMERA_STATE")
            running = self.sim_running == 3 and camera is not None and camera <= 6
            if running:
                return 3 + (camera) / 10
            return 0

        # Special property for determining whether the user's paused on the menu
        if name == "SIM_PAUSED":
            return self.sim_running == 2

        # Special property for determining whether the flight got reset. This value
        # gets wiped once requests, so you only get that signal once per reset.
        if name == "FLIGHT_RESET":
            return self.reset_position

        return self.get_standard_property_value(name)

    def get_standard_property_value(self, name):
        try:
            value = self.aq.get(name)
        except OSError:
            self.disconnect()
            return None

        try:
            value = value.decode("utf-8")
        except:
            pass

        return value

    def get_property_values(self, *args):
        return [self.get_property_value(name) for name in args]

    def set_property_value(self, name, value):
        self.aq.set(name, float(value))

    def disconnect(self):
        if self.connected:
            self.sm.exit()
            self.connected = False

    def in_game(self):
        camera = self.get_property_value('CAMERA_STATE')
        return camera is not None and camera <= 6
