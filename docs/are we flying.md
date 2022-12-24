# Flying Planes with Python and JavaScript



<figure style="width: 40%; margin: auto;" >
    <img src="python-flying-airplane.png" alt="A python trying to fly an airplane"/>
    <figcaption style="font-style: italic; text-align: center;">Flying planes with Python, you say?</figcaption>
</figure>

To allay any concerns: this will not be actually running Python or JavaScript software in a cockpit of a real aircraft in order to effect automated flight: that would kill people. Instead, we're writing a web page that can control an autopilot running in Python that in turn controls a little virtual aeroplane. And by "little" I actually mean "any aeroplane in [Microsoft Flight Simulator](https://www.flightsimulator.com/)" because as it turns out, MSFS comes with an API that can be used to both query _and set_ values relating from anything as simple as the current airspeed to something as complex as spawning a fleet of aircraft and making them perform formation flights while making their smoke pattern spell out the works of Chaucer in its original middle English.

While we're not doing that (today), we *are* going to write an autopilot for planes that don't have one, as well as planes that do have one but that are just a 1950's chore to work with, like the one in my favourite real-life plane, the [DeHavilland DHC-2 "Beaver"](https://en.wikipedia.org/wiki/De_Havilland_Canada_DHC-2_Beaver), originally made by DeHavilland but these days made by [Viking Air](https://www.vikingair.com/viking-aircraft/dhc-2-beaver). Specifically, the float plane version, which flies between [Vancouver](https://www.openstreetmap.org/relation/2218280) and Eastern [Vancouver Island](https://www.openstreetmap.org/relation/2249770) and locations dotted around the [Strait of Georgia](https://www.openstreetmap.org/relation/13321885)). I don't have a pilot's license, but the nice thing about tiny flights is that you regularly get to sit in the copilot seat, and enjoy beautiful British Columbia from only 300m up.

<figure style="width: 40%; margin: auto;" >
    <img src="ha-flights.png" alt="Local floatplane routes"/>
    <figcaption style="font-style: italic; text-align: center;">In case anyone is visiting Vancouver...</figcaption>
</figure>

