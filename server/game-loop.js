import { TICK_MS } from '../shared/constants.js';

class GameLoop {
  constructor(simulation) {
    this.simulation = simulation;
    this.interval = null;
    this.onTick = null;
  }

  start() {
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
    clearInterval(this.interval);
    this.interval = null;
  }
}

export default GameLoop;
