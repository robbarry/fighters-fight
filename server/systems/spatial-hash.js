import { SPATIAL_CELL_SIZE } from '../../shared/constants.js';

class SpatialHash {
  constructor(cellSize = SPATIAL_CELL_SIZE) {
    this.cellSize = cellSize;
    // Since world Y is small (0-60) and cell size is 100, we effectively only have horizontal cells.
    // We use a Map<number, Entity[]> where the key is the cell X index.
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  _getCellIndex(x) {
    return Math.floor(x / this.cellSize);
  }

  insert(entity) {
    const cx = this._getCellIndex(entity.x);
    let cell = this.cells.get(cx);
    if (!cell) {
      cell = [];
      this.cells.set(cx, cell);
    }
    cell.push(entity);
  }

  query(x, y, radius) {
    const results = [];
    // We don't need a Set for 'seen' because an entity exists in exactly one cell in this implementation
    // (point insertion). Query iterates unique cells.

    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      const cell = this.cells.get(cx);
      if (cell) {
        for (let i = 0; i < cell.length; i++) {
          results.push(cell[i]);
        }
      }
    }

    return results;
  }
}

export default SpatialHash;
