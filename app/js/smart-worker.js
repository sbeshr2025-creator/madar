/* مدار v4 — عامل خلفي لحساب الاختبار التاريخي دون تجميد الواجهة */
importScripts('smart-engine.js?v=4');
self.onmessage=e=>{try{const {data,settings,opts}=e.data;self.postMessage(self.SmartEngine.backtestMany(data,settings,opts))}catch(err){self.postMessage({error:String(err&&err.message||err)})}};