But back to Python and JavaScript: MSFS comes with an SDK called the [SimConnect SDK](https://docs.flightsimulator.com/html/Programming_Tools/SimConnect/SimConnect_SDK.htm) that lets people write addons for the game using C, C++, or languages with .NET support, and so of course folks have been writing connectors in those languages to "proxy" the SimConnect calls to officially unsupported languages like Go, Node, Python, etc. And so, of course, my first thought was "cool, I can write an express server that connects to MSFS?" Except the reality is that: no, at least not directly. The `node-simconnect` package is rather incomplete, and so instead we reach for the next best thing: [python-simconnect](https://pypi.org/project/SimConnect/). We now need two languages, but they're both fairly easy to work with so why not.

Using `python-simconnect`, we can write a tiny Python webserver with `GET` calls for querying MSFS, and `POST` calls for setting values in-sim. Although it turns out that even `python-simconnect` is incomplete (although far less so), so we're actually using [a fork I made](https://github.com/Pomax/Python-SimConnect/tree/edits) that makes some improvements we need to in order to tell all the different states that MSFS can be in apart, as well as adding a few missing sim variables, and renaming some that had the wrong name.  

Using that, we can write some good old static HTML with some plain JS that uses [the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) to talk to our simple Python API server for all its needs.

### A simple Python API server

Let's write a simple Python script that sets up a "SimConnection" object (which will handle all the MSFS connector logic), a `GET` route for getting values out of MSFS, and a `POST` route for setting values in MSFS.

```python
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
from simconnection import SimConnection

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

    def log_request(self, code='-', size='-'):
        # We don't want to see every GET and POST, there's going to
        # be way too many. We just want to see requests with errors.
        return

    def do_GET(self):
        self.set_headers()

        # If we don't have MSFS running, there is no point in trying
        # to do anything: we have no connection to the sim.
        if not sim_connection.connected:
            return self.wfile.write(json.dumps(None).encode('utf-8'))

        # If we get here, we know MSFS is running, so we create
        # a special route that can be fetch()ed to check.
        if '/connected' in self.path: data = True

        # for any other route, we treat it as API call.
        else: data = self.get_api_response()

        # and then send the data as http response, making sure the
        # response is never empty.
        if data != None: data = json.dumps(data).encode('utf-8')
        else: data = "{}"
        self.wfile.write(data)

    def do_POST(self):
        self.set_headers()
        # For posts, we set values directly from the URL rather than
        # trying to parse a POST payload, based on name=val pairs.
        data = False
        query = urlparse(self.path).query
        if query != '':
            (prop, value) = query.split("=")
            # but we do want to make sure that any spaces are made safe.
            prop = prop.replace("%20", "_")
            data = sim_connection.set_property_value(prop, value)
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def get_api_response(self):
        # This gets called as GET handler: it uses ?get=name1,name2,name3,[...]
        key_values = None
        query = urlparse(self.path).query
        if query != '':
            terms = query.split("&")
            if len(terms) > 0:
                key_values = dict(qc.split("=") for qc in terms)
                if 'get' in key_values:
                    props = [s.replace("%20", "_")
                             for s in key_values['get'].split(",")]
                    for prop in props:
                        key_values[prop] = sim_connection.get_property_value(
                            prop)
        return key_values

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

```

Of course the `SimConnection` is doing a fair bit of heavy lifting here, so have a look at [its code here](https://gist.github.com/Pomax/4349a9259426c8af7a6347d2c91e11d8) if you want to know what it's doing  when we call `get_property_value` or `set_property_value`.

With that part covered, we can start writing a webpage that talks to MSFS!

## Are we flying?

We'll start with a super basic webpage that just checks whether we're even flying a plane in MSFS at all. After all, if we're not flying, there's nothing to autopilot.

We'll need to check a few things:

1. Is the API server running?
2. Is MSFS running? 
3. Are we "playing" instead of navigating the menus?
4. If all the above are true, what are the various bits of flight information, like speed, altitude, etc.?

***(image of the above flowchart)***

### Are we in-game?

Tackling points 1 and 2 above are trivial, because they're either a network error, or the server will simply go "I can't give you any data" and we can catch that, so let's move on to question 3: are we playing the game instead of navigating the menu system?

And in fact, let's sidestep that one, too, because it turns out MSFS has no good way to tell you that. Rather than an easy to query variable, MSFS expects you to be monitoring game state transition events, and we're obviously not going to do that, so instead I updated `python-simconnect` to have a special variable that's not in the SimConnect SDK itself: `SIM_RUNNING`, which is an `int.int` formatted value. The leading number is one of 0, 1, 2, or 3, where the value 3 means we're playing the game, 2 means we've paused the game, and 1 or 0 tells us we're navigating the menu system out-of-game. The trailing number represents the current game camera angle (a number between 2 and 25) which we can use to determine whether we're legitimately flying the plane, or whether we're in [slew mode](https://www.flightsim.com/vbfs/showthread.php?286073-What-the-heck-is-quot-slew-quot-mode) or the like.

So let's query the python server for that variable!

```javascript
async function checkForPlaying() {
  const response = await fetch(`http://localhost:8080/?get=SIM_RUNNING`)
  const { SIM_RUNNING: runFlag } = await response.json();
  if (runFlag >= 3) waitForEngines();
  else setTimeout(() => checkForPlaying(), 1000);
}
```

And that's all we need: run this function until the `SIM_RUNNING` value is `3` and then call whatever function starts our real code.

And let's make a little helper function for getting API values, because we'll be doing that a lot:

```javascript
function getAPI(...props) {
  return fetch(`/api/?get=${props.join(`,`)}`).then(res => res.json());
}
```

We can now rewrite the above function as:

```javascript
async function checkForPlaying() {
  const { SIM_RUNNING: runFlag } = await getAPI(`SIM_RUNNING`);
  if (runFlag >= 3) waitForEngines();
  else setTimeout(() => checkForPlaying(), 1000);
}
```

Nice. Now let's write some code!

### What are we doing?

There's a whole bunch of parameters we can query MSFS for, so here are the ones we're going to be interested in (with the more elaborate documentation found on the MSFS SimConnect [Simulation Variables](https://docs.flightsimulator.com/html/Programming_Tools/SimVars/Simulation_Variables.htm) page):

1. `AIRSPEED_TRUE`: how fast the plane is flying, in knots (1kts being 101.269 feet per minute)
1. `GROUND_ALTITUDE`: how high above (or below) sea level the ground below the plane sits, in feet.
1. `INDICATED_ALTITUDE`: how high the plane claims it's flying, in feet (which might be wrong!)
1. `PLANE_ALT_ABOVE_GROUND`: how high above the ground we are, in feet.
1. `PLANE_BANK_DEGREES`: how much we're pitching left or right, in radians.
1. `PLANE_HEADING_DEGREES_MAGNETIC`: The compass direction we're flying in, in radians.
1. `PLANE_HEADING_DEGREES_TRUE`: The actual direction we're flying in, because a compass can be wrong!
1. `PLANE_LATITUDE`: our north/south GPS coordinate.
1. `PLANE_LONGITUDE`: our east/west GPS coordinate.
1. `PLANE_PITCH_DEGREES`: how much the plane is pitching up or down, in radians. But because of how flight works, the plane pitching up does not necessarily mean we're actually _moving_ up. For that, we want...
1. `VERTICAL_SPEED`: the speed at which we're either gaining or losing altitude, in feet per minute.
1. `SIM_ON_GROUND`: this tells us whether the plane is actually on the ground or in the air.

With these twelve values, we can do a lot!

#### Are the engines running?

But one thing we can't do is tell whether the plane's actually "on". Some people like to jump into the game with the plane ready to go, but others like to play for realism and start with the plane "cold and dark", meaning nothing's turned on and you need to wait just as long as in real life before the engines are ready to start flying. In order to check for this, we query MSFS for the following values first:

1. `ENGINE TYPE`: This tells us what kind of engine (including "none" because gliders are a thing!) we have.
2. `ENG_COMBUSTION:1`:         Planes can have up to four engines so these four
3. `ENG_COMBUSTION:2`:           values let us see whether any of them are fired
4. `ENG_COMBUSTION:3`:           up or not, because even if a plane has four engines,
5. `ENG_COMBUSTION:4`:           it might not use all of them.

With these values, we can "wait" with reporting the other twelve values until we know the plane's "working":

```javascript
const ENGINE_DATA = [`ENGINE_TYPE`, `ENG_COMBUSTION:1`, ... , `ENG_COMBUSTION:4`]

async function waitForEngines() {
  const data = await getAPI(...ENGINE_DATA);
  if (data.ENGINE_TYPE === 2) {
      // this is the "this plane has no engines" value!
      return startMonitoringFlightData();
  }
  const enginesRunning = [1,2,3,4].some(id => data[`ENG_COMBUSTION:${id}`]));
  if (enginesRunning) startMonitoringFlightData();
  else setTimeout(() => waitForEngines(), 1000);
}
```

And with that, we can move on to our "flight analysis":

### What are we doing? (part 2)

We're going to poll the server for value updates every second, and then process the data we get back:

```javascript
const FLIGHT_DATA = [`AIRSPEED_TRUE`, `GROUND_ALTITUDE`, ... , `SIM_ON_GROUND` ]

async function startListening() {
  setInterval(() => update(await getAPI(...FLIGHT_DATA)), 1000);
}

async function update(data) {
  // Quick check, just to be safe:
  if (data.PLANE_LATITUDE === undefined) return;

  // Some flight details
  const vector = {
    lat: data.PLANE_LATITUDE,
    long: data.PLANE_LONGITUDE,
    airBorn: data.SIM_ON_GROUND === 0 || this.vector.alt > this.vector.galt + 30,
    speed: data.AIRSPEED TRUE,
    vspeed: data.VERTICAL_SPEED,
    alt: data.INDICATED_ALTITUDE,
    palt: data.PLANE_ALT_ABOVE_GROUND - this.state.cg,
    galt: data.GROUND_ALTITUDE,
  };
    
  // And the general orientation information
  const orientation = {
    heading: deg(data.PLANE_HEADING_DEGREES_TRUE),
    pitch: deg(data.PLANE_PITCH_DEGREES),
    bank: deg(data.PLANE_BANK_DEGREES),
    yaw: deg(
      data.PLANE_HEADING_DEGREES_MAGNETIC - data.GPS_GROUND_TRUE_TRACK
    ),
  };
    
  doCoolThingsWithOurData(vector, orientation);
}
```

We can now start writing whatever we like in our `doCoolThingsWithOurData(vector, orientation)` function, like drawing our plane on a map, or showing a web version of the plane's cockpit dashboard. 

### What are we doing? (part 3)

In order to make sure we know what our autopilot will be doing (remember, that was our original intention!) let's draw our plane on a map, so we can see what it's doing, and plot some of its flight data on a graph while we're flying:

```javascript
const { sqrt, max } = Math;

// We'll be using Leaflet, a free mapping library, which creates a gloabl "L" object.
const DUNCAN_AIRPORT = [48.756669, -123.711434]
const map = L.map("map").setView(DUNCAN_AIRPORT, 15);
const openStreetMap = L.tileLayer(
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
  {
    maxZoom: 19,
    attribution: `© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>`,
  }
);
openStreetMap.addTo(map);
const props = { icon: L.divIcon({ html: `<img id="plane-icon" src="airplane.png">` })};
const plane = L.marker(DUNCAN_AIRPORT, props).addTo(map);
      
async function doCoolThingsWithOurData(vector, orientation) {
  const { lat, long } = vector;
  const pair = [lat, long];
  map.setView(pair);
  plane.setLatLng(pair);

  const planeIcon = document.querySelector(`#plane-icon`);
  const { heading } = orientation;
  planeIcon.style.setProperty(`--deg`, heading | 0);
}
```

With that, we have a map that shows our plane, and when we're flying, updates our plane location and makes sure to center the map on its new location.

***(image of leaflet map with plane icon on it)***

But... it will look wrong pretty much all the time because it won't be turned in the right direction, so let's fix that with some CSS:

```css
#plane-icon {
  --deg: 0;
  --icon-width: 100px;
  --icon-height: 100px;
  --w: calc(var(--image-width) / 2);
  --h: calc(var(--image-height) / 2);
  position: relative;
  top: calc(0 - var(--w));
  left: calc(0 - var(--h));
  transform-origin: var(--w) var(--h);
  transform: rotate(1deg * var(--deg));
}
```

Now our plane will not just be pinned in the right place, but it'll also turn to face the right direction.

***(image of leaflet map with plane icon on it, pointing in the right direction)***

That just leaves graphing some flight information every time the `doCoolThingsWithOurData` function runs. The easiest plotting framework is actually built right into HTML: SVG. All we need to do is track `<path>` elements that we add new values to every time there's new data. Rather than spend time on how to write that code, I'm just going to drop [this link](https://gist.github.com/Pomax/de7707ae17c76caae4dabf7806dbd816) here, which is our entire grapher in <200 lines of code. Mixing that in:

```javascript
import { setupGraph } from "./svg-graph.js";
let graph;

