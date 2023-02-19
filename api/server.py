import os
import json
from autopilot import AutoPilot
# from importlib import reload
from threading import Timer
from simconnection import APSimConnection
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

host_name = "localhost"
server_port = 8080
sim_connection: APSimConnection = None
auto_pilot: AutoPilot = None


class ProxyServer(BaseHTTPRequestHandler):
    def set_headers(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', '*')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Content-type', 'application/json')
        self.end_headers()

    def log_request(self, code='-', size='-'):
        return

    def do_GET(self):
        ### print('[GET]: ', self.path)

        self.set_headers()
        if not sim_connection.connected:
            return self.wfile.write(json.dumps(None).encode('utf-8'))

        # Is MSFS even running?
        if '/connected' in self.path:
            data = True

        # Is our python-based autopilot running?
        if '/autopilot' in self.path:
            data = json.dumps(auto_pilot.get_auto_pilot_parameters())

        # Handle API calls
        else:
            data = self.get_api_response()

        # make sure the response is never empty
        if data != None:
            data = json.dumps(data).encode('utf-8')
        else:
            data = json.dumps(dict()).encode('utf-8')
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.set_headers()
        self.wfile.write(b'okay')

    def do_PUT(self):
        # for adding waypoints
        print(self.path)
        query = urlparse(self.path).query
        args = parse_qs(query)
        if 'location' in args:
            values = args['location'][0].split(',')
            auto_pilot.add_waypoint(*values)
        self.set_headers()
        self.wfile.write(json.dumps(
            auto_pilot.get_auto_pilot_parameters()).encode('utf-8'))

    def do_DELETE(self):
        # for removing waypoints
        print(self.path)
        query = urlparse(self.path).query
        args = parse_qs(query)
        if 'location' in args:
            lat, long = args['location'][0].split(',')
            auto_pilot.remove_waypoint(lat, long)
        self.set_headers()
        self.wfile.write(json.dumps(
            auto_pilot.get_auto_pilot_parameters()).encode('utf-8'))

    def do_POST(self):
        print('[POST]: ', self.path)
        global auto_pilot, sim_connection

        query = urlparse(self.path).query
        self.set_headers()

        if '/autopilot' in self.path:
            if query == '':
                ap_state = auto_pilot.toggle_auto_pilot()
                result = {'AP_STATE': ap_state}
            else:
                query = parse_qs(query)
                ap_type = query['type'][0]
                ap_target = query['target'][0] if 'target' in query else None
                if ap_target is not None:
                    value = float(ap_target) if ap_target != 'false' else None
                    ap_state = auto_pilot.set_target(ap_type, value)
                else:
                    ap_state = auto_pilot.toggle(ap_type)
                result = {'AP_TYPE': ap_type, 'AP_STATE': ap_state}
            return self.wfile.write(json.dumps(result).encode('utf-8'))

        # it is not, forward to SimConnect
        data = False
        if query != '':
            (prop, value) = query.split("=")
            prop = prop.replace("%20", "_")
            data = sim_connection.set(prop, value)
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def get_api_response(self):
        key_values = dict()
        query = urlparse(self.path).query
        args = parse_qs(query)
        if 'get' in args:
            params = args['get'][0].split(",")
            props = [s.replace("%20", "_") for s in params]
            for prop in props:
                key_values[prop] = sim_connection.get(prop)
        return key_values


def run():
    global auto_pilot, sim_connection
    sim_connection = APSimConnection()
    sim_connection.connect()
    auto_pilot = AutoPilot(sim_connection)

    try:
        webServer = HTTPServer((host_name, server_port), ProxyServer)
        print(f'Server started http://{host_name}:{server_port}')
        webServer.serve_forever()
    except KeyboardInterrupt:
        sim_connection.disconnect()
        webServer.server_close()
        print('Server stopped')
        os._exit(1)
    except OSError as error:
        print(error)
        print("I'm going to exit now, but at least hopefully we can debug?")


if __name__ == "__main__":
    run()
