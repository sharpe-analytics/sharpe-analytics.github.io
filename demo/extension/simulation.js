// Pro simulator UI. Inputs, histories and results live only in this page's memory.
const Simulation = (() => {
  const $ = id => document.getElementById(id);
  const benchmarks = { __SP500__: 'S&P 500', __EUROSTOXX__: 'Euro Stoxx 50', __NASDAQ__: 'Nasdaq 100' };
  let initialized = false, fingerprint = '', account = null, snapshot = null;
  let amount = 0, every = 1, horizon = 10, allocations = {}, selected = {}, proxies = {};
  let histories = null, prepared = null, result = null, runSummary = '', stale = false;
  let loading = false, worker = null, jobId = 0, generation = 0, chart = null;
  const active = () => $('tabSimulation')?.classList.contains('active');
  const eur = n => fmtEur(n);
  function localDate() { return getLocalTodayStr(); }
  function readSnapshot() {
    const positions = (globalData.positions || []).map(p => ({ id: String(p.id), name: p.name || `ID ${p.id}`, value: p.value, size: p.size })).sort((a,b) => a.id.localeCompare(b.id));
    const raw = globalData.data?.portfolio?.portfolio?.value;
    let cash = globalData._cashValue || 0, rawShort = false;
    if (Array.isArray(raw)) {
      cash = 0;
      for (const row of raw) {
        const f = Object.fromEntries((row.value || []).map(v => [v.name, v.value]));
        if (CASH_IDS.has(String(f.id || row.id || ''))) cash += Number(f.value || 0);
        if (f.positionType === 'PRODUCT' && (f.size < 0 || f.value < 0)) rawShort = true;
      }
    }
    return { account: String(globalData.data?.intAccount || ''), positions, cash, rawShort,
      synced: globalData.data?.lastFetch || null, vwdIds: globalData.vwdIds || {}, asOf: localDate() };
  }
  // Reveal completed results without fabricating intermediate engine output.
  // Clip only datasets: axes stay fixed and the percentile fill follows the lines.
  let revealFrame = 0;
  const revealPlugin = {
    id: 'simulationReveal',
    beforeDatasetsDraw(c) {
      if ((c.$revealProgress ?? 1) >= 1) return;
      const { left, top, right, bottom } = c.chartArea;
      c.ctx.save();
      c.ctx.beginPath();
      c.ctx.rect(left, top, (right - left) * c.$revealProgress, bottom - top);
      c.ctx.clip();
      c.$revealClipped = true;
    },
    afterDatasetsDraw(c) {
      if (c.$revealClipped) { c.ctx.restore(); c.$revealClipped = false; }
    },
  };
  function stopReveal() {
    if (revealFrame) { cancelAnimationFrame(revealFrame); status('Simulation complete.'); }
    revealFrame = 0;
    if (chart) {
      chart.$revealProgress = 1;
      chart.options.plugins.tooltip.enabled = true;
      // Chart.js caches resolved plugin options; draw() alone leaves the
      // tooltip instance disabled after the reveal. Refresh without animation.
      chart.update('none');
    }
  }
  function startReveal() {
    const started = performance.now();
    status('Revealing simulation results…');
    const frame = now => {
      if (!chart) { revealFrame = 0; return; }
      if (!active() || !proUnlocked || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        stopReveal(); status('Simulation complete.'); return;
      }
      const progress = Math.min(1, (now - started) / 3600);
      chart.$revealProgress = progress;
      chart.draw();
      if (progress < 1) revealFrame = requestAnimationFrame(frame);
      else { stopReveal(); status('Simulation complete.'); }
    };
    revealFrame = requestAnimationFrame(frame);
  }
  function cancel() {
    stopReveal();
    jobId++;
    if (worker) { worker.terminate(); worker = null; }
  }
  function defaults() {
    allocations = {}; selected = {};
    const total = snapshot.positions.reduce((s,p) => s + Math.max(0,p.value), 0);
    let used = 0;
    snapshot.positions.forEach(p => { const bp = total ? Math.floor(Math.max(0,p.value) / total * 10000) : 0; allocations[p.id] = bp / 100; used += bp; selected[p.id] = true; });
    if (total > 0) {
      const largest = [...snapshot.positions].sort((a,b) => b.value - a.value)[0];
      allocations[largest.id] = (Math.round(allocations[largest.id] * 100) + 10000 - used) / 100;
    }
  }
  function status(message, error = false) {
    $('simStatus').textContent = message; $('simStatus').dataset.error = String(error);
  }
  function gate() {
    $('simWorkspace').hidden = !proUnlocked;
    $('simPreview').hidden = proUnlocked;
    if (proUnlocked) removeProOverlay($('simPreview'));
    else { cancel(); showProOverlay($('simPreview'), 'Simulated performance'); }
  }
  function markStale(message = 'Inputs changed. Run again to update the results.') {
    cancel(); stale = !!result; $('simStale').hidden = !stale;
    status(message); updateRunButton();
  }
  function portfolioChanged() {
    const next = readSnapshot();
    const key = JSON.stringify([next.account, next.synced, next.asOf, next.cash, next.rawShort, next.positions]);
    if (key === fingerprint) {
      if (initialized) { gate(); if (active() && result) renderResults(); }
      return;
    }
    const newAccount = account !== next.account;
    const newPositions = !snapshot || snapshot.positions.map(p=>p.id).join(',') !== next.positions.map(p=>p.id).join(',');
    fingerprint = key; account = next.account; snapshot = next;
    generation++; cancel(); loading = false; histories = null; prepared = null;
    if (newAccount) {
      amount = 0; every = 1; horizon = 10; proxies = {}; result = null; runSummary = ''; stale = false;
      if (chart) { chart.destroy(); chart = null; }
    } else stale = !!result;
    if (newAccount || newPositions) { defaults(); proxies = Object.fromEntries(Object.entries(proxies).filter(([id])=>snapshot.positions.some(p=>p.id===id))); }
    if (!initialized) return;
    $('simCoverage').textContent = ''; $('simCoverageSummary').textContent = 'History has not been loaded for this portfolio yet.';
    gate(); renderInputs(); renderResults();
    status(newAccount ? 'Set your contribution plan.' : 'Portfolio refreshed. Run again to use the latest values.');
    if (active() && proUnlocked) loadHistories();
  }
  function unsupported() {
    if (!snapshot?.account) return 'Sync your DEGIRO account before running a simulation.';
    if (!snapshot.positions.length) return 'A portfolio with at least one open holding is required.';
    if (!Number.isFinite(snapshot.cash) || snapshot.cash < 0 || snapshot.rawShort || snapshot.positions.some(p=>!Number.isFinite(p.value) || p.value < 0 || p.size < 0))
      return 'Short positions and negative cash are not supported by this long-only simulation.';
    return '';
  }
  function updateRunButton() {
    $('simRun').disabled = loading || !!worker || !!unsupported() || !prepared?.ready;
    $('simRun').textContent = worker ? 'Simulating…' : 'Run simulation';
  }
  function renderInputs() {
    $('simStarting').textContent = eur(snapshot.positions.reduce((s,p)=>s+p.value, snapshot.cash));
    $('simSync').textContent = `Includes ${eur(snapshot.cash)} cash at zero growth · ${snapshot.synced ? 'Synced ' + new Date(snapshot.synced).toLocaleString() : 'Sync date unavailable'}`;
    $('simSync').classList.add('sensitive');
    $('simAmount').value = amount; $('simEvery').value = every; $('simHorizon').value = horizon;
    $('simPresets').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed', String(Number(b.dataset.months) === every)));
    const wrap = $('simAllocations'); wrap.textContent = '';
    snapshot.positions.forEach((p,index)=>{
      const row = document.createElement('div'); row.className = 'sim-allocation-row';
      const label = document.createElement('label'), check = document.createElement('input');
      check.type = 'checkbox'; check.checked = !!selected[p.id];
      const name = document.createElement('span'); name.textContent = p.name; name.title = p.name;
      label.append(check,name);
      const input = document.createElement('input'); input.className='sim-input'; input.type='number'; input.min='0'; input.max='100'; input.step='.01'; input.value=allocations[p.id] ?? 0;
      input.disabled=!check.checked; input.setAttribute('aria-label', `Contribution percentage for ${p.name}`);
      const unit = document.createElement('span'); unit.textContent='%';
      check.addEventListener('change',()=>{ selected[p.id]=check.checked; input.disabled=!check.checked; markStale(); allocationTotal(); });
      input.addEventListener('input',()=>{ allocations[p.id]=input.value.trim()==='' ? NaN : Number(input.value); markStale(); allocationTotal(); });
      row.append(label,input,unit); wrap.appendChild(row);
    });
    allocationTotal(); updateRunButton();
  }
  function allocationTotal() {
    const total = snapshot.positions.reduce((s,p)=>s+(selected[p.id] ? allocations[p.id] : 0),0);
    $('simAllocationTotal').textContent = Number.isFinite(total) ? `${total.toFixed(2)}%` : 'Invalid split';
    $('simAllocationTotal').className = amount > 0 && Math.abs(total-100) > 1e-6 || !Number.isFinite(total) ? 'negative' : '';
  }
  async function loadHistories() {
    const issue = unsupported();
    if (issue) { status(issue,true); updateRunButton(); return; }
    if (loading || histories || !proUnlocked) return;
    loading = true; const token = generation;
    status('Loading five-year price histories…'); $('simRetry').hidden = true; updateRunButton();
    try {
      const response = await chrome.runtime.sendMessage({ type:'FETCH_PRICE_HISTORY', vwdIds:snapshot.vwdIds, period:'5Y' });
      if (token !== generation || !proUnlocked) return;
      if (!response || response.error || !Object.values(response).some(Array.isArray)) throw Error(response?.error || 'No price histories were returned.');
      histories = Object.fromEntries(Object.entries(response).filter(([,h])=>Array.isArray(h)));
      prepareCoverage();
    } catch(error) {
      if (token !== generation) return;
      status(`Could not load price history: ${error.message}`,true); $('simRetry').hidden=false;
    } finally { if (token === generation) { loading=false; updateRunButton(); } }
  }
  function prepareCoverage() {
    prepared = SimulationCore.prepare(histories, snapshot.positions, proxies, snapshot.asOf);
    const names = { ...benchmarks, ...Object.fromEntries(snapshot.positions.map(p=>[p.id,p.name])) };
    const candidates = prepared.eligible.filter(id=>names[id]);
    $('simCoverage').textContent='';
    prepared.coverage.forEach(c=>{
      const p = snapshot.positions.find(p=>p.id===c.id);
      const row=document.createElement('div');row.className='sim-coverage-row';
      const label=document.createElement('label');label.textContent=p.name;label.htmlFor=`simProxy-${c.id}`;
      const select=document.createElement('select'); select.className='sim-input';select.id=label.htmlFor;
      const own=document.createElement('option');own.value='';own.textContent='Use this holding’s price history';select.appendChild(own);
      const choices = new Set(candidates.filter(id=>id!==c.id));
      if (proxies[c.id]) choices.add(proxies[c.id]);
      choices.forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=`Proxy: ${names[id] || id}${prepared.eligible.includes(id)?'':' (insufficient history)'}`;select.appendChild(option);});
      select.value=proxies[c.id] || '';
      select.addEventListener('change',()=>{if(select.value)proxies[c.id]=select.value;else delete proxies[c.id];markStale();prepareCoverage();});
      const note=document.createElement('p');note.className='sim-caption';note.textContent=`${c.count} consecutive months${c.from ? ` · ${c.from} to ${c.to}` : ''}${c.source!==c.id?' · Proxy replaces the complete return series':''}`;
      row.append(label,select,note);$('simCoverage').appendChild(row);
    });
    $('simCoverageSummary').textContent = prepared.ready ? `Shared history: ${prepared.months[0]} to ${prepared.months.at(-1)} · ${prepared.months.length} consecutive months.` : `Only ${prepared.months.length} consecutive shared months available; 36 are required. Select a sufficiently covered proxy for holdings that limit the shared window.`;
    $('simRetry').hidden = prepared.ready;
    if (!prepared.ready) { $('simAssumptions').open=true; status('History coverage is insufficient. Review the proxy choices below.',true); }
    else status(result ? 'History ready. Run again to apply any changes.' : 'Ready to simulate.');
    updateRunButton();
  }
  function run() {
    if (!proUnlocked || loading || worker) return;
    const issue=unsupported(); if(issue){status(issue,true);return;}
    if (!prepared?.ready) { status('At least 36 shared months are required. Choose suitable proxies below.',true); return; }
    const input={ initial:snapshot.positions.map(p=>p.value),cash:snapshot.cash,
      allocation:snapshot.positions.map(p=>(selected[p.id]?allocations[p.id]:0)/100), amount,every,
      returns:prepared.returns,paths:2000,months:360 };
    try { SimulationCore.validate(input); } catch(error) { status(error.message,true); return; }
    input.seed=SimulationCore.seedFor({ version:1, ids:snapshot.positions.map(p=>p.id), ...input });
    cancel(); const token=jobId;
    const sourceSummary=prepared.coverage.filter(c=>c.source!==c.id).map(c=>`${snapshot.positions.find(p=>p.id===c.id).name} → ${benchmarks[c.source] || snapshot.positions.find(p=>p.id===c.source)?.name || c.source}`);
    const summary=`2,000 paths · Starting value ${eur(input.initial.reduce((s,v)=>s+v,input.cash))} · ${eur(amount)} every ${every} month${every===1?'':'s'} · History ${prepared.months[0]}–${prepared.months.at(-1)}${sourceSummary.length ? ' · Proxies: '+sourceSummary.join('; ') : ' · No proxies'}. Median gain excludes starting value and new contributions.`;
    try {
      worker=new Worker(chrome.runtime.getURL('simulation-worker.js'));
      status('Running 2,000 historical simulations…'); updateRunButton();
      worker.onmessage=({data})=>{
        if (data.jobId!==jobId || token!==jobId || !proUnlocked) return;
        if (data.progress!==undefined) { status(`Simulating… ${data.progress}%`); return; }
        worker.terminate();worker=null;
        if (data.error) status(data.error,true);
        else { result=data.result;runSummary=summary;stale=false;status('Simulation complete.');renderResults({ reveal: true }); }
        updateRunButton();
      };
      worker.onerror=()=>{ if(token!==jobId)return;cancel();status('The simulation could not finish. Please try again.',true);updateRunButton(); };
      worker.postMessage({jobId:token,input});
    } catch(error) { cancel();status(`Could not start simulation: ${error.message}`,true);updateRunButton(); }
  }
  function renderResults({ reveal = false } = {}) {
    stopReveal();
    $('simStale').hidden=!stale; $('simTableWrap').hidden=!result; $('simEmpty').hidden=!!result;
    $('simRunSummary').textContent=result?runSummary:''; $('simRunSummary').classList.add('sensitive');
    $('simResults').textContent='';
    $('simResultTitle').textContent=result?`Possible outcomes over ${horizon} year${horizon===1?'':'s'}`:'Your possible paths';
    if (!result) { if(chart){chart.destroy();chart=null;}return; }
    for (const row of result.horizons) {
      const tr=document.createElement('tr');tr.dataset.selected=String(row.year===horizon);
      [String(row.year),eur(row.contributions),eur(row.median),eur(row.gain),`${eur(row.p10)} – ${eur(row.p90)}`].forEach((text,index)=>{const td=document.createElement('td');td.textContent=text;if(index)td.className='sensitive';tr.appendChild(td);});
      $('simResults').appendChild(tr);
    }
    if (!active() || !proUnlocked) return;
    const animateReveal = reveal && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const values=result.monthly.slice(0,horizon*12+1);
    const css=getComputedStyle(document.documentElement),accent=css.getPropertyValue('--accent').trim(),muted=css.getPropertyValue('--muted').trim();
    const points=key=>values.map(v=>({x:v.month/12,y:v[key]}));
    const datasets=[
      {label:'10th percentile',data:points('p10'),borderWidth:0,pointRadius:0,backgroundColor:accent+'26'},
      {label:'90th percentile',data:points('p90'),borderWidth:0,pointRadius:0,backgroundColor:accent+'26',fill:'-1'},
      {label:'Median',data:points('median'),borderColor:accent,borderWidth:2,pointRadius:0},
      {label:'Starting value + contributions',data:points('baseline'),borderColor:muted,borderDash:[5,4],borderWidth:1.5,pointRadius:0},
    ];
    const options={responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{enabled:!animateReveal,...THEME_COLORS.themeTooltip(),callbacks:{title:items=>`Year ${items[0].parsed.x.toFixed(1)}`,label:ctx=>`${ctx.dataset.label}: ${eur(ctx.parsed.y)}`}}},
      scales:{x:{type:'linear',min:0,max:horizon,title:{display:true,text:'Years from starting portfolio',color:THEME_COLORS.tickColor},grid:{display:false},ticks:{color:THEME_COLORS.tickColor,maxTicksLimit:6}},
        y:{beginAtZero:true,title:{display:true,text:'Portfolio value (EUR)',color:THEME_COLORS.tickColor},grid:{color:THEME_COLORS.gridColor},ticks:{color:THEME_COLORS.tickColor,maxTicksLimit:6,callback:v=>new Intl.NumberFormat(undefined,{notation:'compact',style:'currency',currency:'EUR',maximumFractionDigits:1}).format(v)}}}};
    if(chart){chart.$revealProgress=animateReveal?0:1;chart.data={datasets};chart.options=options;chart.update('none');}
    else chart=new Chart($('simChart'),{type:'line',data:{datasets},options,plugins:[
      { id:'simulationRevealInit', beforeInit(c) { c.$revealProgress=animateReveal?0:1; } }, revealPlugin,
    ]});
    if(animateReveal) startReveal();
  }
  function initialize() {
    if(initialized)return;initialized=true;
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden && revealFrame){stopReveal();status('Simulation complete.');}
    });
    $('simAmount').addEventListener('input',e=>{amount=e.target.value.trim()===''?NaN:Number(e.target.value);markStale();allocationTotal();});
    $('simEvery').addEventListener('input',e=>{every=e.target.value.trim()===''?NaN:Number(e.target.value);markStale();$('simPresets').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.months)===every)));});
    $('simPresets').addEventListener('click',e=>{const b=e.target.closest('button[data-months]');if(!b)return;every=Number(b.dataset.months);$('simEvery').value=every;markStale();$('simPresets').querySelectorAll('button').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===b)));});
    $('simHorizon').addEventListener('change',e=>{horizon=Number(e.target.value);renderResults();});
    $('simClearAllocation').addEventListener('click',()=>{
      snapshot.positions.forEach(p=>{allocations[p.id]=0;selected[p.id]=false;});
      markStale('Allocation cleared. Select holdings and set their percentages.');
      renderInputs();
    });
    $('simPortfolioAllocation').addEventListener('click',()=>{
      defaults();
      markStale('Allocation restored to the latest synced portfolio split.');
      renderInputs();
    });
    $('simRun').addEventListener('click',run);
    $('simRetry').addEventListener('click',()=>{histories=null;loadHistories();});
  }
  function open() {
    portfolioChanged();initialize();gate();
    if(!proUnlocked)return;
    renderInputs();renderResults();
    const issue=unsupported();if(issue){status(issue,true);return;}
    if(!histories)loadHistories();else prepareCoverage();
  }
  return { open, portfolioChanged };
})();
