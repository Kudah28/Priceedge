/* PriceEdge chart renderer compatibility shim.
   The professional renderer in pro-chart.js is now the single owner of
   candle rendering. Keeping this file as a no-op avoids competing canvas
   render loops, duplicate pointer handlers and mobile repaint glitches.
*/
(function(){
  'use strict';
  window.__priceEdgeChartV3Disabled = true;
})();
