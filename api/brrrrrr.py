from threading import Timer
from as_struct import as_struct

@as_struct
class Orientation():
    pitch = 0
    roll = 0
    yaw = 0

@as_struct
class Trim():
    elevator = 0
    aileron = 0
    rudder = 0

@as_struct
class Vector():
    speed = 0
    vs = 0

class Brrrrrr():
    """
    This is a (simplified?) simulated plane that we can use to debug our autopilot
    without having to fire up MSFS. It has limited SimConnect support, serving and
    accepting only values necessary for the autopilot code to do its thing.
    """
    def __init__(self):
        self.description = "I'm a small plane!"
        self.orientation = Orientation()
        self.vector = Vector()
        self.trim = Trim()
        self.weight = 1500 # kg

    def start(self):
        Timer(0.016, self.update, [], {}).start()

    def update(self):

