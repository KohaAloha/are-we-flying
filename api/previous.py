
    def fly_level(self, bank: float, turn_rate: float, heading: float) -> None:
        factor = self.inverted
        center = 0 if factor == 1 else pi
        bank = degrees(center + bank) if bank < 0 else degrees(bank - center)
        self.lvl_center += constrain_map(bank, -5, 5, -2, 2)

        if self.modes[HEADING_MODE]:
            heading = degrees(heading)
            target = self.modes[HEADING_MODE]
            hdiff = get_compass_diff(heading, target)
            turn_limit = constrain_map(abs(hdiff), 0, 10, 0.01, 0.03)
            bump = constrain_map(hdiff, -20, 20, -5, 5)
            bump = bump if abs(bump) > 0.25 else copysign(0.25, hdiff)
            if (hdiff < 0 and turn_rate > -turn_limit) or (hdiff > 0 and turn_rate < turn_limit):
                self.lvl_center += bump

            # Do we need to prevent our upside-down plane trying to fall out of the sky?
            if factor == -1:
                if (hdiff < 0 and turn_rate > turn_limit) or (hdiff > 0 and turn_rate < -turn_limit):
                    self.lvl_center -= 1.1 * bump

        self.api.set_property_value(
            'AILERON_TRIM_PCT', (self.lvl_center + bank)/180)