...

async function startListening() {
  // set up our graph before we start listening for flight data
  graph = setupGraph(document.body, 600, 400);
  graph.start();
  graph.setProperties(`ground`, {
    fill: {
      baseline: 0,
      color: `saddlebrown`,
    },
  });

  // ...then start listening for flight data =)
  setInterval(() => update(await getAPI(...FLIGHT_DATA)), 1000);
}

...

async function doCoolThingsWithOurData(vector, orientation) {
  const { alt, galt, vspeed } = vector;
  const { heading, pitch, bank, yaw, trim } = orientation;

  ...
  
  graph.addValue(`altitude`, alt);
  graph.addValue(`pitch`, pitch);
  graph.addValue(`trim`, trim);
  graph.addValue(`bank`, bank);
  graph.addValue(`vspeed`, vspeed);
  graph.addValue(`ground`, galt);
}
```

And there we go:

***(image of flight data graph)***

We're now finally ready to not just write our autopilot, but also see what it's doing, which is crucially important to understanding what your code's doing. Or doing wrong... O_O

## Creating an autopilot

Before we make our autopilot, we're actually going to switch languages. Don't get me wrong: we _could_ write our autopilot in JS, but we'd much rather not have to deal with the delay of network requests from JS to our Python API server, or the irregular timing of a `setInterval` or `setTimeout` (which is only guaranteed to wait _at least_ the indicated number of milliseconds, _not_ that it will fire after the indicated number of milliseconds). In this case, in order to make sure our code runs fast, and can run at a high speed, steady interval, it's much easier to work in Python. After all, it's talking directly to MSFS.

As such, we're going to extend our little python server to do a bit more: it's going to accept autopilot _instructions_ from a web page, but it'll run the autopilot _logic_ itself. We're going to create an `Autopilot` class that will house all the logic, and we'll update our `do_GET` and `do_POST` code to route anything that comes in for `/autopilot` to that class:

```python
...

