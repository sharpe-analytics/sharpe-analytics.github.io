/* Connect the website tabs to the actual dashboard tab handlers. */
(() => {
 let ready=false,pending=new URLSearchParams(location.search).get('tab')||'portfolio';
 let simulationStarted=false;
 async function warm(tab){if(tab!=='simulation'||simulationStarted)return;simulationStarted=true;for(let i=0;i<100;i++){const run=document.getElementById('simRun');if(run&&!run.disabled&&!document.getElementById('simWorkspace').hidden){const amount=document.getElementById('simAmount');amount.value='250';amount.dispatchEvent(new Event('input',{bubbles:true}));run.click();return;}await new Promise(resolve=>setTimeout(resolve,100));}simulationStarted=false;}
 const valid=new Set(['portfolio','today','insights','dividends','simulation']);
 function select(tab){if(!valid.has(tab))return;pending=tab;if(!ready)return;document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.click();warm(tab);requestAnimationFrame(()=>requestAnimationFrame(report));}
 function report(){parent.postMessage({type:'sharpe-demo-height',height:Math.ceil(document.documentElement.scrollHeight)},location.origin);}
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent)return;if(event.data?.type==='sharpe-demo-tab')select(event.data.tab);});
 document.querySelector('#btnPro')?.setAttribute('aria-label','Pro features enabled for this sample portfolio');
 const observer=new ResizeObserver(report);observer.observe(document.body);
 const timer=setInterval(()=>{if(document.querySelector('#mainContent')?.style.display!=='none'&&document.querySelector('#positionsBody')?.children.length){clearInterval(timer);ready=true;select(pending);document.body.dataset.demoReady='true';parent.postMessage({type:'sharpe-demo-ready'},location.origin);}},100);
 document.querySelector('#tabBar')?.addEventListener('click',e=>{const tab=e.target.closest('[data-tab]')?.dataset.tab;if(valid.has(tab)){pending=tab;warm(tab);parent.postMessage({type:'sharpe-demo-selected',tab},location.origin);}});
 // Feed only fictional quote changes through the same storage interface as the extension.
 let tick=0;setInterval(()=>{if(document.hidden||pending!=='today')return;const sample=SharpeSample,now=Date.now();tick++;sample.moves['1']+=Math.sin(tick*1.7)*1.7;chrome.storage.local.set({todayPulseMeta:{account:'4242',date:sample.today,ids:Object.keys(sample.moves).join(','),values:{...sample.moves},total:Object.values(sample.moves).reduce((a,b)=>a+b,0),lastObservedAt:now,lastChangedAt:now,lastEvent:'Fictional sample price update',gap:false}});},2000);
})();
