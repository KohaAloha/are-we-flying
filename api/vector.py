from as_struct import struct


@struct
class Vector():
    x = 0
    y = 0
    z = 0

    def __str__(self):
        return f'({self.x},{self.y},{self.z})'
