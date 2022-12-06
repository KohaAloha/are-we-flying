"""
curl http://localhost:8080/?get=ELEVATOR_TRIM_POSITION,ELEVATOR_TRIM_INDICATOR,AILERON_TRIM,AILERON_POSITION,RUDDER_TRIM,RUDDER_POSITION,SPOILER_AVAILABLE,PRESSURE_ALTITUDE,PLANE_ALTITUDE,INDICATED_ALTITUDE,GROUND_ALTITUDE
curl http://localhost:8080/?get=GAMEPLAY_CAMERA_FOCUS
"""
from threading import Timer
from SimConnect import *
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse
from time import time
import json

host_name = "localhost"
server_port = 8080
sim_connection = None

class ProxyServer(BaseHTTPRequestHandler):
    def set_headers(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Content-type', 'application/json')
        self.end_headers()

    def  log_request(self, code='-', size='-'):
        return

    def do_HEAD(self):
        self.set_headers()

    def do_OPTIONS(self):
        self.set_headers()

    def do_GET(self):
        self.set_headers()
        if not sim_connection.connected:
            return self.wfile.write(json.dumps(None).encode('utf-8'))

        # Is MSFS even running?
        if '/connected' in self.path:
            data = True

        # Handle API calls
        else:
            data = self.get_api_response()

        # make sure the response is never empty
        if data != None:
            data = json.dumps(data).encode('utf-8')
        else:
            data = "{}";
        self.wfile.write(data)

    def do_POST(self):
        self.set_headers()
        query = urlparse(self.path).query
        data = False
        if query != '':
            (prop, value) = query.split("=")
            prop = prop.replace("%20","_")
            data = sim_connection.set_property_value(prop, value)
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def get_api_response(self):
        key_values = None
        query = urlparse(self.path).query
        if query != '':
            terms = query.split("&")
            if len(terms) > 0:
                key_values = dict(qc.split("=") for qc in terms)
                if 'get' in key_values:
                    props = [s.replace("%20","_") for s in key_values['get'].split(",")]
                    for prop in props:
                        key_values[prop] = sim_connection.get_property_value(prop)
        return key_values


class SimConnection():
    def __init__(self): # throws ConnectionError if no sim is running
        self.connected = False
        self.sim_events = []
        self.sim_running = 0
        self.reset_position = False

    def handle_id_event(self, eventId):
        self.sim_events.append(eventId)
        self.sim_running = eventId
        sequence = self.sim_events[-3:]
        if sequence == [1,0,3]:
            self.reset_position = int(time() * 1000) # unix timestamp in milliseconds

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

def run():
    global sim_connection
    sim_connection = SimConnection()
    sim_connection.connect()

    try:
        webServer = HTTPServer((host_name, server_port), ProxyServer)
        print(f'Server started http://{host_name}:{server_port}')
        webServer.serve_forever()
    except KeyboardInterrupt:
        sim_connection.disconnect()
        webServer.server_close()
        print('Server stopped')


if __name__ == "__main__":
    run()
