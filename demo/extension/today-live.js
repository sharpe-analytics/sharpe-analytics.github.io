// Pulse starts at dashboard refresh; source observations continue across tabs.
const TodayLive = (() => {
  const model = new TodayLiveModel();
  const session = new TodayPulseSession();
  let paused = false, busy = false, pending = false, status = 'Connecting…';
  let chart = null, chartSignature = '', context = '';
  let epoch = 0;
  const rows = new Map();
  const $ = id => document.getElementById(id);
  const money = n => (n >= 0 ? '+' : '−') + new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n));
  const active = () => proUnlocked && !document.hidden && $('tabToday')?.classList.contains('active');

  function sync(selectedDate) {
    const panel = $('todayLivePanels');
    if (!panel) return;
    panel.hidden = !proUnlocked || !globalData.positions?.length;
    const key = `${globalData.data?.intAccount || ''}|${getLocalTodayStr()}|${globalData.data?.lastFetch || 0}`;
    if (key !== context) {
      context = key; epoch++; session.reset();
      model.reset(globalData.data?.intAccount || '', getLocalTodayStr());
      rows.forEach(row => row.remove()); rows.clear();
      if (chart) { chart.destroy(); chart = null; }
      chartSignature = ''; status = 'Connecting…';
    }
    const historical = selectedDate && selectedDate !== getLocalTodayStr();
    if (historical) status = 'Historical day';
    else if (status === 'Historical day') status = 'Connecting…';
    render(historical);
  }

  function render(historical = !!globalData.todaySelectedDate && globalData.todaySelectedDate !== getLocalTodayStr()) {
    if (!$('todayLivePanels') || $('todayLivePanels').hidden || !active()) return;
    $('todayLivePause').textContent = paused ? 'Resume view' : 'Pause view';
    $('todayLivePause').setAttribute('aria-pressed', String(paused));
    $('todayLivePause').title = 'Pauses the display only. Recording continues.';
    if (paused && !historical) { $('todayLiveStatus').textContent = 'View paused · still recording'; return; }
    const hasData = model.total !== null && !historical;
    $('todayLiveTotal').textContent = hasData && session.baseline !== null ? money(session.change) : '—';
    $('todayLiveTotal').className = 'today-live-total sensitive' + (hasData ? session.change >= 0 ? ' positive' : ' negative' : '');
    const state = $('todayLiveStatus');
    state.textContent = historical ? 'Historical day' : paused ? 'Paused' : status;
    state.dataset.state = !historical && !paused && status === 'Following DEGIRO' ? 'connected' : '';
    $('todayLivePause').textContent = paused ? 'Resume view' : 'Pause view';
    $('todayLivePause').setAttribute('aria-pressed', String(paused));
    $('todayLivePause').disabled = !!historical;
    const empty = $('todayLiveEmpty');
    empty.hidden = hasData && session.bars.length > 0;
    empty.textContent = historical ? 'Choose Today to follow live observations. Earlier intraday data is not reconstructed.' :
      session.baseline !== null ? 'Recording started. The first change appears after two seconds.' : 'Waiting for a fresh DEGIRO reading…';
    $('todayLiveContributorsEmpty').hidden = hasData;
    $('todayLiveContributorsEmpty').textContent = historical ? 'Live contributions are available for Today.' : 'Waiting for a complete portfolio observation.';
    $('todayLiveEvent').textContent = historical ? 'Select Today to resume.' : model.lastEvent;
    $('todayLiveContributors').style.display = historical ? 'none' : '';
    if (!hasData) {
      if (chart) { chart.destroy(); chart = null; chartSignature = ''; }
      return;
    }
    renderRows(); renderChart();
  }

  function renderRows() {
    const positions = [...globalData.positions].filter(p => Number.isFinite(model.values?.[p.id])).sort((a, b) =>
      Math.abs(model.values[b.id]) - Math.abs(model.values[a.id]) || String(a.id).localeCompare(String(b.id))).slice(0, 6);
    const wanted = new Set(positions.map(p => String(p.id)));
    rows.forEach((row, id) => { if (!wanted.has(id)) { row.remove(); rows.delete(id); } });
    const max = Math.max(1, ...positions.map(p => Math.abs(model.values[p.id])));
    $('todayLiveContributors').style.height = `${positions.length * 43}px`;
    positions.forEach((p, index) => {
      const id = String(p.id), value = model.values[id];
      let row = rows.get(id);
      if (!row) {
        row = document.createElement('button'); row.type = 'button'; row.className = 'today-live-row';
        row.innerHTML = '<span class="today-live-name"></span><span class="today-live-track" aria-hidden="true"><span class="today-live-bar"></span></span><span class="today-live-value sensitive"></span>';
        row.addEventListener('click', () => {
          document.querySelector('.tab-bar .tab-btn[data-tab="portfolio"]')?.click();
          expandPositionRow(id, false);
        });
        $('todayLiveContributors').appendChild(row); rows.set(id, row);
      }
      row.style.transform = `translateY(${index * 43}px)`;
      row.title = p.name || id;
      row.setAttribute('aria-label', `${p.name || id}: ${money(value)} today. Open portfolio chart.`);
      row.querySelector('.today-live-name').textContent = p.name || id;
      row.querySelector('.today-live-value').textContent = money(value);
      row.querySelector('.today-live-value').className = 'today-live-value sensitive ' + (value >= 0 ? 'positive' : 'negative');
      const bar = row.querySelector('.today-live-bar'), width = Math.abs(value) / max * 48;
      bar.style.left = `${value >= 0 ? 50 : 50 - width}%`; bar.style.width = `${width}%`;
      bar.style.backgroundColor = value >= 0 ? 'var(--green)' : 'var(--red)';
    });
  }

  function renderChart() {
    const signature = `${getTheme()}|${JSON.stringify(session.bars)}`;
    if (signature === chartSignature) return;
    chartSignature = signature;
    const bars = session.bars;
    const color = b => b.resumed || b.delta === 0 ? THEME_COLORS.tickColor : b.delta > 0 ? THEME_COLORS.plGreen : THEME_COLORS.plRed;
    const dataset = {
      data: bars.map((b,i) => ({x:i,y:b.delta})),
      backgroundColor: bars.map(color), borderWidth:0, borderRadius:2,
      minBarLength:2, maxBarThickness:12, barPercentage:0.8, categoryPercentage:0.9,
    };
    const limit = Math.max(0.01, ...bars.map(b => Math.abs(b.delta))) * 1.2;
    const options = {
      responsive:true, maintainAspectRatio:false, animation:false, parsing:false,
      interaction:{mode:'nearest',intersect:false},
      plugins:{legend:{display:false},tooltip:{...THEME_COLORS.themeTooltip(),callbacks:{
        title: items => new Date(bars[items[0].dataIndex].time).toLocaleTimeString(),
        label: item => {
          const b=bars[item.dataIndex];
          return b.resumed ? 'Recording resumed' : `${b.delta >= 0 ? '+' : '−'}€${Math.abs(b.delta).toFixed(2)} since previous reading`;
        },
        afterLabel: item => `Today's P&L: ${money(bars[item.dataIndex].total)}`,
      }}},
      scales:{
        x:{type:'linear',min:-0.5,max:59.5,grid:{display:false},ticks:{color:THEME_COLORS.tickColor,maxTicksLimit:5,
          callback: v => bars[Math.round(v)] ? new Date(bars[Math.round(v)].time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : ''}},
        y:{min:-limit,max:limit,grid:{color:ctx=>ctx.tick.value===0 ? THEME_COLORS.tickColor : THEME_COLORS.gridColor},
          ticks:{color:THEME_COLORS.tickColor,maxTicksLimit:5,callback:v=>`${v<0?'−':''}€${Math.abs(v).toFixed(2)}`}},
      },
    };
    if (!chart) chart = new Chart($('todayLiveChart'), {type:'bar',data:{datasets:[dataset]},options});
    else { Object.assign(chart.data.datasets[0],dataset); chart.options=options; chart.update('none'); }
  }

  async function refresh() {
    if (busy) { pending = true; return; }
    busy = true;
    try {
      do {
        pending = false;
        sync(globalData.todaySelectedDate);
        const generation = epoch;
        const { todayPulseMeta: meta } = await chrome.storage.local.get('todayPulseMeta');
        if (generation !== epoch) { pending = true; continue; }
        if (!meta || meta.account !== model.account || meta.date !== model.date) {
          model.reset(model.account, model.date);
          rows.forEach(row => row.remove()); rows.clear(); $('todayLiveContributors').style.height = '0px';
          status = 'Waiting for DEGIRO day recording';
          render(globalData.todaySelectedDate && globalData.todaySelectedDate !== getLocalTodayStr());
          continue;
        }
        // Only the current observation enters this session; no saved points.
        if (!model.restore({ ...meta, points: [] })) continue;
        if (!meta.status) session.accept(meta);
        const age = Date.now() - model.lastObservedAt;
        status = meta.status || (age > 15000 ? 'Waiting for DEGIRO updates' : 'Following DEGIRO');
        if (!paused && active() && globalData.todayIsLiveDate && globalData.todaySelectedDate === getLocalTodayStr()) {
          const changed = globalData._todayPL !== model.total || Object.keys(model.values || {}).some(id => globalData._todayPLPerPosition?.[id] !== model.values[id]);
          if (model.total !== null) {
            globalData._todayPL = model.total; globalData._todayPLPerPosition = { ...model.values };
            if (changed) { renderHeaderStats(globalData.positions); await renderTodayTab(); }
          }
        }
        render(globalData.todaySelectedDate && globalData.todaySelectedDate !== getLocalTodayStr());
      } while (pending);
    } finally { busy = false; }
  }
  const requestRefresh = () => refresh().catch(() => {
    status = 'Could not read the latest DEGIRO observation'; render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.intAccount) requestRefresh();
  });
  document.addEventListener('DOMContentLoaded', () => {
    $('todayLivePause')?.addEventListener('click', () => {
      paused = !paused; sync(globalData.todaySelectedDate); requestRefresh();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRefresh(); });
    // This timer only updates the display/freshness. It does not own recording.
    setInterval(requestRefresh, 2000);
    requestRefresh();
  });
  return { sync };
})();
