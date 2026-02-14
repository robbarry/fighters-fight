import { SPATIAL_CELL_SIZE } from '../../shared/constants.js';

class SpatialHash {
  constructor(cellSize = SPATIAL_CELL_SIZE) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  _getCellCoords(x, y) {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  _getCellKey(cx, cy) {
    return `${cx},${cy}`;
  }

  insert(entity) {
    const [cx, cy] = this._getCellCoords(entity.x, entity.y);
    const key = this._getCellKey(cx, cy);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key).push(entity);
  }

  query(x, y, radius) {
    const results = [];
    const seen = new Set();

    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this._getCellKey(cx, cy);
        const cell = this.cells.get(key);
        if (!cell) continue;
        for (const entity of cell) {
          if (seen.has(entity.id)) continue;
          seen.add(entity.id);
          results.push(entity);
        }
      }
    }

    return results;
  }
}

export default SpatialHash;