from autopilot import Autopilot
auto_pilot = None

def do_GET(self):
    ...

    # Is MSFS even running?
    if '/connected' in self.path:
        data = True

    # Is our python-based autopilot running?
    if '/autopilot' in self.path:
        data = json.dumps(auto_pilot.get_state())

    ...


def do_POST(self):
    ...
    
    self.set_headers()

    # is this an autopilot instructions?
    if '/autopilot' in self.path:
        global auto_pilot
        if query == '':
            ap_state = auto_pilot.toggle_autopilot()
            result = {'AP_STATE': ap_state}
        else:
            query = parse_qs(query)
            ap_type = query['type'][0]
            ap_target = query['target'][0] if 'target' in query else None
            if ap_target is not None:
                value  = float(ap_target) if ap_target != 'false' else None
                ap_state = auto_pilot.set_target(ap_type, value)
            else:
                ap_state = auto_pilot.toggle(ap_type)
            result = {'AP_TYPE': ap_type, 'AP_STATE': ap_state}
        return self.wfile.write(json.dumps(result).encode('utf-8'))

    ...

    
def run():
    global auto_pilot, sim_connection
    sim_connection = SimConnection()
    sim_connection.connect()
    auto_pilot = AutoPilot(sim_connection)

    ...
```

You can see that there's going to be three important function:

- `autopilot.get_state()` which will give us a JSON readback of the various settings in our autopilot,
- `autopilot.set_target()` which lets us set an autopilot property to a specific value, and
- `autopilot.toggle()` which lets us toggle an autopilot feature from on to off, or off to on.

With that out of the way, we can get down to the business of thinking about, and implementing, our autopilot code.

### How does an autopilot work?

At its core, an autopilot is a system that lets a plane fly "in a straight line". However, there are two different flavours of "straight line" we need to think about, because we're not driving on a road, we're flying through the air:

1. we can fly in a straight line without tipping left or right.
1. we can fly in a straight line without pitching up or down, and

The first of these is achieved using, in autopilot parlance, **level mode**, and the second using **vertical hold**. You can see where the names come from: the first keeps the plane (roughly!) pointing in the same compass direction, while the second keeps the plane at (again roughly!) the same vertical position in the sky.

More fully featured autopilots extend these two modes by adding **altitude hold**, which effectively runs vertical hold "at (roughly!) a specific altitude", with additional logic to get us from one altitude to another if we need to change that, as well as by adding **heading mode**, which effectively runs level mode "for (again, roughly!) a specifc compass direction", again with additional logic to get us from one direction to another if we need to change that.

### Implementing Level Mode

We start by observing that we _could_ try to take all our aeroplane's flight data, then run a bunch of maths on the numbers we get in order to predict when we need to perform which operations in order to make sure that our plane does the right thing, but this will be a losing proposition: the weather, air density changes, random updrafts, terrain-induced wind, etc. is all going to interfere with any predictions we'd make.

So, instead, we're going to implement our autopilot as a _reactionary_ system: it looks at what the current flight data is, and then put in small corrections that'll push us away from the wrong direction, and we repeat that process over and over and over, every time looking at the new flight data, and then saying which new corrections to make. The trick to a working autopilot based on this approach is if we can do this in a way that makes the corrections smaller and smaller every time we run, we barely have to correct anything after a while: the plane will just be flying the way we want it to.

For level mode, this means we're going to simply check "is the plane tilting?" and if so, we move the **aileron trim**—a value that "biases" the plane to tilt left or right—a little in the opposite direction. As long we do that for long enough, we'll eventually have the plane flying nice and steady. You can think of this as "moving the center of gravity" of the plane (even though of course that's not what's really happening), so let's write some code:

```python
def fly_level(self, speed, bank, heading):
    bank = degrees(bank)
    self.lvl_center += constrain_map(bank, -5, 5, -2, 2)
    self.api.set_property_value('AILERON_TRIM_PCT', (self.lvl_center + bank)/180)
