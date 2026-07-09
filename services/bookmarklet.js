'use strict';

// Client-side capture script (runs on alibaba.com). Extracts RAW strings only;
// all numeric parsing happens server-side (helpers/parse.js). Must stay fully
// self-contained: page CSP can block external scripts, not inline javascript: URIs.
function buildCaptureScript(baseUrl, token) {
  return `(function(){
var BASE=${JSON.stringify(baseUrl)},TOKEN=${JSON.stringify(token)};
function txt(el){return el&&el.textContent?el.textContent.trim():''}
function priceIn(s){var m=s.match(/[\\u00A5\\uFFE5]\\s*[\\d.,]+(?:\\s*[-\\u2013\\u2014~]\\s*[\\u00A5\\uFFE5]?\\s*[\\d.,]+)?/);return m?m[0]:''}
function toast(msg,ok){var d=document.createElement('div');d.textContent=msg;d.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;padding:12px 18px;border-radius:10px;font:600 14px/1.4 sans-serif;direction:rtl;color:#fff;background:'+(ok?'#16a34a':'#ef4444')+';box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(d);setTimeout(function(){d.remove()},5000)}
var isProduct=location.pathname.indexOf('/product-detail/')>-1;
var items=[];
if(isProduct){
  var h1=document.querySelector('h1');
  var pr='';var pel=document.querySelector('[class*="price"]');if(pel)pr=priceIn(txt(pel));
  if(!pr)pr=priceIn(txt(document.body).slice(0,8000));
  var mel=document.querySelector('[class*="moq"],[class*="min-order"],[class*="minOrder"]');
  var sel=document.querySelector('a[href*="company_profile"]');
  var img=document.querySelector('[class*="main"] img,[class*="gallery"] img,img');
  items.push({url:location.href,title:txt(h1)||document.title,image_url:img?(img.src||''):'',price_raw:pr,moq:txt(mel),seller_name:txt(sel)});
}else{
  var seen={};
  var links=document.querySelectorAll('a[href*="/product-detail/"]');
  for(var i=0;i<links.length;i++){
    var a=links[i];var href=(a.href||'').split('?')[0].split('#')[0];
    if(!href||seen[href])continue;
    var card=a.closest('[class*="card"],[class*="item"],[class*="gallery"],[class*="product"]')||a.parentElement;
    var up=0;while(card&&card.textContent.trim().length<40&&up<3){card=card.parentElement;up++}
    if(!card)continue;
    var title=a.getAttribute('title')||'';
    if(!title){var ai=card.querySelector('img[alt]');if(ai&&ai.alt)title=ai.alt}
    if(!title)title=txt(a);
    var pr2=priceIn(txt(card));
    if(!title||!pr2)continue;
    seen[href]=1;
    var img2=card.querySelector('img');
    var mm=txt(card).match(/(?:Min\\.?\\s*order|MOQ)[:\\s]*[\\d.,]+\\s*\\w*/i);
    var sel2=card.querySelector('a[href*="company_profile"]');
    items.push({url:href,title:title.slice(0,300),image_url:img2?(img2.src||img2.getAttribute('data-src')||''):'',price_raw:pr2,moq:mm?mm[0]:'',seller_name:txt(sel2)});
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

module.exports = { buildBookmarklet, buildCaptureScript };
