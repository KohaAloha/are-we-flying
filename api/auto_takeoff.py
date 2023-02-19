"""

"DESIGN_CRUISE_ALT": ["Optimal cruise altitude", b'DESIGN CRUISE ALT', b'Feet', 'N'],
"DESIGN_SPEED_CLIMB": ["Optimal climb speed", b'DESIGN SPEED CLIMB', b'Feet', 'N'],
"DESIGN_SPEED_MIN_ROTATION": ["Minimum speed for aircraft rotation", b'DESIGN SPEED MIN ROTATION', b'Feet', 'N'],
"DESIGN_SPEED_VC": ["Cruise speed", b'DESIGN SPEED VC', b'Feet per second', 'N'],
"DESIGN_SPEED_VS0": ["Minimum landing speed", b'DESIGN SPEED VS0', b'Feet per second', 'N'],
"DESIGN_SPEED_VS1": ["Minimum steady flight speed", b'DESIGN SPEED VS1', b'Feet per second', 'N'],
"DESIGN_TAKEOFF_SPEED": ["Ideal takeoff speed", b'DESIGN TAKEOFF SPEED', b'Feet per second', 'N'],

"""

from utils import constrain, constrain_map, get_compass_diff, lerp, get_point_at_distance, rudder_curve
from math import degrees, radians, asin, sin, cos, atan2, sqrt
from constants import AUTO_TAKEOFF, ALTITUDE_HOLD, HEADING_MODE, LEVEL_FLIGHT, VERTICAL_SPEED_HOLD
from simple_pid import PID

takeoff_heading = None
takeoff_waypoint = None
pid = None
lift_off = False
level_out = False
ease_elevator = None


def in_between_headings(current_heading, target_heading, takeoff_heading):
    return False


def get_heading_towards(lat1, lon1, lat2, lon2):
    lat1 = radians(lat1)
    lon1 = radians(lon1)
    lat2 = radians(lat2)
    lon2 = radians(lon2)
    dL = lon2 - lon1
    y = cos(lat2) * sin(dL)
    x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dL)
    v = atan2(y, x)
    return degrees(v)


