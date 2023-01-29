from SimConnect import SimConnection

class APSimConnection(SimConnection):
    def __init__(self):
        super().__init__()
        self.auto_pilot = False

    def set_auto_pilot(self, auto_pilot):
        self.auto_pilot = auto_pilot

    def check_connection(self):
        pass

    def get(self, name):
        # Special property for getting the plane's "trim anchor"
        if name == "TRIM_ANCHOR":
            return list(self.auto_pilot.anchor)

        return super().get(name)
