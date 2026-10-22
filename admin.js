let token='';
const $=s=>document.querySelector(s);
async function req(url,options={}){options.headers={...(options.headers||{}),...(token?{'x-admin-token':token}:{})};const r=await fetch(url,options);const d=await r.json().catch(()=>({error:'Unexpected response'}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
function msg(el,text,error=false){el.textContent=text;el.style.color=error?'#b42318':'var(--blue)'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('#login-button').addEventListener('click',async()=>{
 try{const d=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#admin-password').value})});token=d.token;$('#login-panel').hidden=true;$('#entries-panel').hidden=false;await loadEntries();}
 catch(e){msg($('#login-message'),e.message,true)}
});
async function loadEntries(){
 msg($('#entries-message'),'Loading entries…');
 try{
  const d=await req('/api/admin/entries');
  $('#entries-message').textContent=`${d.entries.length} registered participant(s). Score each submission from 0–25 in every category.`;
  $('#entries-list').innerHTML=d.entries.map((p,i)=>{
   const s=p.submission;
   if(!s)return `<article class="entry-card"><h3>${i+1}. ${esc(p.creativeName)}</h3><p style="font-size:12px;color:var(--muted)">No submission received.</p></article>`;
   return `<article class="entry-card"><h3>${i+1}. ${esc(p.creativeName)}</h3><p style="font-size:11px;color:var(--muted)">Submitted: ${esc(new Date(s.submitted_at).toLocaleString())}</p>${s.imageUrl?`<a href="${esc(s.imageUrl)}" target="_blank" rel="noopener"><img src="${esc(s.imageUrl)}" alt="Design submitted by ${esc(p.creativeName)}"></a>`:'<p>Image link unavailable; refresh entries.</p>'}<form class="score-form" data-id="${esc(s.id)}"><div class="score-grid">${[['concept','Design concept',s.concept_score],['typography','Typography',s.typography_score],['colour','Colour',s.colour_score],['layout','Layout & composition',s.layout_score]].map(([key,label,val])=>`<div><label>${label} / 25</label><input type="number" name="${key}" min="0" max="25" step="1" required value="${val??''}" placeholder="0–25"></div>`).join('')}</div><p><b>Saved total: ${s.total_score==null?'Not scored':s.total_score+'/100'}</b></p><button class="button primary" type="submit">Save scores</button><span class="admin-message score-message"></span></form></article>`;
  }).join('');
  document.querySelectorAll('.score-form').forEach(form=>form.addEventListener('submit',async e=>{
   e.preventDefault();const f=e.currentTarget;const b=f.querySelector('button');b.disabled=true;
   try{const data=Object.fromEntries(new FormData(f));const out=await req('/api/admin/score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({submissionId:f.dataset.id,concept:data.concept,typography:data.typography,colour:data.colour,layout:data.layout})});f.querySelector('.score-message').textContent=`Saved: ${out.total}/100`;f.querySelector('p').innerHTML=`<b>Saved total: ${out.total}/100</b>`;}
   catch(err){f.querySelector('.score-message').textContent=err.message;}
   finally{b.disabled=false;}
  }));
 }catch(e){msg($('#entries-message'),e.message,true)}
}
$('#refresh-button').addEventListener('click',loadEntries);
async function publish(value){try{const d=await req('/api/admin/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:value})});msg($('#publish-message'),d.message)}catch(e){msg($('#publish-message'),e.message,true)}}
$('#publish-button').addEventListener('click',()=>publish(true));
$('#hide-button').addEventListener('click',()=>publish(false));