const fs=require("fs");
const path=require("path");
const WebSocket=require("ws");
const express=require("express");
const originalExpress=express;
const {getMarket,snapshot,API_KEY,SYMBOLS,ALLOWED}=require("./market-data");
const {analyze}=require("./analysis-engine");
const API_WS_KEY=API_KEY;
const SYMBOL_LIST=SYMBOLS.join(",");
const UPSTREAM=API_WS_KEY?`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(API_WS_KEY)}`:"";
let upstream=null,reconnectTimer=null,heartbeatTimer=null,browserWss=null,attached=false,patched=false;
const latestBySymbol=new Map();
function broadcast(x){if(!browserWss)return;const m=JSON.stringify(x);for(const c of browserWss.clients)if(c.readyState===WebSocket.OPEN){try{c.send(m)}catch(_){}}}
function reconnect(){if(reconnectTimer||!API_WS_KEY)return;reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect()},3000)}
function heartbeat(){clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(upstream?.readyState===WebSocket.OPEN){try{upstream.send(JSON.stringify({action:"heartbeat"}))}catch(_){}}},10000)}
function parse(raw){let d;try{d=JSON.parse(raw)}catch(_){return null}if(d.event==="price"){const price=Number(d.price);if(!Number.isFinite(price)||price<=0)return null;const ts=Number(d.timestamp);return{type:"tick",symbol:d.symbol||"XAU/USD",price,time:Number.isFinite(ts)?ts*1000:Date.now(),receivedAt:Date.now()}}if(d.event==="subscribe-status"){const status=String(d.status||"").toLowerCase();const symbols=d.params?.symbols||d.symbols||"";return{type:"subscription",status,message:d.message||`${status||"subscription"} ${symbols}`.trim()}}if(d.status==="error"||d.event==="error"||d.code>=400)return{type:"status",status:"error",message:d.message||"Twelve Data WebSocket error"};return null}
function connect(){if(!API_WS_KEY){broadcast({type:"status",status:"disabled",message:"Twelve Data WebSocket API key is not configured."});return}if(upstream&&(upstream.readyState===WebSocket.OPEN||upstream.readyState===WebSocket.CONNECTING))return;try{upstream=new WebSocket(UPSTREAM);upstream.on("open",()=>{heartbeat();upstream.send(JSON.stringify({action:"subscribe",params:{symbols:SYMBOL_LIST}}));broadcast({type:"status",status:"connecting",message:"Subscribing to live prices…"})});upstream.on("message",raw=>{const d=parse(raw.toString());if(!d)return;if(d.type==="tick"){latestBySymbol.set(d.symbol,d);broadcast(d)}else if(d.type==="subscription"){const ok=d.status.includes("success")||d.status.includes("ok")||d.status.includes("partial");broadcast({type:"status",status:ok?"connected":"error",message:d.message||"Subscription status received"})}else broadcast(d)});upstream.on("error",e=>broadcast({type:"status",status:"error",message:`Live tick stream error: ${e.message||"connection error"}`}));upstream.on("close",()=>{clearInterval(heartbeatTimer);heartbeatTimer=null;upstream=null;broadcast({type:"status",status:"reconnecting",message:"LIVE TICK STREAM RECONNECTING"});reconnect()})}catch(e){upstream=null;broadcast({type:"status",status:"error",message:e.message||"Unable to start live tick stream"});reconnect()}}
async function marketMiddleware(req,res,next){
  if(req.path==="/api/market-status")return res.json({configured:Boolean(API_KEY),websocketConfigured:Boolean(API_WS_KEY),websocketConnected:upstream?.readyState===WebSocket.OPEN,cache:snapshot(),serverTime:new Date().toISOString()});
  if(req.path==="/api/candles"){
    const symbol=String(req.query.symbol||"XAU/USD"),interval=String(req.query.interval||"5min"),size=Math.min(Number(req.query.size)||300,500);
    if(!SYMBOLS.includes(symbol)||!ALLOWED.includes(interval))return res.status(400).json({error:"Unsupported symbol or timeframe."});
    try{const d=await getMarket(symbol,interval,size);return res.json({status:"ok",values:d.values,source:d.source,cached:d.cached,updatedAt:new Date(d.fetchedAt).toISOString(),marketQuality:d.quality});}
    catch(e){return res.status(503).json({error:e.message,retryable:true,marketQuality:{status:"unavailable"}})}
  }
  if(req.path==="/api/analysis"){
    const symbol=String(req.query.symbol||"XAU/USD");
    if(!SYMBOLS.includes(symbol))return res.status(400).json({error:"Unsupported symbol."});
    try{
      const [m5,d1]=await Promise.all([getMarket(symbol,"5min",300),getMarket(symbol,"1day",100)]);
      const a=analyze(m5.values),daily=analyze(d1.values);
      const marketQuality={m5:m5.quality,d1:d1.quality,overall:m5.quality.status==="fresh"&&d1.quality.status==="fresh"?"fresh":"stale"};
      if(marketQuality.overall!=="fresh")return res.status(503).json({symbol,m5:a,d1:daily,marketQuality,error:"Market data is stale. PriceEdge will not treat stale data as actionable."});
      return res.json({symbol,m5:a,d1:daily,marketQuality,disclaimer:"Educational and analytical information only. Not financial advice."});
    }catch(e){return res.status(503).json({error:e.message,retryable:true})}
  }
  next();
}
function polishMiddleware(req,res,next){
  if(req.method!=="GET"||(req.path!=="/"&&req.path!=="/index.html"))return next();
  const file=path.join(__dirname,"public","index.html");
  fs.readFile(file,"utf8",(err,html)=>{
    if(err)return next();
    const tag='<script src="/product-polish.js" defer></script>';
    res.type("html").send(html.includes("/product-polish.js")?html:html.includes("</body>")?html.replace("</body>",`${tag}</body>`):html+tag);
  });
}
function attach(server){if(attached)return;attached=true;browserWss=new WebSocket.Server({server,path:"/ws/live"});browserWss.on("connection",client=>{client.send(JSON.stringify({type:"status",status:upstream?.readyState===WebSocket.OPEN?"connected":"reconnecting",message:upstream?.readyState===WebSocket.OPEN?"LIVE TICK STREAM":"WAITING FOR LIVE TICK STREAM"}));for(const t of latestBySymbol.values())client.send(JSON.stringify(t))});connect()}
function patch(){if(patched)return;patched=true;function patchedExpress(...args){const app=originalExpress(...args);const use=app.use.bind(app),listen=app.listen.bind(app);let injected=false;app.use=function(...args){if(!injected){injected=true;use(marketMiddleware);use(polishMiddleware)}return use(...args)};app.listen=function(...a){const server=listen(...a);attach(server);return server};return app}Object.assign(patchedExpress,originalExpress);patchedExpress.static=originalExpress.static;const p=require.resolve("express");if(require.cache[p])require.cache[p].exports=patchedExpress}
patch();
