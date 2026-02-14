export class Interpolation {
  constructor() {
    this.snapshots = [];
    this.maxSnapshots = 3;
    this._lastPushTime = 0;
  }

  latest() {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1];
  }

  push(snapshot) {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    this._lastPushTime = performance.now();
  }

  getInterpolated() {
    if (this.snapshots.length === 0) return null;
    if (this.snapshots.length === 1) return this.snapshots[0];

    const snap1 = this.snapshots[this.snapshots.length - 2];
    const snap2 = this.snapshots[this.snapshots.length - 1];

    const now = performance.now();
    const elapsed = now - this._lastPushTime;
    const tickMs = 50; // 20Hz
    const t = Math.min(1, elapsed / tickMs);

    return this._lerp(snap1, snap2, t);
  }

  _lerp(snap1, snap2, t) {
    return {
      tick: snap2.tick,
      phase: snap2.phase,
      soldiers: this._lerpEntityArrays(snap1.soldiers, snap2.soldiers, t),
      projectiles: snap2.projectiles,
      royals: this._lerpEntityArrays(snap1.royals, snap2.royals, t),
      players: this._lerpPlayerArrays(snap1.players, snap2.players, t),
      gates: snap2.gates,
      armyCounts: snap2.armyCounts
    };
  }

  _lerpEntityArrays(arr1, arr2, t) {
    const map1 = new Map();
    if (arr1) {
      for (const ent of arr1) map1.set(ent[0], ent);
    }
    if (!arr2) return arr1 || [];

    return arr2.map(ent2 => {
      const ent1 = map1.get(ent2[0]);
      if (!ent1) return ent2;
      // Lerp x (index 3) and y (index 4)
      // soldiers: [id, type, team, x, y, hp, state, facing]
      const result = [...ent2];
      result[3] = ent1[3] + (ent2[3] - ent1[3]) * t;
      result[4] = ent1[4] + (ent2[4] - ent1[4]) * t;
      return result;
    });
  }

  _lerpPlayerArrays(arr1, arr2, t) {
    const map1 = new Map();
    if (arr1) {
      for (const ent of arr1) map1.set(ent[0], ent);
    }
    if (!arr2) return arr1 || [];

    return arr2.map(ent2 => {
      const ent1 = map1.get(ent2[0]);
      if (!ent1) return ent2;
      // Players: [id, role, team, x, y, hp, state, facing, lives]
      const result = [...ent2];
      result[3] = ent1[3] + (ent2[3] - ent1[3]) * t;
      result[4] = ent1[4] + (ent2[4] - ent1[4]) * t;
      return result;
    });
  }

  onTabReturn() {
    if (this.snapshots.length > 1) {
      const latest = this.snapshots[this.snapshots.length - 1];
      this.snapshots = [latest];
    }
    this._lastPushTime = performance.now();
  }
}
