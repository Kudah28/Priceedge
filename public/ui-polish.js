/* PriceEdge UI polish
   Intentionally kept passive. The core dashboard owns layout and live updates.
   Do not mutate dashboard cards on an interval: repeated DOM changes cause
   visible repaint/reflow on mobile and can make the decision section flicker.
*/
(() => {
  'use strict';
  // Core styles live in index.html. No recurring DOM mutations here.
})();