```

So what are we doing here?

- First, we get the amount we're tilting left or right, which in airplane terminology is its **bank**,
- Next, we determine by how much to shift our "center of gravity". We turn the bank value into degrees (mostly for code cosmetics reasons) and then we scale the value down, so that numbers in the interval [-5,5] now sit in the internval [-2,2] instead. For instance, -5 becomes -2, -2.5 becomes -1, 0 stays 0, etc. However, we also _constrain_ the values so that anything less than -5 still maps to -2, and anything greater than 5 still maps to 2.
- We update our variable that records the "center of gravity", and then,
- we tell MSFS to update the actual airplane control value for aileron trim, by setting it to the average of the _opposite_ of the current bank value (the bank value and the trim values use opposite signs for the same direction), and our center of gravity. the 180 comes from dividing the average of our bank and center of gravity, `(bank + center)/2`, by 90 degrees.

And that's it, level hold implemented! There's... not a lot to do. We can tweak that `constrain_map` so that we add smaller or larger shifts at each step, with the tradeoff being that the larger the step, the more likely we are to overshoot our correction, leading to the plane to "bob and weave" for a while before it's finally flying level.

So that was easy, what about vertical hold?

### Implementing Vertical Hold

In order to achieve vertical hold, rather than adjusting the aileron trim based on the plane's bank angle, we're going to adjust the pitch (or "elevator") trim based on the plane's vertical speed. However, rather than just look at the vertical speed, creatively called `VS`, we also want to look at the vertical _acceleration_ because there's some important information there. Ultimately, we want to reach a vertical speed of zero, meaning we're not climbing or descending, with a vertical acceleration of zero, meaning we're also not _about_ to start climbing or descending. The problem is that these are competing end goals: if we reach an acceleration of zero first, we're never going to reach a VS or zero, so we need to make sure that whatever changes we make based on acceleration are less impactful than the changes we make based on VS.

So, let's write some code:

```python
def hold_vertical_speed(self, alt, speed, vspeed, trim):
    vs_target = 0  # self.modes[VERTICAL_SPEED_HOLD]
    vs_diff = vs_target - vspeed
    vs_max = 10 * speed
    dvs = vspeed - self.prev_vspeed
    dvs_max = speed / 2

    # Let's start with an optimistic 0 as the correction for our pitch trim:
    correct = 0

    # Then, we make our step size contingent on how fast this plane is going:
    step = map(speed, 50, 150, MSFS_RADIAN / 200, MSFS_RADIAN / 100)

    # Then, as mentioend, we want both VS *and* acceleration (dVS) to become zero.
    correct += constrain_map(vs_diff, -vs_max, vs_max, -step, step)
    correct += constrain_map(dvs, -dvs_max, dvs_max, step, -step)

    # Apply the resultant correction, and store our VS so we can determine dVS next time
    self.api.set_property_value('ELEVATOR_TRIM_POSITION', trim + correct)
    self.prev_vspeed = vspeed