def auto_takeoff(autopilot, state):
    global takeoff_heading, takeoff_waypoint, pid, lift_off, level_out, ease_elevator

    api = autopilot.api
    current_speed = state.speed
    vs = state.vertical_speed
    on_ground = state.on_ground
    total_weight = api.get('TOTAL_WEIGHT')
    climb_speed = api.get('DESIGN_SPEED_CLIMB')
    specific_constant = None

    if total_weight and climb_speed is not None:
        specific_constant = (total_weight * climb_speed)/1000
        print('SC: ', specific_constant)

    if lift_off is False:
        # Set one notch of flaps for takeoff - we'll keep this commented off
        # unless we can find a way to determine which plane needs it set.
        flaps = api.get('FLAPS_HANDLE_INDEX:1')
        if flaps is not None and flaps != 0:
            api.set('FLAPS_HANDLE_INDEX:1', 0)

        # Is the parking brake engaged?
        brake = api.get('BRAKE_PARKING_POSITION')
        if brake is not None and brake == 1:
            return api.trigger('PARKING_BRAKES')

        # Is the tail wheel locked?
        if api.get('IS_TAIL_DRAGGER') == 1:
            tail_lock = api.get('TAILWHEEL_LOCK_ON')
            if tail_lock == 0:
                api.trigger('TOGGLE_TAILWHEEL_LOCK')

        # throttle up until we're max throttle.
        step = 5
        engine_count = api.get('NUMBER_OF_ENGINES')
        if engine_count is not None:
            for count in range(1, 1 + int(engine_count)):
                throttle = int(
                    api.get(f'GENERAL_ENG_THROTTLE_LEVER_POSITION:{count}'))
                if throttle is not None and throttle < 100:
                    # Note that we're explicitly checking for <100% because many
                    # engines let you "overdrive" them for short periods of time.
                    # And then they fail mid-flight if you forget to ease them back.
                    api.set(
                        f'GENERAL_ENG_THROTTLE_LEVER_POSITION:{count}', throttle + step)

    lat = api.get('PLANE_LATITUDE')
    lon = api.get('PLANE_LONGITUDE')
    heading = degrees(state.heading)

    if total_weight is not None and takeoff_waypoint is None:
        # get a point in the "near" distance along the runway heading
        takeoff_heading = heading
        autopilot.set_target(HEADING_MODE, takeoff_heading)

        takeoff_waypoint = get_point_at_distance(lat, lon, 3, heading)
        # factor = constrain_map(total_weight, 3000, 6500, 0.005, 0.2)
        factor = constrain_map(total_weight, 3000, 6500, 0.001, 0.1)
        pid = PID(factor, 0, 0, setpoint=0)

    # Do a poor job of auto-rudder:
    if on_ground is True and total_weight is not None:
        lat2, lon2 = takeoff_waypoint
        diff = get_compass_diff(heading, takeoff_heading)
        rudder = 0.3 * diff

        # The slower we're going, the more rudder we need.
        if current_speed > 60:
            rudder = constrain_map(current_speed, 60, 100, 0.5 * rudder, 0.2 * rudder)
        elif current_speed > 40:
            rudder = constrain_map(current_speed, 40, 60, 0.8 * rudder, 0.5 * rudder)
        elif current_speed > 20:
            rudder = constrain_map(current_speed, 20, 40, 1.2 * rudder, 0.8 * rudder)

        # TODO: we need a good way to prevent slow speed oscillation (e.g. D18)

        api.set('RUDDER_POSITION', rudder)
    else:
        rudder = api.get('RUDDER_POSITION')
        api.set('RUDDER_POSITION', rudder/2)

    # if speed is greater than rotation speed, rotate.
    # (Or if the wheels are off the ground before then!)
    min_rotate = api.get('DESIGN_SPEED_MIN_ROTATION')
    if min_rotate is not None and total_weight is not None:
        rotate_speed = 1.1 * min_rotate
        print(f'speed: {current_speed}, rotate at {rotate_speed}')

        if not on_ground or current_speed > rotate_speed:
            print(
                f"rotate. lift off: {lift_off}, level out: {level_out}, vs: {vs}")

            elevator = api.get('ELEVATOR_POSITION')

            # Ease stick back to neutral
            if level_out is True and abs(vs) < 100:
                if elevator < 0.015:
                    autopilot.set_target(AUTO_TAKEOFF, False)
                else:
                    print(f"(1) ease back, elevator = {elevator}")
                    ease_back = ease_elevator / 20
                    api.set('ELEVATOR_POSITION', elevator - ease_back)

            elif lift_off is True and vs > 1000 and elevator > 0:
                print(f"(2) ease back, elevator = {elevator}")
                api.set('ELEVATOR_POSITION', elevator / 5)

            # Pull back on the stick
            elif lift_off is False:
                lift_off = True
                pull_back = constrain_map(total_weight, 3000, 6500, 0.005, 0.5)
                print(f"\nKICK: {pull_back}\n")
                api.set('ELEVATOR_POSITION', pull_back)
                autopilot.set_target(VERTICAL_SPEED_HOLD, True)
                autopilot.set_target(ALTITUDE_HOLD, 1500)
                autopilot.anchor.y = constrain_map(
                    total_weight, 3000, 6500, 0, 0.1)

            # elif lift_off is True and vs < 50:
            #     print(f"\nEXTRA KICK: 0.01\n")
            #     api.set('ELEVATOR_POSITION', elevator + 0.005)

    # Hand off control to the "regular" autopilot once we have a
    # safe enough positive rate.
    if total_weight is not None:
        limit = constrain_map(total_weight, 3000, 6500, 300, 1000)
        if level_out is False and state.vertical_speed > limit:
            level_out = True
            ease_elevator = api.get('ELEVATOR_POSITION')
            # api.set('ELEVATOR_POSITION', 0)  # we want to restore this to zero later...
            api.set('RUDDER_POSITION', 0)
            api.set('FLAPS_HANDLE_INDEX:1', 0)
            api.trigger('GEAR_UP')
            autopilot.set_target(VERTICAL_SPEED_HOLD, True)
            autopilot.set_target(ALTITUDE_HOLD, 1500)
            autopilot.set_target(LEVEL_FLIGHT, True)
