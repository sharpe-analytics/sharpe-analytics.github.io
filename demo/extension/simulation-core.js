// Shared by the dashboard, the simulation worker, and deterministic Node tests.
(function(root) {
  'use strict';
  const HORIZONS = [1, 3, 5, 10, 20, 30];
  const monthKey = n => `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`;
  function monthlyReturns(history, asOf) {
    const current = Number(asOf.slice(0, 4)) * 12 + Number(asOf.slice(5, 7)) - 1;
    const closes = new Map();
    for (const point of history || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date || '')) continue;
      const [y, m, d] = point.date.split('-').map(Number);
      const month = y * 12 + m - 1, last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (m < 1 || m > 12 || d < 1 || d > last || month >= current || month < current - 61 || d < last - 6) continue;
      // An invalid latest quote invalidates that month; never silently replace it
      // with an earlier valid price or a zero return.
      if (!closes.has(month) || closes.get(month).date <= point.date) closes.set(month, point);
    }
    const returns = new Map();
    for (const [month, point] of closes) {
      const prev = closes.get(month - 1);
      if (month < current - 60 || !Number.isFinite(point.price) || point.price <= 0 ||
          !prev || !Number.isFinite(prev.price) || prev.price <= 0) continue;
      const r = point.price / prev.price - 1;
      if (Number.isFinite(r) && r > -1) returns.set(month, r);
    }
    return returns;
  }
  function commonWindow(series) {
    if (!series.length || series.some(s => !s.size)) return [];
    const latest = Math.min(...series.map(s => Math.max(...s.keys())));
    const months = [];
    for (let m = latest; months.length < 60 && series.every(s => s.has(m)); m--) months.unshift(m);
    return months;
  }
  function prepare(histories, positions, proxies, asOf) {
    const series = Object.fromEntries(Object.entries(histories).map(([id, h]) => [id, monthlyReturns(h, asOf)]));
    const coverage = positions.map(p => {
      const source = proxies[String(p.id)] || String(p.id);
      const months = commonWindow([series[source] || new Map()]);
      return { id: String(p.id), source, count: months.length, from: months.length ? monthKey(months[0]) : null, to: months.length ? monthKey(months[months.length - 1]) : null };
    });
    const shared = commonWindow(coverage.map(c => series[c.source] || new Map()));
    return {
      coverage, eligible: Object.keys(series).filter(id => commonWindow([series[id]]).length >= 36),
      months: shared.map(monthKey),
      returns: shared.map(m => coverage.map(c => series[c.source].get(m))),
      ready: coverage.length > 0 && shared.length >= 36,
    };
  }
  function validate(input) {
    const { initial, cash, allocation, amount, every, returns, paths = 2000, months = 360 } = input;
    if (!Array.isArray(initial) || !initial.length || initial.some(v => !Number.isFinite(v) || v < 0) || !Number.isFinite(cash) || cash < 0)
      throw Error('Only long holdings and non-negative cash are supported.');
    if (!Number.isFinite(amount) || amount < 0) throw Error('Enter a non-negative contribution amount.');
    if (!Number.isInteger(every) || every < 1 || every > 360) throw Error('Choose a whole number of months between 1 and 360.');
    if (!Array.isArray(allocation) || allocation.length !== initial.length || allocation.some(v => !Number.isFinite(v) || v < 0 || v > 1) ||
        (amount > 0 && Math.abs(allocation.reduce((s, v) => s + v, 0) - 1) > 1e-8)) throw Error('Contribution allocations must total 100%.');
    if (!Array.isArray(returns) || returns.length < 36 || returns.some(row => !Array.isArray(row) || row.length !== initial.length || row.some(r => !Number.isFinite(r) || r <= -1)))
      throw Error('At least 36 shared monthly returns with valid prices are required.');
    if (!Number.isInteger(paths) || paths < 1 || paths > 10000 || !Number.isInteger(months) || months < 1 || months > 360) throw Error('Invalid simulation size.');
  }
  function seedFor(value) {
    const str = JSON.stringify(value); let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function randomGenerator(seed) {
    let a = seed >>> 0;
    return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function quantile(sorted, q) {
    const index = (sorted.length - 1) * q, lo = Math.floor(index);
    return sorted[lo] + (sorted[Math.ceil(index)] - sorted[lo]) * (index - lo);
  }
  function simulate(input, progress = () => {}) {
    validate(input);
    const { initial, cash, allocation, amount, every, returns, paths = 2000, months = 360 } = input;
    const random = randomGenerator(input.seed ?? seedFor(input));
    const samples = Array.from({ length: months + 1 }, () => new Float64Array(paths));
    const starting = initial.reduce((s, v) => s + v, cash);
    for (let path = 0; path < paths; path++) {
      const values = initial.slice(); samples[0][path] = starting; let start = 0;
      for (let m = 1; m <= months; m++) {
        if ((m - 1) % 3 === 0) start = Math.floor(random() * returns.length);
        const row = returns[(start + (m - 1) % 3) % returns.length];
        let total = cash;
        for (let i = 0; i < values.length; i++) {
          values[i] *= 1 + row[i];
          if (m % every === 0) values[i] += amount * allocation[i];
          total += values[i];
        }
        if (!Number.isFinite(total)) throw Error('These historical returns produce values too large to simulate. Review the price history and proxies.');
        samples[m][path] = total;
      }
      if ((path + 1) % 200 === 0) progress(Math.round((path + 1) / paths * 90));
    }
    const monthly = samples.map((values, month) => {
      values.sort();
      const contributions = Math.floor(month / every) * amount;
      return { month, contributions, baseline: starting + contributions, p10: quantile(values, .1), median: quantile(values, .5), p90: quantile(values, .9) };
    });
    return { starting, paths, monthly, horizons: HORIZONS.filter(y => y * 12 <= months).map(year => {
      const p = monthly[year * 12]; return { year, ...p, gain: p.median - p.baseline };
    }) };
  }
  const api = { HORIZONS, monthlyReturns, commonWindow, prepare, validate, seedFor, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimulationCore = api;
})(typeof self !== 'undefined' ? self : globalThis);
