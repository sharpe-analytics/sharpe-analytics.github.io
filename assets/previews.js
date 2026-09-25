/* Embed the shipping dashboard. Product charts and controls run inside the frame;
   the parent only sizes it and connects the website's feature buttons. */
(() => {
 const frames=[];
 // Update this revision whenever demo HTML or its data changes.
 const demoUrl=tab=>'/demo/?v=market-2&tab='+encodeURIComponent(tab);
 function embed(host,tab,hero=false){
  const shell=document.createElement('div');shell.className='native-preview';
  const stage=document.createElement('div');stage.className='native-stage';
  const frame=document.createElement('iframe');frame.title=hero?'Interactive Sharpe portfolio — fictional sample data':'Interactive Sharpe dashboard — fictional sample data';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads');frame.loading=hero?'eager':'lazy';frame.src=demoUrl(tab);
  stage.append(frame);shell.append(stage);
  const caption=document.createElement('p');caption.className='native-caption';caption.append(document.createTextNode('Explore Sharpe with a fictional sample portfolio. '));
  const full=document.createElement('a');full.href=demoUrl(tab);full.target='_blank';full.rel='noopener';full.textContent='Open full-size demo';caption.append(full);if(!hero)shell.append(caption);host.append(shell);
  function resize(){const w=stage.clientWidth,base=Math.max(1440,w),scale=w/base,h=hero?960:1120;frame.style.width=base+'px';frame.style.height=h+'px';frame.style.transform=`scale(${scale})`;if(!hero)stage.style.height=h*scale+'px';}
  new ResizeObserver(resize).observe(stage);resize();
  const entry={frame,full,tab,hero,ready:false};frames.push(entry);return entry;
 }
 const hero=document.querySelector('.hero-product');if(hero){const original=[...hero.querySelectorAll(':scope > .screenshot-link')];const entry=embed(hero,'portfolio',true);entry.fallback=()=>original.forEach(el=>el.hidden=true);}
 const panels=document.querySelector('.feature-panels');let feature;
 if(panels){feature=embed(panels,'portfolio');feature.fallback=()=>panels.querySelectorAll('.feature-panel figure').forEach(el=>el.hidden=true);
  document.querySelectorAll('[data-feature]').forEach(button=>button.addEventListener('click',()=>{feature.tab=button.dataset.feature;feature.full.href=demoUrl(feature.tab);if(feature.ready)feature.frame.contentWindow.postMessage({type:'sharpe-demo-tab',tab:feature.tab},location.origin);}));
 }
 window.addEventListener('message',event=>{if(event.origin!==location.origin)return;const entry=frames.find(x=>x.frame.contentWindow===event.source);if(!entry)return;
  if(event.data?.type==='sharpe-demo-ready'){entry.ready=true;entry.fallback();entry.frame.contentWindow.postMessage({type:'sharpe-demo-tab',tab:entry.tab},location.origin);}
  if(event.data?.type==='sharpe-demo-selected'&&entry===feature){const button=document.querySelector(`[data-feature="${event.data.tab}"]`);if(button&&entry.tab!==event.data.tab){entry.tab=event.data.tab;button.click();}}
 });
})();
