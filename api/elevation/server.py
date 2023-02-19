import os
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
from alos import ALOS30m

HOST = '127.0.0.1'
PORT = 9000
DATA_FOLDER = '\\\\192.168.1.5\\Storage\\General\\Games\\MSFS\\ALOS World 3D (30m)\\data'

# make sure we know what data we have available
mark = time.time()
print("Indexing dataset...")
interface = ALOS30m(DATA_FOLDER)
print("Dataset indexed in %.2fs (%d tiles found)" %
      (time.time() - mark, len(interface.files),))


class OpenElevationServer(BaseHTTPRequestHandler):
    def set_headers(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Headers','*')
        self.send_header('Access-Control-Allow-Methods','*')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Content-type', 'application/json')
        self.end_headers()

    def log_request(self, code='-', size='-'):
        # Don't log regular requests, only errors
        return

    def do_GET(self):
        """
        GET method. Uses query_to_locations.
        :return:
        """
        if self.path == '/favicon.ico':
            return self.send_response(404)

        query = parse_qs(urlparse(self.path).query)
        if 'locations' not in query:
            self.set_headers()
            return self.send_response(400)

        locations = [l.split(',') for l in query['locations'][0].split('|')]

        # mark = time.time()
        data = {
            'results': [
                {
                    'latitude': lat,
                    'longitude': lng,
                    'elevation': interface.lookup(lat, lng)
                } for lat, lng in locations
            ]
        }
        response = json.dumps(data).encode('utf-8')
        # print("response formed in %.3fms" % (time.time() - mark,))
        self.set_headers()
        self.wfile.write(response)


def run():
    try:
        webServer = HTTPServer((HOST, PORT), OpenElevationServer)
        print(f'Elevation server started on http://{HOST}:{PORT}')
        print('API: /?locations=lat,long|lat,long|... (one pair required, subsequent pairs optional)')
        webServer.serve_forever()
    except KeyboardInterrupt:
        webServer.server_close()
        print('Server stopped')
        os._exit(1)


if __name__ == "__main__":
    run()