```

The first part basically sets up the various values we'll need: our vertical hold target speed, which is just zero, the difference between our target and our current vertical speed, the maximum vertical speed we consider safe (which is not necessarily going to be true!), our acceleration (named "dvs" for "delta vertical speed"), and the most we want our acceleration to be. We then start with a trim correction of zero, and add two values to that:

1. the correction based on how far off our vertical speed is from our target, and
2. the correction based on how far off our acceleration is from zero.

Both of these impart a correction based on how close to their maximum permitted values they are. The closer to the max, the stronger the correction, with the correction capped to `step` because if we didn't limit that, we'd be able to shoot off to the moon just to compensate for being too low. Or worse, plow into the ground because we were climbing a bit too much.

However, _there is a problem with this code_: it works, but because of the competition between VS and dVS, it kind of lingers on non-zero values either above or below zero for much longer than we want.

***(image of VS plotted over time)***

In order to deal with that, we're going to add an extra bit of code:

```python
correct += constrain_map(vs_diff, -vs_max, vs_max, -step, step)
correct += constrain_map(dvs, -dvs_max, dvs_max, step, -step)

# special handling for when we're close to our target
if abs(vs_diff) < 200 and abs(alt_diff) < alt_hold_limit:
    vs_correct = constrain_map(vs_diff, -200, 200, -step / 4, step / 4)
    if abs(vs_correct) > 0.0003:
        correct += copysign(0.0003, vs_correct);
    else:
        correct += vs_correct
        correct += constrain_map(dvs, -20, 20, step / 9.99, -step / 10)

