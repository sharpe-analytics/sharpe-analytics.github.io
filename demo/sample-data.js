/* Browser-only adapter. All portfolio data and price history are fictional.
   This does not read browser-extension storage or contact any external service. */
(() => {
 const events=[],messages=[];
 const now=Date.now(),day=864e5,today=new Date(now).toISOString().slice(0,10);
 const names=['iShares Core S&P 500 ETF','Vanguard FTSE All-World ETF','ASML Holding','Schneider Electric','iShares Physical Gold ETC','iShares Core Euro Govt Bond ETF'];
 const quantities=[40,130,12,30,95,35],bases=[490,109,625,190,47,109],prices={};
 // One shared, seeded market path keeps benchmarks and holdings related without
 // repeating waves. Weekday observations include volatile sell-offs and recoveries.
 let seed=424242;
 const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed+.5)/4294967296;};
 const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
 const dates=Array.from({length:1827},(_,i)=>new Date(now-(1826-i)*day))
   .filter(d=>d.getUTCDay()!==0&&d.getUTCDay()!==6).map(d=>d.toISOString().slice(0,10));
 const ids=['1','2','3','4','5','6','__SP500__','__EUROSTOXX__','__NASDAQ__','__STOXX600__'];
 const values=[...bases.map(v=>v*.75),100,100,100,100];
 ids.forEach(id=>prices[id]=[]);
 let volatility=.008;
 dates.forEach((date,i)=>{
   const phase=i/dates.length;
   const stress=(phase>.22&&phase<.34)||(phase>.68&&phase<.73);
   const innovation=normal();
   volatility=.92*volatility+.08*(stress?.017:.007)+.0003*Math.abs(innovation);
   const market=(stress?-.0014:.00065)+volatility*innovation;
   const europe=.78*market+.0035*normal();
   const tech=1.18*market+.005*normal();
   const rates=.003*normal();
   const returns=[market+.0005*normal(),.72*market+.28*europe+.001*normal(),
     1.15*tech+.009*normal(),1.05*europe+.006*normal(),
     .00022-.15*market+.008*normal(),.00006-.08*market+rates,
     market,europe+.001*normal(),tech,europe];
   ids.forEach((id,j)=>{values[j]*=Math.exp(returns[j]);prices[id].push({date,price:Math.round(values[j]*100)/100});});
 });
 const start=prices['1'][0].date;
 const productInfo={data:Object.fromEntries(names.map((name,j)=>[String(j+1),{name,currency:'EUR',productTypeId:j===2||j===3?1:131,vwdId:'sample-'+j,vwdIdentifierType:'issueid',isin:['IE00B5BMR087','IE00B3RBWM25','NL0010273215','FR0000121972','IE00B4ND3602','IE00B4WXJJ64'][j]}]))};
 const tx=names.map((_,j)=>({date:start,productId:String(j+1),quantity:quantities[j],price:prices[String(j+1)][0].price,totalInBaseCurrency:-quantities[j]*prices[String(j+1)][0].price,totalFeesInBaseCurrency:2,buysell:'B'}));
 const positionRows=names.map((_,j)=>{const id=String(j+1),price=prices[id].at(-1).price;const f={id,positionType:'PRODUCT',size:quantities[j],price,value:price*quantities[j],breakEvenPrice:prices[id][0].price};return{id,name:'positionrow',value:Object.entries(f).map(([name,value])=>({name,value}))};});
 positionRows.push({id:'EUR',value:[{name:'id',value:'EUR'},{name:'value',value:2500}]});
 const moves=Object.fromEntries(names.map((_,j)=>[String(j+1),Math.round((prices[String(j+1)].at(-1).price-prices[String(j+1)].at(-2).price)*quantities[j]*100)/100]));
 const total=positionRows.slice(0,-1).reduce((s,r)=>s+r.value.find(x=>x.name==='value').value,2500);
 const store={hasData:true,lastFetch:now,intAccount:4242,productInfo,portfolio:{portfolio:{value:positionRows}},transactions:{data:tx},dividends:{data:Array.from({length:36},(_,i)=>({date:new Date(now-(i*30+10)*day).toISOString().slice(0,10),product:'2',amount:43+(i%4)*17,currency:'EUR'}))},scrapedDailyPnLPerPosition:moves,scrapedDailyPnL:Object.values(moves).reduce((a,b)=>a+b,0),scrapedPortfolioValue:total,pro_isPro:true,pro_licenseKey:'fictional-demo',pro_validatedAt:now,sharpeTheme:'dark',reviewDone:true,reviewOpens:0,favouriteProductIds:['1','2','3'],favouriteProductInfo:productInfo,enabledBenchmarks:['sp500']};
 const storage={get(keys,cb){let value;if(keys==null)value={...store};else if(typeof keys==='string')value={[keys]:store[keys]};else if(Array.isArray(keys))value=Object.fromEntries(keys.map(k=>[k,store[k]]));else value=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,store[k]??v]));if(cb)cb(value);return Promise.resolve(value);},set(values,cb){const changed={};Object.entries(values).forEach(([k,v])=>{changed[k]={oldValue:store[k],newValue:v};store[k]=v});events.forEach(fn=>fn(changed,'local'));cb?.();return Promise.resolve();},remove(keys,cb){(Array.isArray(keys)?keys:[keys]).forEach(k=>delete store[k]);cb?.();return Promise.resolve();}};
 window.chrome={storage:{local:storage,sync:storage,onChanged:{addListener:fn=>events.push(fn),removeListener:fn=>{const i=events.indexOf(fn);if(i>=0)events.splice(i,1);}}},runtime:{getURL:p=>new URL('extension/'+p,location.href).href,onMessage:{addListener:fn=>messages.push(fn)},sendMessage:async request=>{if(request.type==='FETCH_PRICE_HISTORY')return prices;if(request.type==='GET_STORED')return{...store};if(request.type==='FETCH_ALL'){store.lastFetch=Date.now();return{demo:true};}return{};}},tabs:{query:async()=>[],create:()=>{}},permissions:{contains:async()=>false}};
 window.SharpeSample={store,prices,moves,today};
})();
