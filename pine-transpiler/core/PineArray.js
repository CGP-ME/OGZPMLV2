// core/PineArray.js
class PineArray {
  constructor(initialSize = 0, initValue = null) {
    this._data = new Array(initialSize).fill(initValue);
  }

  static new_float(size, init = 0.0) {
    return new PineArray(size, init);
  }

  static new_int(size, init = 0) {
    return new PineArray(size, init);
  }

  size() {
    return this._data.length;
  }

  get(idx) {
    return this._data[idx];
  }

  set(idx, value) {
    this._data[idx] = value;
  }

  push(value) {
    this._data.push(value);
  }

  clear() {
    this._data.length = 0;
  }

  copy() {
    const copy = new PineArray();
    copy._data = this._data.slice();
    return copy;
  }

  sort(order = 'ascending') {
    const asc = order === 'ascending';
    this._data.sort((a, b) => (asc ? a - b : b - a));
  }
}

module.exports = PineArray;
