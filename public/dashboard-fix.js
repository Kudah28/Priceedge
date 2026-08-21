/* PriceEdge dashboard stability layer. */
(() => {
  'use strict';
  const signal=document.getElementById('signal');
  if(signal) signal.style.minHeight='56px';
  if(!document.querySelector('script[data-priceedge-notifications]')){
    const s=document.createElement('script');
    s.src='/notifications.js';
    s.defer=true;
    s.dataset.priceedgeNotifications='1';
    document.head.appendChild(s);
  }
})();
