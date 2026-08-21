"use strict";
const TIMEFRAMES=["5min","15min","1h","4h","1day"];
const n=Number,finite=v=>Number.isFinite(n(v)),avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0,clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const range=c=>Math.max(0,c.high-c.low),body=c=>Math.abs(c.close-c.open),dir=c=>c.close>c.open?1:c.close<c.open?-1:0;
function normalizeCandles(c){return(Array.isArray(c)?c:[]).map(x=>({datetime:x.datetime,open:n(x.open),high:n(x.high),low:n(x.low),close:n(x.close)})).filter(x=>x.datetime&&[x.open,x.high,x.low,x.close].every(finite)&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close));}
function sma(v,p){return avg(v.slice(-p));}
function atr(d,p=14){const a=d.slice(-(p+1));if(!a.length)return 0;return avg(a.map((c,i)=>!i?range(c):Math.max(c.high-c.low,Math.abs(c.high-a[i-1].close),Math.abs(c.low-a[i-1].close))).slice(-p));}
function pivots(d,w=2){const highs=[],lows=[];for(let i=w;i<d.length-w;i++){let hi=true,lo=true;for(let j=1;j<=w;j++){hi=hi&&d[i].high>=d[i-j].high&&d[i].high>=d[i+j].high;lo=lo&&d[i].low<=d[i-j].low&&d[i].low<=d[i+j].low;}if(hi)highs.push({index:i,price:d[i].high,datetime:d[i].datetime});if(lo)lows.push({index:i,price:d[i].low,datetime:d[i].datetime});}return{highs,lows};}
function structure(d){const p=pivots(d),h=p.highs.slice(-4),l=p.lows.slice(-4);if(h.length<2||l.length<2)return{label:"Developing",bias:0,pivots:p};const hh=h.at(-1).price>h.at(-2).price,hl=l.at(-1).price>l.at(-2).price,lh=h.at(-1).price<h.at(-2).price,ll=l.at(-1).price<l.at(-2).price;if(hh&&hl)return{label:"HH / HL",bias:1,pivots:p};if(lh&&ll)return{label:"LH / LL",bias:-1,pivots:p};return{label:"Range / mixed",bias:0,pivots:p};}
function pattern(c){const r=range(c);if(!r)return"None";const b=body(c),u=c.high-Math.max(c.open,c.close),l=Math.min(c.open,c.close)-c.low;if(b/r<.35&&l>b*2&&u<b)return"Bullish pin bar";if(b/r<.35&&u>b*2&&l<b)return"Bearish pin bar";return"None";}
function engulf(d){if(d.length<2)return"None";const a=d.at(-2),b=d.at(-1);if(a.close<a.open&&b.close>b.open&&b.open<=a.close&&b.close>=a.open)return"Bullish engulfing";if(a.close>a.open&&b.close<b.open&&b.open>=a.close&&b.close<=a.open)return"Bearish engulfing";return"None";}
function levels(d){const p=pivots(d),price=d.at(-1).close,s=p.lows.map(x=>x.price).filter(x=>x<price).sort((a,b)=>b-a),r=p.highs.map(x=>x.price).filter(x=>x>price).sort((a,b)=>a-b),z=d.slice(-50),day=d.slice(-288),week=d.slice(-2016),month=d.slice(-8928);return{support:s[0]??Math.min(...z.map(x=>x.low)),resistance:r[0]??Math.max(...z.map(x=>x.high)),dailyHigh:Math.max(...day.map(x=>x.high)),dailyLow:Math.min(...day.map(x=>x.low)),weeklyHigh:Math.max(...week.map(x=>x.high)),weeklyLow:Math.min(...week.map(x=>x.low)),monthlyHigh:Math.max(...month.map(x=>x.high)),monthlyLow:Math.min(...month.map(x=>x.low))};}
function analyze(candles){const d=normalizeCandles(candles).slice(-300);if(d.length<40)return{ready:false,reason:"At least 40 candles are required.",candles:d.length};const c=d.map(x=>x.close),last=d.at(-1),s8=sma(c,8),s21=sma(c,21),s50=sma(c,50),st=structure(d),a=atr(d),lv=levels(d),mom=(s8>s21?1:s8<s21?-1:0)+(s21>s50?1:s21<s50?-1:0)+dir(last),ts=st.bias*2+(s8>s21?1:s8<s21?-1:0)+(s21>s50?1:s21<s50?-1:0),trend=ts>=2?"Bullish":ts<=-2?"Bearish":"Sideways",momentum=mom>=2?"Bullish":mom<=-2?"Bearish":"Neutral",pat=pattern(last),eng=engulf(d),insideBar=d.length>1&&last.high<=d.at(-2).high&&last.low>=d.at(-2).low,nearS=a>0&&last.close-lv.support<=a*.8,nearR=a>0&&lv.resistance-last.close<=a*.8,sweepLow=last.low<lv.support&&last.close>lv.support,sweepHigh=last.high>lv.resistance&&last.close<lv.resistance,quality=clamp(Math.round(50+ts*8+mom*6+(pat!=="None"||eng!=="None"?7:0)+(sweepLow||sweepHigh?7:0)),0,100);return{ready:true,price:last.close,trend,action:trend==="Bullish"?"BUY":trend==="Bearish"?"SELL":"WAIT",structure:st.label,structureBias:st.bias,momentum,momentumScore:mom,atr:a,setupQuality:quality,candle:{pattern:pat,engulfing:eng,insideBar,direction:dir(last),bodyRatio:range(last)?body(last)/range(last):0},liquidity:{sweepLow,sweepHigh},levels:lv,support:lv.support,resistance:lv.resistance,nearSupport:nearS,nearResistance:nearR,pivots:{highs:st.pivots.highs.slice(-8),lows:st.pivots.lows.slice(-8)},asOf:last.datetime};}
function buildSetup(m){
  const a=m?.analyses?.["5min"],d=m?.analyses?.["1day"],h=m?.analyses?.["4h"];
  if(!a?.ready)return{valid:false,reason:"M5 data is not ready.",checks:{m5Ready:false}};
  if(!d?.ready||!h?.ready)return{valid:false,reason:"H4 and D1 confirmation are required.",checks:{m5Ready:true,h4d1Ready:false}};
  const direction=m.direction;
  const bullish=direction==="Bullish",bearish=direction==="Bearish";
  const checks={
    m5Ready:true,
    h4d1Ready:true,
    timeframeConfluence:m.confluenceCount>=3,
    h4d1Aligned:m.h4d1Aligned,
    m5Aligned:(bullish&&a.trend==="Bullish")||(bearish&&a.trend==="Bearish"),
    structureAligned:(bullish&&a.structureBias>0)||(bearish&&a.structureBias<0),
    momentumConfirmed:(bullish&&a.momentumScore>=1)||(bearish&&a.momentumScore<=-1),
    qualityConfirmed:a.setupQuality>=65,
    candleConfirmed:(bullish&&a.candle.direction>0)||(bearish&&a.candle.direction<0)||a.candle.pattern!=="None"||a.candle.engulfing!=="None"||(bullish&&a.liquidity.sweepLow)||(bearish&&a.liquidity.sweepHigh),
    locationConfirmed:(bullish&&(a.nearSupport||a.liquidity.sweepLow))||(bearish&&(a.nearResistance||a.liquidity.sweepHigh))
  };
  const required=["timeframeConfluence","h4d1Aligned","m5Aligned","structureAligned","momentumConfirmed","qualityConfirmed","candleConfirmed","locationConfirmed"];
  if(!direction||direction==="Sideways")return{valid:false,reason:"No directional confluence.",checks};
  if(required.some(k=>!checks[k])){
    const labels={timeframeConfluence:"at least 3 aligned timeframes",h4d1Aligned:"H4 + D1 agreement",m5Aligned:"M5 alignment",structureAligned:"M5 structure alignment",momentumConfirmed:"momentum confirmation",qualityConfirmed:"65%+ setup quality",candleConfirmed:"candle confirmation",locationConfirmed:"entry location near a key level or liquidity sweep"};
    const missing=required.filter(k=>!checks[k]).map(k=>labels[k]);
    return{valid:false,reason:`Confirmation required: ${missing.join(", ")}.`,checks,missing};
  }
  const entry=a.price,atrValue=a.atr||Math.abs(a.levels.resistance-a.levels.support)||1,buffer=atrValue*.15;let stop,target,risk;
  if(bullish){stop=a.levels.support-buffer;risk=entry-stop;target=entry+risk*2;if(a.levels.resistance>entry&&a.levels.resistance<target)return{valid:false,reason:"Nearest resistance does not allow a clean 1:2 setup.",checks};}
  else{stop=a.levels.resistance+buffer;risk=stop-entry;target=entry-risk*2;if(a.levels.support<entry&&a.levels.support>target)return{valid:false,reason:"Nearest support does not allow a clean 1:2 setup.",checks};}
  if(risk<=0)return{valid:false,reason:"Invalid stop distance.",checks};
  return{valid:true,direction,entry,stop,target,riskDistance:risk,rewardDistance:Math.abs(target-entry),rr:2,confidence:m.confidence,checks,reason:"Setup passes the confluence, confirmation and minimum 1:2 risk/reward rules. Wait for candle-close confirmation before acting."};
}
function multiTimeframe(series){const analyses={};for(const tf of TIMEFRAMES)analyses[tf]=analyze(series[tf]||[]);const usable=TIMEFRAMES.filter(x=>analyses[x].ready),dirs=usable.map(x=>analyses[x].trend),bull=dirs.filter(x=>x==="Bullish").length,bear=dirs.filter(x=>x==="Bearish").length,h4=analyses["4h"],d1=analyses["1day"],aligned=!!h4?.ready&&!!d1?.ready&&h4.trend===d1.trend&&["Bullish","Bearish"].includes(h4.trend),count=Math.max(bull,bear),direction=bull>bear?"Bullish":bear>bull?"Bearish":"Sideways",base={analyses,direction,confluenceCount:count,h4d1Aligned:aligned,confidence:Math.round(count/5*100),action:"WAIT",reason:"Wait for aligned timeframes, setup quality and candle confirmation."};base.setup=buildSetup(base);if(base.setup.valid){base.action=direction==="Bullish"?"BUY":"SELL";base.reason=base.setup.reason;}else if(count>=3&&aligned){base.action=direction==="Bullish"?"BUY WATCH":"SELL WATCH";base.reason=base.setup.reason;}return base;}
function positionSize({balance,riskPercent=1,entry,stop,contractSize=100}){const riskAmount=balance*riskPercent/100,stopDistance=Math.abs(entry-stop);if(![balance,riskPercent,entry,stop,contractSize].every(finite)||balance<=0||riskPercent<=0||riskPercent>2||stopDistance<=0||contractSize<=0)return null;const lots=riskAmount/(stopDistance*contractSize);return{riskAmount,stopDistance,lots,units:lots*contractSize};}
module.exports={analyze,multiTimeframe,positionSize,normalizeCandles,TIMEFRAMES};
