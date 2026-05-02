/**
 * priorityHeap.js
 *
 * A min-heap that keeps only the top N highest-priority items.
 * Instead of sorting an entire array (O(n log n)), we maintain
 * a bounded heap of size N and stream items through it.
 *
 * Each element looks like: { score, notification }
 * Lower score = lower priority, so the heap root is the weakest
 * item in our top-N set. When a new item has a higher score than
 * the root, we swap and re-heapify. This gives us O(n log N)
 * overall for N << n.
 *
 * No external libraries. Pure hand-rolled heap.
 */

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

  /**
   * Offer a scored item to the heap.
   * If the heap hasn't reached capacity, just push.
   * If it has, only insert if the new score beats the root.
   */
  offer(item) {
    if (this._data.length < this._cap) {
      this._data.push(item);
      this._bubbleUp(this._data.length - 1);
    } else if (item.score > this._data[0].score) {
      this._data[0] = item;
      this._sinkDown(0);
    }
  }

  /**
   * Drain the heap into a sorted array (highest score first).
   */
  drainSorted() {
    const sorted = [];
    while (this._data.length > 0) {
      sorted.push(this._extractMin());
    }
    sorted.reverse();
    return sorted;
  }

  // ── internal ───────────────────────────────────────────────

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
        [this._data[idx], this._data[parent]] = [
          this._data[parent],
          this._data[idx],
        ];
        idx = parent;
      } else {
        break;
      }
    }
  }

  _sinkDown(idx) {
    const length = this._data.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left < length && this._data[left].score < this._data[smallest].score) {
        smallest = left;
      }
      if (right < length && this._data[right].score < this._data[smallest].score) {
        smallest = right;
      }
      if (smallest !== idx) {
        [this._data[idx], this._data[smallest]] = [
          this._data[smallest],
          this._data[idx],
        ];
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

/**
 * Select the top N priority notifications from a list.
 *
 * Priority is determined by:
 *   1. Type weight (Placement=3, Result=2, Event=1)
 *   2. Recency (more recent = higher sub-score within same type)
 *
 * We combine both into a single numeric score so the heap can
 * compare any two notifications directly:
 *
 *   score = typeWeight * 1e15 + timestamp_ms
 *
 * The type weight term dominates, so a Placement notification
 * always outranks a Result. Within the same type, the more
 * recent one wins because its timestamp_ms is larger.
 *
 * @param {Array} notifications – raw notification objects from the API
 * @param {number} n – how many to return
 * @param {Object} typeWeights – mapping of Type -> numeric weight
 * @returns {Array} – top n notifications, highest priority first
 */
function topNPriority(notifications, n, typeWeights) {
  Log(
    "backend",
    "info",
    "service",
    `priorityHeap – selecting top ${n} from ${notifications.length} notifications`
  ).catch(() => {});

  const heap = new MinHeap(n);

  for (let i = 0; i < notifications.length; i++) {
    const notif = notifications[i];
    const type = notif.Type || notif.type || "Event";
    const weight = typeWeights[type] || 1;

    // parse timestamp into milliseconds
    const ts = new Date(notif.Timestamp || notif.timestamp || 0).getTime();

    // composite score: weight dominates, recency is the tiebreaker
    const score = weight * 1e15 + ts;

    heap.offer({ score, notification: notif });
  }

  const results = heap.drainSorted().map((entry) => entry.notification);

  Log(
    "backend",
    "info",
    "service",
    `priorityHeap – selected ${results.length} notifications`
  ).catch(() => {});

  return results;
}

module.exports = { MinHeap, topNPriority };
