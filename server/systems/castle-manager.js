import { TEAM_BLUE, GATE_HP } from '../../shared/constants.js';

class CastleManager {
  constructor() {
    this.blueGateHp = GATE_HP;
    this.redGateHp = GATE_HP;
  }

  takeDamage(team, amount) {
    if (team === TEAM_BLUE) {
      this.blueGateHp -= amount;
      if (this.blueGateHp < 0) this.blueGateHp = 0;
    } else {
      this.redGateHp -= amount;
      if (this.redGateHp < 0) this.redGateHp = 0;
    }
  }

  isGateBroken(team) {
    return team === TEAM_BLUE ? this.blueGateHp <= 0 : this.redGateHp <= 0;
  }

  serialize() {
    return [Math.round(this.blueGateHp), Math.round(this.redGateHp)];
  }
}

export default CastleManager;