# Apply the resultant correction, and store our VS so we can determine dVS next time
self.api.set_property_value('ELEVATOR_TRIM_POSITION', trim + correct)
self.prev_vspeed = vspeed
```

This new code kicks when we're close to the target (either above or below), and adds an extra correction based on both vertical speed and acceleration, but with more weight to vertical speed, with an extra rule that makes sure that there is always a vertical speed correction, and that if that correction would normally be so small as to offer no counter to the acceleration correction, we instead process a small vertical speed correcetion _without_ running the acceleration correction.

And... that's it. Again, not a lot of code, but it does what we need it to, updating our pitch trim so that we end up flying in a straight line. Combined with level mode, we're basically done! This is an autopilot!

### Adding heading mode

Of course, an autopilot that doesn't actually fly in the direction you need it to is kind of... silly? So let's add **heading mode**, where we say which compass direction we want to fly in, and it makes sure we're always pointing in that direction. For this, we're going to update our level mode code with just a few more lines:

```python
def fly_level(self, speed: float, bank: float, heading: float) -> None:
    bank = degrees(bank)
    self.lvl_center += constrain_map(bank, -5, 5, -2, 2)

    if self.modes[HEADING_MODE]:
        heading = degrees(heading)
        target = self.modes[HEADING_MODE]
        hdiff = get_compass_diff(heading, target)
        max_bump = map(speed, 50, 150, 1.2, 2)
        self.lvl_center += constrain_map(hdiff, -10, 10, -max_bump, max_bump)

    self.api.set_property_value('AILERON_TRIM_PCT', (self.lvl_center + bank)/180)
```

These five lines is all we need:

1. get our heading in degrees,

2. get the target heading as entered into the autopilot by the user

3. get the angular difference, for which we need a special function because compass angles wrap around, and there are two possible turns, one shorter than the other. We always want the shortest one:
   ```python
   def get_compass_diff(current: float, target: float) -> float:
       diff: float = (current - 360) if current > 180 else current
       target: float = target - diff
       return target if target < 180 else target - 360
   ```

4. Determine how fast of a turn to allow. For slow planes, turning too fast makes them fall out of the sky, and for fast planes, turning too slowly is really annoying, so for planes going 50 knots (which for most planes is "fall out of the sky" levels of slow, but covers things like ultralight/microlight aircraft) we'll set a maximum correction of 1.2 degrees per update, and for planes going 150 knots we'll set a maximum correction of 2 degrees per update. That doesn't sound like a big difference, but trust me: it is. This is one of those cases where you should absolutely play with the value to see what the effect is. Changing that 2 to a 3, for example, will guaranteed knock your airplane out of the sky =)

5. Finally, we update the center of gravity we're using to fly the plane level, and this is the trick: while for level flight we want "the perfect center of gravity", for turning towards a specific heading, we actually want to kick that center out of alignment a bit, to force the plane to tilt. We've basically written some code that _messes with our original code_ just enough to make the airplane turn for just as long as we need it to.

And that's it, again: not a lot of code, but we now have a heading mode and we can tell our plane to fly where _we_ want it to, rather than where _it_ wants to =)

### Implementing Altitude Hold

Which brings us to the last mode: altitude hold. And if you're thinking "are we going to write some code that messes with vertical hold, the same way heading messes with level mode?" then you're exactly right!

Just like how heading mode works by preventing the leveling code from actually fully leveling the plane until it's pointing in the right direction, we're going to implement altitude hold as a bit of code that prevents vertical hold from reaching zero, instead staying on a value range that either makes the plane climb or descend, until we reach our desired altitude, at which point we let vertical hold do its thing and keep us there.

```python
# special handling for when we're close to our target
if abs(vs_diff) < 200 and abs(alt_diff) < alt_hold_limit:
    correct += constrain_map(vs_diff, -200, 200, -step / 4, step / 4)
    correct += constrain_map(dvs, -20, 20, step / 9.99, -step / 10)

alt_target = self.modes[ALTITUDE_HOLD]
alt_diff = (alt_target - alt) if alt_target else 0
alt_hold_limit = 20
    
# Nudge us up or down if we need to be at a specific altitude
if alt_diff != 0:
    correct += constrain_map(alt_diff, -200, 200, -step, step)

