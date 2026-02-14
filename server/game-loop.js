import { TICK_MS } from '../shared/constants.js';

class GameLoop {
  constructor(simulation) {
    this.simulation = simulation;
    this.interval = null;
    this.onTick = null;
  }

  start() {
    if (this.interval) return;
    console.log('Game loop started');
    this.interval = setInterval(() => {
      try {
        this.simulation.update(TICK_MS / 1000);
        const snapshot = this.simulation.buildSnapshot();
        const events = this.simulation.getEvents();
        if (this.onTick) this.onTick(snapshot, events);
      } catch (e) {
        console.error('Game loop error:', e);
      }
    }, TICK_MS);
  }

  stop() {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }
}

export default GameLoop;
