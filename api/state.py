from time import perf_counter
from math import degrees
from as_struct import struct


def printc(terms):
    return print(', '.join(terms))


@struct
class State:
    # Basic flight data
    altitude = 0
    speed = 0
    heading = 0

    # Extended flight data
    bank_angle = 0
    turn_rate = 0
    vertical_speed = 0
    pitch_trim = 0
    pitch_trim_limit = 20
    aileron_trim = 0

    # Value deltas ("per second"). These are automatically
    # set if there is a previous state.
    dBank = 0
    dTurn = 0
    dHeading = 0
    dV = 0
    dVS = 0

    # Timestamp for this state. This value is automatically set.
    call_time = 0

    # derived values if there is a previous state
    def constructor(self, **kwargs):
        self.call_time = perf_counter()
        if 'prev_state' in kwargs:
            prev_state = kwargs.get('prev_state')
            if prev_state is not None:
                interval = self.call_time - prev_state.call_time
                # Derive all our deltas "per second"
                self.dBank = (self.bank_angle - prev_state.bank_angle) / interval
                self.dTurn = (self.turn_rate - prev_state.turn_rate) / interval
                self.dHeading = (self.heading - prev_state.heading) / interval
                self.dV = (self.speed - prev_state.speed) / interval
                self.dVS = (self.vertical_speed -
                            prev_state.vertical_speed) / interval
        print(self)

    def __str__(self):
        return '\n'.join([
            '',
            ', '.join([
                f'altitude: {"{:.5f}".format(self.altitude)}f',
                f'speed: {"{:.5f}".format(self.speed)}kts',
                f'heading: {"{:.5f}".format(degrees(self.heading))}°',
            ]),
            ', '.join([
                f'bank: {"{:.5f}".format(degrees(self.bank_angle))}°',
                f'turn: {"{:.5f}".format(degrees(self.turn_rate))}°/s',
                f'VS: {"{:.5f}".format(self.vertical_speed)}f/m',
                f'trim: {"{:.5f}".format(self.pitch_trim)}',
                f'a.trim: {"{:.5f}".format(self.aileron_trim)}',
            ]),
            ', '.join([
                f'dV: {"{:.5f}".format(self.dV)}',
                f'dVS: {"{:.5f}".format(self.dVS)}',
                f'dBank: {"{:.5f}".format(self.dBank)}',
                f'dTurn: {"{:.5f}".format(self.dTurn)}',
                f'dHeading: {"{:.5f}".format(degrees(self.dHeading))}°/s',
                f'trim limit: {"{:.5f}".format(self.pitch_trim_limit)}',
            ]),
        ])
