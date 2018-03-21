// stores elapsed time and target time (period) - does not directly
// interact with system clocks - incremented through advance in
// eg game loop instead
class Timer {
  
  constructor () {
    this.period = 0.0;
    this.elapsed = 0.0;
  }
  
  advance (amount) {
    const before = this.complete();
    this.elapsed += amount;
    const after = this.complete();
    const justCompleted = ((!before) && after);
    if (justCompleted) {
      // if need a completion callback, can put here
    }
  }
  
  // reset the timer, and either keep old target time (period), or
  // set to a new one.
  reset (optionalPeriod) {
    if (optionalPeriod) { this.period = optionalPeriod; }
    this.elapsed = 0.0;
  }
  
  normalized () {
    return this.elapsed / this.period;
  }
  
  complete () {
    return (this.elapsed >= this.period);
  }
}

export { Timer };
