/* PriceEdge dashboard stability layer.
   The main dashboard owns the decision UI. This module deliberately avoids
   rebuilding cards, changing layout, or polling the DOM because those
   mutations were causing the lower dashboard to visibly flicker.
*/
(() => {
  'use strict';

  // Keep the page stable. Core market/decision values are rendered by the
  // main dashboard script and live-ticks.js. No recurring DOM mutation.
  const signal = document.getElementById('signal');
  if (signal) signal.style.minHeight = '56px';
})();