self.api.set_property_value('ELEVATOR_TRIM_POSITION', trim + correct)
self.prev_vspeed = vspeed
```

Two lines of code and we're good. Are, almost: by using the same `step` that VS and dVS use, it's possible for altitude hold to merely cancel out what VS and dVS are doing, so we want two more lines:

```python
if alt_diff != 0:
    alt_correct = constrain_map(alt_diff, -200, 200, -step, step)
    correct += alt_correct
    # If we still have a fair bit of distance to go, but vspeed is already close
    # to zero, trim by twice the amount by simply adding the same correction again:
    if alt_diff > 20 and vspeed < -20:
        correct += alt_correct
    elif alt_diff < -20 and vspeed > 20:
        correct += alt_correct
```

And that'll do it. Now we'll keep climbing or descending until we reach our desired altitude.

Which means we're done!

### Fixing altitude hold so it doesn't kill us

Well... almost. Because while heading mode has a low potential for harm, altitude hold mode can absolutely still kill us by trying to climb or descend too fast. Yes, we have `vs_max` but if we're dropping fast, just a small trim adjustment isn't going to stop us from plummeting to the ground: we might need far more feet to correct for the dive than there are between us and the ground. If we ever get to, because airplanes are ridiculously fragile and while we're plummeting, we're picking up speed, and at some point that speed's going to rip the plane apart. Or, equally bad, we might try to trim up too much and pitch the plane so steeply that we lose lift, and _then_ we plummet to the ground. And the previous two scenarios will still happen but now preceded by a stall.

I think you'll agree none of that is desirable autopilot behaviour, so let's make sure it at least can't kill us by adding some "over-vspeed" protection before considering our autopilot done. First, let's add some code that detect whether our plane's speed is dropping, because if it is, our `vs_max` is too high, and we should climb less quickly.

```python
alt_target = self.modes[ALTITUDE_HOLD]
...
vs_max = 10 * speed - self.vs_max_correction if alt_diff >= 0 else 5 * speed
...
dv = speed - self.prev_speed

if alt_diff > 0 and (dv < 0) and abs(vs_diff) > 200:
    self.vs_max_correction -= constrain_map(dv, -1, 0, 300, 0)
    vs_max = max(vs_max + self.vs_max_correction, 100)

...

# special handling for when we're close to our target
if abs(vs_diff) < 200 and abs(alt_diff) < alt_hold_limit:
   self.vs_max_correction = 0
   ...
```

First, we update our vs_max so that if we're descending, we do so at a safe speed. Then, we introduce a new `prev_speed` that set similar to `prev_vspeed` so that we can see whether or not our air speed's dropping. If it does, and we're climbing, start ramping down the maximum allowed vertical speed. And of course, make sure to reset our corrective value to 0 when we're it's safe to do so.

Then, let's also put in some protection for when someone bumps the trim wheel and accidentally sends us into a death pitch. This won't help _much_ and it's entirely likely that we'd have to disengage the autopilot and manually trim ourselves back to safety, but it's better than nothing:

```python
# special handling for when we're close to our target
...

# "omg, stop, what are you doing??" protection
if (vspeed > 2 * vs_max and dvs > 0) or (vspeed < -2 * vs_max and dvs < 0):
    limit = 10 * vs_max
    kick = 4 * step
    correct += constrain_map(vspeed, -limit, limit, kick, -kick)

# Same trick as for heading: nudge us up or down if we need to be at a specific altitude
if alt_diff != 0:
    alt_correct = constrain_map(alt_diff, -200, 200, -step, step)
    ...
```

This is the one time where we're going to hyper aggressively trim with (relatively) huge values in order to get this plane back under control. If our vspeed is far past its maximum permitted value, and its acceleration is still pushing it further, we add a kick in the opposite direction that is proportional to how much beyond acceptable levels things have gotten. 

## We have an autopilot!

And it's not particularly great, but it works (for the most part) and more importantly, it gives us something to play with. We can refine the way heading mode and altitude hold work, we can tweak numbers to see what happens, we can invent new interpolation functions to use instead of `constrain_map`, there's a lot we can do!

Me, I'm going to fly a [Top Rudder](https://www.toprudderaircraft.com/103sologallery) around New Zealand a bit, then maybe hang out in my backyard on Vancouver Island in a [DHC-2 Beaver](https://www.vikingair.com/viking-aircraft/dhc-2-beaver) with floats, and then maybe do some exploratory flying in a [Kodiak 100](https://kodiak.aero/kodiak/).

Say hi if you see me!
