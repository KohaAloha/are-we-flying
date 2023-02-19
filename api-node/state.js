import { degrees } from "./utils.js";

export class State {
  // Basic flight data
  on_ground = true;
  altitude = 0;
  speed = 0;

  // Basic nagivation data
  latitude = 0;
  longitude = 0;
  heading = 0; // based on the magnetic compass
  true_heading = 0; // based on GPS

  // Extended flight data
  bank_angle = 0;
  turn_rate = 0;
  vertical_speed = 0;
  pitch_trim = 0;
  pitch_trim_limit = [10, -10];
  aileron_trim = 0;

  // Value deltas ("per second"). These are automatically
  // set if there is a previous state.
  dBank = 0;
  dTurn = 0;
  dHeading = 0;
  dV = 0;
  dVS = 0;

  // Timestamp for this state. This value is automatically set.
  call_time = 0;

  // derived values if there is a previous state
  constructor(data = {}, previous) {
    this.on_ground = data.SIM_ON_GROUND ?? this.on_ground;
    this.altitude = data.INDICATED_ALTITUDE ?? this.altitude;
    this.speed = data.AIRSPEED_TRUE ?? this.speed;

    this.latitude = degrees(data.PLANE_LATITUDE ?? this.latitude);
    this.longitude = degrees(data.PLANE_LONGITUDE ?? this.longitude);
    this.heading = data.PLANE_HEADING_DEGREES_MAGNETIC ?? this.heading;
    this.true_heading = data.PLANE_HEADING_DEGREES_TRUE ?? this.true_heading;

    this.bank_angle = data.PLANE_BANK_DEGREES ?? this.bank_angle;
    this.turn_rate = data.TURN_INDICATOR_RATE ?? this.turn_rate;

    // VS is in feet per second, and we want feet per minute.
    this.vertical_speed = 60 * (data.VERTICAL_SPEED ?? this.vertical_speed);

    this.pitch_trim = data.ELEVATOR_TRIM_POSITION ?? this.pitch_trim;
    this.pitch_trim_limit = [
      data.ELEVATOR_TRIM_UP_LIMIT ?? 10,
      data.ELEVATOR_TRIM_DOWN_LIMIT ?? -10,
    ];
    this.aileron_trim = data.AILERON_TRIM_PCT ?? this.aileron_trim;

    this.call_time = Date.now();
    if (previous) {
      const interval = (this.call_time - previous.call_time) / 1000;
      // Derive all our deltas "per second"
      this.dBank = (this.bank_angle - previous.bank_angle) / interval;
      this.dTurn = (this.turn_rate - previous.turn_rate) / interval;
      this.dHeading = (this.heading - previous.heading) / interval;
      this.dV = (this.speed - previous.speed) / interval;
      this.dVS = (this.vertical_speed - previous.vertical_speed) / interval;
    }
  }
}
