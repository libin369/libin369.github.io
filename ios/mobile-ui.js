(()=>{
const by=id=>document.getElementById(id);
by('navScan').addEventListener('click',()=>{by('query').value='';by('results').replaceChildren();window.scrollTo(0,0);by('scan').click();});
by('adminOpen').addEventListener('click',()=>{if(!by('camera').hidden||by('scan').disabled)by('stop').click();});
// Feedback only when a successful camera scan closes the camera and changes the query.
// Format status without modifying the existing synchronization logic.
const statusEl=by('status');
function formatStatus(){const text=statusEl.textContent;const m=text.match(/^(.*?) · (\d+) items · Published (.*)$/);if(m){statusEl.textContent=`${m[1]}\nAvailable products: ${Number(m[2]).toLocaleString()}\nLast published: ${m[3]}`;}}
new MutationObserver(formatStatus).observe(statusEl,{childList:true,characterData:true,subtree:true});formatStatus();
let scanning=false,previous='';
new MutationObserver(()=>{if(!by('camera').hidden){scanning=true;previous=by('query').value;}else if(scanning){scanning=false;if(by('query').value&&by('query').value!==previous){try{navigator.vibrate?.(80);}catch(e){}try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){const a=new AC();const o=a.createOscillator(),g=a.createGain();o.frequency.value=850;g.gain.value=.035;o.connect(g);g.connect(a.destination);a.resume().then(()=>{o.start();o.stop(a.currentTime+.09);o.onended=()=>a.close();}).catch(()=>a.close());}}catch(e){}}}}).observe(by('camera'),{attributes:true,attributeFilter:['hidden']});
})();