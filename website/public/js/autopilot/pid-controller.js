/**
 *  PID Controller.
 *
 *  https://buildtide.com/posts_pr/exploring-the-pid-controller-with-javascript.html
 *  https://github.com/Philmod/node-pid-controller/blob/daf953f073afd7f0aa36edb32a7b48df4d5ac425/lib/index.js
 *
 * turned into an ESM module, with a modern constructor args destructuring
 */

export class Controller {
  /**
   * Arguments must be wrapped as object. All arguments are optional,
   * with the defaults chosen if left unspecified in the param list:
   *
   * @param {*} k_p the proportional constant (default=1)
   * @param {*} k_i the integral constant (default=0)
   * @param {*} k_d the derivative constant (default=0)
   * @param {*} dt the measurement interval, in seconds. If unspecified, this value gets recomputed at each update() call.
   * @param {*} i_max the maximum acceptable (absolute) value of the integral term (default=0)
   */
  constructor({ p = 1, i = 0, d = 0, i_max = 0, interval = undefined }) {
    // PID constants
    this.k_p = p;
    this.k_i = i;
    this.k_d = d;

    // Interval of time between two updates, in seconds
    this.dt = interval;

    // Maximum absolute value of sumError
    this.i_max = i_max;

    this.sumError = 0;
    this.lastError = 0;
    this.lastTime = 0;

    this.target = 0; // default value, can be modified with .setTarget
  }

  setTarget(target) {
    this.target = target;
  }

  update(currentValue) {
    if (!currentValue) throw new Error("Invalid argument");
    this.currentValue = currentValue;

    // Calculate dt
    let dt = this.dt;
    if (!dt) {
      let currentTime = Date.now();
      if (this.lastTime === 0) {
        // First time update() is called
        dt = 0;
      } else {
        dt = (currentTime - this.lastTime) / 1000; // in seconds
      }
      this.lastTime = currentTime;
    }
    if (typeof dt !== "number" || dt === 0) {
      dt = 1;
    }

    let error = this.target - this.currentValue;
    this.sumError = this.sumError + error * dt;
    if (this.i_max > 0 && Math.abs(this.sumError) > this.i_max) {
      let sumSign = this.sumError > 0 ? 1 : -1;
      this.sumError = sumSign * this.i_max;
    }

    let dError = (error - this.lastError) / dt;
    this.lastError = error;

    return this.k_p * error + this.k_i * this.sumError + this.k_d * dError;
  }

  reset() {
    this.sumError = 0;
    this.lastError = 0;
    this.lastTime = 0;
  }
}
