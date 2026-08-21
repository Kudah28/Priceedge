"use strict";

const API_KEY=process.env.TWELVE_DATA_API_KEY||process.env.TWELVEDATA_API_KEY||process.env.TWELVE_DATA_KEY||"";
const SYMBOLS=["XAU/USD","EUR/USD","GBP/USD","USD/JPY"];
const ALLOWED=["1min","5min","15min","1h","4h","1day"];
const INTERVAL_MS={"1min":60e3,"5min":5*60e3,"15min":15*60e3,"1h":60*60e3,"4h":4*60*60e3,"1day":24*60*60e3};
const cache=new Map();
const inflight=new Map();
const CACHE_MS=10e3;

function validSymbol(symbol){return SYMBOLS.includes(symbol);}
function validInterval(interval){return ALLOWED.includes(interval);}
function parseTime(v){
  const s=String(v||"");
  const t=Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s)?s:s.replace(" ","T")+"Z");
  return Number.isFinite(t)?t:null;
}
function normalize(values){
  if(!Array.isArray(values))return [];
  const out=[];
  for(const c of values){
    const datetime=String(c?.datetime||"");
    const open=Number(c?.open),high=Number(c?.high),low=Number(c?.low),close=Number(c?.close);
    const time=parseTime(datetime);
    if(!datetime||time===null||![open,high,low,close].every(Number.isFinite))continue;
    if(high<Math.max(open,close)||low>Math.min(open,close)||low>high)continue;
    out.push({datetime,open,high,low,close,_time:time});
  }
  out.sort((a,b)=>a._time-b._time);
  const unique=[];
  for(const c of out){if(unique.length&&unique.at(-1)._time===c._time)unique[unique.length-1]=c;else unique.push(c);}
  return unique.map(({_time,...c})=>c);
}
function quality(values,interval,requestedSize){
  const intervalMs=INTERVAL_MS[interval];
  const times=values.map(c=>parseTime(c.datetime)).filter(Number.isFinite);
  const lastTime=times.at(-1)||0;
  const ageMs=lastTime?Math.max(0,Date.now()-lastTime):Infinity;
  const freshnessLimit=intervalMs?Math.max(intervalMs*2.5,90e3):15*60e3;
  const chronological=times.every((t,i)=>i===0||t>times[i-1]);
  const minimum=Math.min(Number(requestedSize)||40,40);
  const sufficient=values.length>=minimum;
  const fresh=ageMs<=freshnessLimit;
  const valid=values.length>0&&chronological&&sufficient;
  return {valid,sufficient,fresh,chronological,count:values.length,lastCandleAt:lastTime?new Date(lastTime).toISOString():null,ageMs:Number.isFinite(ageMs)?Math.round(ageMs):null,freshnessLimitMs:freshnessLimit,status:!valid?"invalid":!fresh?"stale":"fresh"};
}
async function fetchTwelveData(symbol,interval,size=300){
  if(!API_KEY)throw new Error("Twelve Data API key is not configured.");
  const url=new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol",symbol);url.searchParams.set("interval",interval);url.searchParams.set("outputsize",String(Math.min(Math.max(Number(size)||300,40),500)));url.searchParams.set("order","asc");
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const r=await fetch(url,{headers:{Authorization:`apikey ${API_KEY}`},cache:"no-store",signal:controller.signal});
    const d=await r.json();
    if(!r.ok||d.status==="error"||!Array.isArray(d.values))throw new Error(d.message||`Market-data request failed (${r.status}).`);
    const values=normalize(d.values);
    const q=quality(values,interval,size);
    if(!q.valid)throw new Error("Twelve Data returned invalid or insufficient candle data.");
    return {values,quality:q,source:"Twelve Data"};
  }finally{clearTimeout(timer);}
}
async function getMarket(symbol,interval,size=300){
  if(!validSymbol(symbol)||!validInterval(interval))throw new Error("Unsupported symbol or timeframe.");
  const requested=Math.min(Math.max(Number(size)||300,40),500);
  const key=`${symbol}|${interval}|${requested}`;
  const now=Date.now(),cached=cache.get(key);
  if(cached&&now-cached.fetchedAt<CACHE_MS)return {...cached,cached:true};
  if(inflight.has(key))return inflight.get(key);
  const p=fetchTwelveData(symbol,interval,requested).then(data=>{const item={...data,fetchedAt:Date.now(),cached:false};cache.set(key,item);return item;}).finally(()=>inflight.delete(key));
  inflight.set(key,p);return p;
}
function snapshot(){
  return [...cache.entries()].map(([key,v])=>{const [symbol,interval,size]=key.split("|");return {symbol,interval,size,fetchedAt:new Date(v.fetchedAt).toISOString(),...v.quality};});
}
module.exports={API_KEY,SYMBOLS,ALLOWED,INTERVAL_MS,parseTime,normalize,quality,getMarket,snapshot};
