// Shared daily observation model for the recorder and dashboard.
class TodayLiveModel {
  constructor() { this.reset('', ''); }
  reset(account, date) {
    this.account = String(account); this.date = date;
    this.ids = ''; this.points = []; this.values = null; this.total = null;
    this.lastObservedAt = 0; this.lastChangedAt = 0; this.gap = false;
    this.lastEvent = 'Waiting for the first complete observation.';
  }
  restore(record) {
    if (!record || record.account !== this.account || record.date !== this.date || !Array.isArray(record.points)) return false;
    const points = record.points;
    if (points.some((p, i) => !Number.isFinite(p.x) || (p.y !== null && !Number.isFinite(p.y)) || (i && p.x <= points[i-1].x)) ||
        !Number.isFinite(record.lastObservedAt) || !Number.isFinite(record.lastChangedAt) ||
        (record.total !== null && !Number.isFinite(record.total)) ||
        (record.values !== null && (!record.values || Object.values(record.values).some(v => !Number.isFinite(v))))) return false;
    for (const key of ['ids','total','lastObservedAt','lastChangedAt','lastEvent','gap']) this[key] = record[key];
    this.values = record.values ? { ...record.values } : null;
    this.points = points.map(p => ({ ...p }));
    return true;
  }
  accept(snapshot, positions, now = Date.now()) {
    if (!snapshot?.ok || String(snapshot.account) !== this.account || snapshot.date !== this.date ||
        !Number.isFinite(snapshot.observedAt) || Math.abs(now - snapshot.observedAt) > 10000) return false;
    const ids = positions.map(p => String(p.id)).sort();
    const values = snapshot.perPosition;
    if (!ids.length || !values || Object.keys(values).sort().join(',') !== ids.join(',') ||
        ids.some(id => !Number.isFinite(values[id]))) return false;
    const signature = ids.join(',');
    if (this.ids && this.ids !== signature) { this.gap = true; this.values = null; }
    if (this.lastObservedAt && snapshot.observedAt - this.lastObservedAt > 15000) this.gap = true;
    if (snapshot.observedAt <= this.lastObservedAt) return false;
    this.ids = signature;
    const total = Math.round(ids.reduce((s, id) => s + values[id], 0) * 100) / 100;
    const changed = !this.values || ids.some(id => this.values[id] !== values[id]);
    let biggest = null;
    if (this.values) positions.forEach(p => {
      const delta = Math.round((values[p.id] - this.values[p.id]) * 100) / 100;
      if (delta && (!biggest || Math.abs(delta) > Math.abs(biggest.delta))) biggest = { name: p.name || String(p.id), delta };
    });
    if (this.gap && this.points.length) this.points.push({ x: snapshot.observedAt - 1, y: null });
    // Record a checked observation every second even if unchanged. Flat
    // segments mean equal observed P&L; gaps mark interrupted observation.
    const last = this.points[this.points.length - 1];
    if (changed || this.gap || !last || snapshot.observedAt - last.x >= 1000) {
      this.points.push({ x: snapshot.observedAt, y: total });
    }
    // Keep every recorded move for this local calendar day; no rolling-window truncation.
    if (biggest && !this.gap) {
      this.lastEvent = `${biggest.name} ${biggest.delta >= 0 ? 'added' : 'gave back'} €${Math.abs(biggest.delta).toFixed(2)} since the last observation.`;
    } else if (!this.values || this.gap) {
      this.lastEvent = this.gap ? 'Observation resumed. Changes during the gap are not replayed.' : 'Day recording started. Following changes in your holdings.';
    }
    if (changed) this.lastChangedAt = snapshot.observedAt;
    this.lastObservedAt = snapshot.observedAt;
    this.values = { ...values }; this.total = total; this.gap = false;
    return true;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = TodayLiveModel;

// A dashboard-local session. Old daily history is never replayed on opening.
class TodayPulseSession {
  constructor() { this.reset(); }
  reset(now = Date.now()) {
    this.startedAt = now; this.baseline = null; this.previous = null;
    this.lastObservedAt = 0; this.change = 0; this.bars = [];
  }
  accept(meta) {
    if (!Number.isFinite(meta?.total) || !Number.isFinite(meta.lastObservedAt) ||
        meta.lastObservedAt < this.startedAt || meta.lastObservedAt <= this.lastObservedAt) return false;
    if (this.baseline === null) {
      this.baseline = this.previous = meta.total; this.lastObservedAt = meta.lastObservedAt;
      return true;
    }
    if (meta.lastObservedAt - this.lastObservedAt < 2000) return false;
    const resumed = meta.lastObservedAt - this.lastObservedAt > 15000;
    const delta = resumed ? 0 : Math.round((meta.total - this.previous) * 100) / 100;
    this.bars.push({time:meta.lastObservedAt, delta, total:meta.total, resumed});
    this.bars = this.bars.slice(-60);
    this.change = Math.round((meta.total - this.baseline) * 100) / 100;
    this.previous = meta.total; this.lastObservedAt = meta.lastObservedAt;
    return true;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports.TodayPulseSession = TodayPulseSession;
