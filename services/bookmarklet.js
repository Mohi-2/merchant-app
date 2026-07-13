'use strict';

// Client-side capture script (runs on alibaba.com). Extracts RAW strings only;
// all numeric parsing happens server-side (helpers/parse.js). Must stay fully
// self-contained: page CSP can block external scripts, not inline javascript: URIs.
//
// Selectors calibrated against live alibaba.com search markup (2026-07): each
// result card's real title is an `a.product-title` anchor — the generic first
// `/product-detail/` link on a card is the "Find Similar" button, so we key off
// product-title anchors and only fall back to the generic scan if none exist.
function buildCaptureScript(baseUrl, token) {
  return `(function(){
var BASE=${JSON.stringify(baseUrl)},TOKEN=${JSON.stringify(token)};
function txt(el){return el&&el.textContent?el.textContent.trim():''}
// Captures ¥/￥/$/€ (optionally "US$") single value or range. Currency symbol is
// preserved in the raw string; the server only treats ¥/￥ as CNY.
function priceIn(s){var m=s.match(/(?:US\\s*)?[\\u00A5\\uFFE5$\\u20AC]\\s*[\\d.,]+(?:\\s*[-\\u2013\\u2014~]\\s*(?:US\\s*)?[\\u00A5\\uFFE5$\\u20AC]?\\s*[\\d.,]+)?/);return m?m[0]:''}
// Climb from the anchor's PARENT (not the anchor — a.product-title's own class
// contains "product") to the real card wrapper (e.g. .traffic-card-gallery),
// which holds the price/image/MOQ/seller. Fall back to a text-length climb.
function cardOf(a){var c=(a.parentElement||a).closest('[class*="card"],[class*="gallery"],[class*="organic"]');if(!c){c=a.parentElement;var up=0;while(c&&txt(c).length<120&&up<5){c=c.parentElement;up++}}return c}
// MOQ unit is matched as lowercase only ([a-z]*) so it stops before an adjacent
// seller name (capitalised, no separating whitespace in the DOM text).
function fromCard(card,href,title){if(!card||!title)return null;var img=card.querySelector('img');var mm=txt(card).match(/(?:Min\\.?\\s*[Oo]rder|MOQ)[:\\s]*[\\d.,]+\\s*[a-z]*/);var sel=card.querySelector('a[href*="company"],a[href*="minisite"],a[href*="/supplier"],[class*="supplier"],[class*="company-name"]');return {url:href,title:title.slice(0,300),image_url:img?(img.src||img.getAttribute('data-src')||''):'',price_raw:priceIn(txt(card)),moq:mm?mm[0].trim():'',seller_name:txt(sel)}}
function toast(msg,ok){var d=document.createElement('div');d.textContent=msg;d.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;padding:12px 18px;border-radius:10px;font:600 14px/1.4 sans-serif;direction:rtl;color:#fff;background:'+(ok?'#16a34a':'#ef4444')+';box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(d);setTimeout(function(){d.remove()},5000)}
var isProduct=location.pathname.indexOf('/product-detail/')>-1;
var items=[];
if(isProduct){
  var h1=document.querySelector('h1');
  var pr='';var pel=document.querySelector('[class*="price"]');if(pel)pr=priceIn(txt(pel));
  if(!pr)pr=priceIn(txt(document.body).slice(0,8000));
  var mel=document.querySelector('[class*="moq"],[class*="min-order"],[class*="minOrder"]');
  var sel=document.querySelector('a[href*="company"],a[href*="minisite"]');
  var img=document.querySelector('[class*="main"] img,[class*="gallery"] img,img');
  items.push({url:location.href,title:txt(h1)||document.title,image_url:img?(img.src||''):'',price_raw:pr,moq:txt(mel),seller_name:txt(sel)});
}else{
  var seen={};
  var titleAs=document.querySelectorAll('a.product-title,a[class*="product-title"]');
  if(titleAs.length){
    for(var i=0;i<titleAs.length;i++){
      var a=titleAs[i];var href=(a.href||'').split('?')[0].split('#')[0];
      if(!href||href.indexOf('/product-detail/')<0||seen[href])continue;seen[href]=1;
      var it=fromCard(cardOf(a),href,(a.getAttribute('title')||txt(a)).trim());
      if(it&&it.title)items.push(it);
    }
  }else{
    var links=document.querySelectorAll('a[href*="/product-detail/"]');
    for(var j=0;j<links.length;j++){
      var a2=links[j];var href2=(a2.href||'').split('?')[0].split('#')[0];
      if(!href2||seen[href2])continue;
      var card2=cardOf(a2);if(!card2)continue;
      var tel=card2.querySelector('a[class*="product-title"],h2,[class*="title"]');
      var title2=((tel&&(tel.getAttribute('title')||txt(tel)))||a2.getAttribute('title')||txt(a2)).trim();
      if(!title2||/find similar/i.test(title2))continue;
      seen[href2]=1;
      var it2=fromCard(card2,href2,title2);
      if(it2&&it2.title)items.push(it2);
    }
  }
}
if(!items.length){toast('\\u0645\\u062d\\u0635\\u0648\\u0644\\u06cc \\u062f\\u0631 \\u0627\\u06cc\\u0646 \\u0635\\u0641\\u062d\\u0647 \\u067e\\u06cc\\u062f\\u0627 \\u0646\\u0634\\u062f',false);return}
fetch(BASE+'/api/crawl/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,page_type:isProduct?'PRODUCT':'SEARCH',items:items})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})})
.then(function(d){toast(d.total+' \\u0645\\u062d\\u0635\\u0648\\u0644 \\u0630\\u062e\\u06cc\\u0631\\u0647 \\u0634\\u062f ('+d.created+' \\u062c\\u062f\\u06cc\\u062f)',true)})
.catch(function(e){toast('\\u062e\\u0637\\u0627: '+e.message,false)});
})();`;
}

function buildBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(buildCaptureScript(baseUrl, token));
}

// Runs on a competitor's PUBLIC digikala product page. Extracts raw strings only;
// server parses the Toman price and extracts the dkp id from the URL.
function buildDigikalaCompetitorScript(baseUrl, token) {
  return `(function(){
var BASE=${JSON.stringify(baseUrl)},TOKEN=${JSON.stringify(token)};
function txt(el){return el&&el.textContent?el.textContent.trim():''}
function toast(msg,ok){var d=document.createElement('div');d.textContent=msg;d.style.cssText='position:fixed;top:16px;left:16px;z-index:2147483647;padding:12px 18px;border-radius:10px;font:600 14px/1.4 sans-serif;direction:rtl;color:#fff;background:'+(ok?'#16a34a':'#ef4444')+';box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(d);setTimeout(function(){d.remove()},5000)}
var h1=document.querySelector('h1');
var pel=document.querySelector('[data-testid*="price"],[class*="price"]');
var sel=document.querySelector('[data-testid*="seller"],a[href*="/seller/"],[class*="seller"]');
var item={url:location.href,title:txt(h1)||document.title,price_raw:txt(pel),seller_name:txt(sel)};
if(!item.title){toast('\\u0639\\u0646\\u0648\\u0627\\u0646 \\u0645\\u062d\\u0635\\u0648\\u0644 \\u067e\\u06cc\\u062f\\u0627 \\u0646\\u0634\\u062f',false);return}
fetch(BASE+'/api/digikala/competitor/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,item:item})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})})
.then(function(d){toast(d.created?'\\u0631\\u0642\\u06cc\\u0628 \\u062c\\u062f\\u06cc\\u062f \\u062b\\u0628\\u062a \\u0634\\u062f':'\\u0642\\u06cc\\u0645\\u062a \\u0628\\u0631\\u0648\\u0632 \\u0634\\u062f',true)})
.catch(function(e){toast('\\u062e\\u0637\\u0627: '+e.message,false)});
})();`;
}

// Runs on the seller panel product-list page. Reads every row on the current page.
// SELECTORS ARE BEST-GUESS — calibrate against the live seller.digikala.com panel.
function buildDigikalaOwnScript(baseUrl, token) {
  return `(function(){
var BASE=${JSON.stringify(baseUrl)},TOKEN=${JSON.stringify(token)};
function txt(el){return el&&el.textContent?el.textContent.trim():''}
function toast(msg,ok){var d=document.createElement('div');d.textContent=msg;d.style.cssText='position:fixed;top:16px;left:16px;z-index:2147483647;padding:12px 18px;border-radius:10px;font:600 14px/1.4 sans-serif;direction:rtl;color:#fff;background:'+(ok?'#16a34a':'#ef4444')+';box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(d);setTimeout(function(){d.remove()},5000)}
var items=[];
var rows=document.querySelectorAll('tbody tr,[class*="product-row"],[data-testid*="product-row"]');
for(var i=0;i<rows.length;i++){
  var row=rows[i];
  var link=row.querySelector('a[href*="dkp-"]');
  var dkp='';if(link){var m=(link.getAttribute('href')||'').match(/dkp-(\\d+)/);if(m)dkp=m[1]}
  if(!dkp)continue;
  var titleEl=row.querySelector('[class*="title"],a[href*="dkp-"]');
  var priceEl=row.querySelector('[class*="price"],[data-testid*="price"]');
  var stockEl=row.querySelector('[class*="stock"],[data-testid*="stock"]');
  var salesEl=row.querySelector('[class*="sales"],[data-testid*="sales"]');
  items.push({digikala_id:dkp,title:txt(titleEl),price_raw:txt(priceEl),stock:txt(stockEl),sales_count:txt(salesEl)});
}
if(!items.length){toast('\\u0645\\u062d\\u0635\\u0648\\u0644\\u06cc \\u062f\\u0631 \\u0627\\u06cc\\u0646 \\u0635\\u0641\\u062d\\u0647 \\u067e\\u06cc\\u062f\\u0627 \\u0646\\u0634\\u062f',false);return}
fetch(BASE+'/api/digikala/own/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,items:items})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})})
.then(function(d){toast(d.total+' \\u0645\\u062d\\u0635\\u0648\\u0644 \\u062b\\u0628\\u062a \\u0634\\u062f ('+d.created+' \\u062c\\u062f\\u06cc\\u062f)',true)})
.catch(function(e){toast('\\u062e\\u0637\\u0627: '+e.message,false)});
})();`;
}

function buildDigikalaCompetitorBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(buildDigikalaCompetitorScript(baseUrl, token));
}
function buildDigikalaOwnBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(buildDigikalaOwnScript(baseUrl, token));
}

module.exports = { buildBookmarklet, buildCaptureScript, buildDigikalaCompetitorBookmarklet, buildDigikalaOwnBookmarklet };
