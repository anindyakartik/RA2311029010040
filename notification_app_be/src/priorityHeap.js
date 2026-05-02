const { Log } = require("logging_middleware");

class MinHeap {
  constructor(capacity) {
    this._data = [];
    this._cap = capacity;
  }

  size() {
    return this._data.length;
  }

  peek() {
    return this._data.length > 0 ? this._data[0] : null;
  }

  offer(item) {
    if (this._data.length < this._cap) {
      this._data.push(item);
      this._bubbleUp(this._data.length - 1);
    } else if (item.score > this._data[0].score) {
      this._data[0] = item;
      this._sinkDown(0);
    }
  }

  drainSorted() {
    const sorted = [];
    while (this._data.length > 0) sorted.push(this._extractMin());
    sorted.reverse();
    return sorted;
  }

  _extractMin() {
    const min = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return min;
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this._data[idx].score < this._data[parent].score) {
        [this._data[idx], this._data[parent]] = [this._data[parent], this._data[idx]];
        idx = parent;
      } else break;
    }
  }

  _sinkDown(idx) {
    const len = this._data.length;
    while (true) {
      let smallest = idx;
      const l = 2 * idx + 1;
      const r = 2 * idx + 2;
      if (l < len && this._data[l].score < this._data[smallest].score) smallest = l;
      if (r < len && this._data[r].score < this._data[smallest].score) smallest = r;
      if (smallest !== idx) {
        [this._data[idx], this._data[smallest]] = [this._data[smallest], this._data[idx]];
        idx = smallest;
      } else break;
    }
  }
}

function topNPriority(notifications, n, typeWeights) {
  Log("backend", "info", "service", `selecting top ${n} from ${notifications.length} notifications`).catch(() => {});

  const heap = new MinHeap(n);

  for (let i = 0; i < notifications.length; i++) {
    const notif = notifications[i];
    const weight = typeWeights[notif.Type || notif.type] || 1;
    const ts = new Date(notif.Timestamp || notif.timestamp || 0).getTime();
    const score = weight * 1e15 + ts;
    heap.offer({ score, notification: notif });
  }

  const results = heap.drainSorted().map((e) => e.notification);

  Log("backend", "info", "service", `heap selection done, returning ${results.length} items`).catch(() => {});
  return results;
}

module.exports = { MinHeap, topNPriority };
