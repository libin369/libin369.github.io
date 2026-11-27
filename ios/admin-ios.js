'use strict';
(()=>{
const el=id=>document.getElementById(id), dialog=el('adminDialog');
let token='', pending=null, sha='', baseline=null, locked=false;
const owner=location.hostname.endsWith('.github.io')?location.hostname.split('.')[0]:'', repo=location.pathname.split('/').filter(Boolean)[0]||'';
const endpoint=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/prices.json`;
const msg=s=>el('adminMessage').textContent=s;
const text=v=>v==null?'':String(v).trim();
function convert(mapping,rows,baseline,mode="merge"){
const norm=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
if(!rows.length)throw Error('Empty worksheet.');const headers=rows[0].map(norm), col=(...names)=>headers.findIndex(h=>names.includes(h));
const c={code:col('ITEMCODE','ITEMNO'),barcode:col('BARCODE'),name:col('DESCRIPTION','DESCRIPITON'),brand:col('BRAND'),was:col('WASPRICE','WAS','SYSRSP'),now:col('NOWPRICE','NOW','ROUND')};
if(['code','was','now'].some(k=>c[k]<0))throw Error('Required headers: ItemCode, WAS Price, NOW Price. Barcode, Description and Brand optional.');
const products=new Map(),aliases=new Map(),old=new Map(baseline.products.map(p=>[p.code.toUpperCase(),p])), invalid=[];
for(const [i,r] of rows.slice(1).entries()){
 if(!r.some(v=>text(v)))continue;
 const k=text(r[c.code]).toUpperCase(),b=text(r[c.barcode]),name=text(r[c.name])||old.get(k)?.name||k;
 const price=v=>{if(!text(v))return null;return typeof v==='number'?v:Number(text(v));};
 const was=price(r[c.was]),now=price(r[c.now]);
 if(!k||[was,now].some(v=>v!==null&&(!Number.isFinite(v)||v<0))){invalid.push(`${i+2} (${k||'missing item code'}: invalid item code or price)`);continue;}
 if(!aliases.has(k))aliases.set(k,new Set([...(Object.hasOwn(mapping,k)?mapping[k]:[]),...(old.get(k)?.barcodes||[])]));if(b)aliases.get(k).add(b);
 if(!products.has(k)||(now??-1)>(products.get(k).now??-1))products.set(k,{code:k,name,brand:text(r[c.brand])||old.get(k)?.brand||'',was,now});
}
if(invalid.length)throw Error('Invalid rows: '+invalid.slice(0,30).join(', ')+'. Nothing published.');if(!products.size)throw Error('No products found.');
const uploaded=[...products.values()].map(p=>({...p,barcodes:[...aliases.get(p.code)].sort()}));
if(mode==='merge'){const missing=uploaded.filter(p=>!old.has(p.code)&&(!p.barcodes.length||p.name===p.code));if(missing.length)throw Error('New items need a description and barcode (uploaded or saved): '+missing.map(p=>p.code).slice(0,20).join(', '));}
const final=new Map(mode==='merge'?old:[]);for(const p of uploaded)final.set(p.code,p);
return {updated:new Date().toISOString(),products:[...final.values()]};}
async function api(method='GET',body){const r=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(`GitHub request failed (${r.status}). Check token, repository permissions and branch.`);return r.json();}
// Local convenience lock only. GitHub remains the publishing authority.
const vaultKey='essenzi-admin-v18:'+owner+'/'+repo;
const bytes64=b=>btoa(String.fromCharCode(...b));
const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const validToken=t=>/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(t);
const saved=()=>localStorage.getItem(vaultKey);
async function derive(pin,salt){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function storeToken(pin,t){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await derive(pin,salt);const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(t));localStorage.setItem(vaultKey,JSON.stringify({salt:bytes64(salt),iv:bytes64(iv),data:bytes64(new Uint8Array(ciphertext))}));}
async function loadToken(pin){const v=JSON.parse(saved());const key=await derive(pin,from64(v.salt));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(v.iv)},key,from64(v.data)));}
function loginState(){const has=!!saved();el('tokenSetup').hidden=has;el('forgetDevice').hidden=!has;el('pinHelp').textContent=has?'Enter your four-digit administrator PIN.':'Set up this device once using your admin PIN and GitHub token.';el('adminPin').value='';el('adminToken').value='';}
el('forgetDevice').onclick=()=>{if(!locked&&confirm('Remove the saved GitHub token from this device?')){localStorage.removeItem(vaultKey);reset();}};
function reset(){token='';pending=null;sha='';baseline=null;loginState();el('updateMode').value='merge';el('excelFile').value='';el('uploadPanel').hidden=true;el('loginPanel').hidden=false;el('preview').hidden=true;el('publish').disabled=true;msg('');}
function readExcel(buffer){return new Promise((resolve,reject)=>{const worker=new Worker('excel-worker.js');const timer=setTimeout(()=>{worker.terminate();reject(Error('Excel reader timed out. Check internet.'));},45000);const finish=()=>{clearTimeout(timer);worker.terminate();};worker.onmessage=e=>{finish();e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=()=>{finish();reject(Error('Excel reader failed. Check internet.'));};worker.postMessage(buffer,[buffer]);});}
el('adminOpen').onclick=()=>{reset();dialog.showModal();};el('adminClose').onclick=()=>{if(!locked)dialog.close();};dialog.addEventListener('cancel',e=>{if(locked)e.preventDefault();});dialog.addEventListener('close',reset);
async function run(button,fn){if(locked)return;locked=true;button.disabled=true;el('adminClose').disabled=true;el('excelFile').disabled=true;el('updateMode').disabled=true;try{await fn();}catch(e){msg(e.message);}finally{locked=false;button.disabled=false;el('adminClose').disabled=false;el('excelFile').disabled=false;el('updateMode').disabled=false;if(button===el('publish'))button.disabled=!pending;}}
el('unlock').disabled=false;
el('unlock').onclick=()=>run(el('unlock'),async()=>{if(!owner||!repo)throw Error('Open the deployed GitHub Pages project URL first.');if(!crypto.subtle)throw Error('Secure HTTPS is required.');const pin=el('adminPin').value;el('adminPin').value='';if(pin!=='9369')throw Error('Incorrect administrator PIN.');const first=!saved();try{token=first?el('adminToken').value.trim():await loadToken(pin);el('adminToken').value='';if(!validToken(token))throw Error('Enter a valid GitHub access token.');const a=await api();sha=a.sha;baseline=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(a.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));if(first)await storeToken(pin,token);}catch(e){token='';el('adminToken').value='';throw Error(e.message+' If the saved token is expired or invalid, reset this device and enter a new token.');}el('loginPanel').hidden=true;el('uploadPanel').hidden=false;msg('Admin unlocked. GitHub verifies write permission when publishing.');});
el('updateMode').onchange=el('excelFile').onchange=()=>{pending=null;el('publish').disabled=true;el('preview').hidden=true;};
el('validate').onclick=()=>run(el('validate'),async()=>{pending=null;el('publish').disabled=true;el('preview').hidden=true;const f=el('excelFile').files[0];if(!f||!f.name.toLowerCase().endsWith('.xlsx'))throw Error('Select an .xlsx workbook.');const parsed=await readExcel(await f.arrayBuffer());const mappingResponse=await fetch('../barcode_mapping.json',{cache:'no-store'});if(!mappingResponse.ok)throw Error('Saved barcode mapping unavailable.');const mapping=await mappingResponse.json();pending=convert(mapping,parsed.rows,baseline,el('updateMode').value);const old=new Map(baseline.products.map(p=>[p.code,p]));const now=new Map(pending.products.map(p=>[p.code,p]));const changed=pending.products.filter(p=>old.has(p.code)&&(old.get(p.code).now!==p.now||old.get(p.code).was!==p.was));const added=pending.products.filter(p=>!old.has(p.code)).length,removed=baseline.products.filter(p=>!now.has(p.code)).length;el('preview').textContent=`Mode: ${el('updateMode').value==='merge'?'Update / add items':'Full replacement'}\nProducts: ${now.size}\nNew: ${added} · Removed: ${removed}\nPrice changes: ${changed.length}\nMissing/zero WAS: ${pending.products.filter(p=>!p.was).length}\nMissing NOW: ${pending.products.filter(p=>p.now===null).length}\n`+changed.slice(0,12).map(p=>`${p.code}: ${old.get(p.code).now} → ${p.now}`).join('\n');el('preview').hidden=false;el('publish').disabled=false;msg('Validated. Review changes before publishing.');});
el('publish').onclick=()=>run(el('publish'),async()=>{if(!pending)return;if(!confirm(el('updateMode').value==='merge'?'Publish updated prices? Unlisted items will be retained. Total products: '+pending.products.length:'Replace the entire live price list with '+pending.products.length+' products? Unlisted items will be removed.'))return;const current=await api();if(current.sha!==sha){pending=null;throw Error('Live prices changed. Close, unlock and validate again.');}pending.updated=new Date().toISOString();const bytes=new TextEncoder().encode(JSON.stringify(pending));let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await api('PUT',{message:'Update exhibition prices',content:btoa(binary),sha});pending=null;token='';el('uploadPanel').hidden=true;el('loginPanel').hidden=false;loginState();msg('Published to GitHub. Wait for Pages deployment, then use Sync prices. Administrator locked.');});
})();
