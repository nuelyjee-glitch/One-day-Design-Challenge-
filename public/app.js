const $ = (s) => document.querySelector(s);
async function request(url, options={}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(()=>({error:'Unexpected server response.'}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function message(el, text, error=false){ el.textContent=text; el.classList.toggle('error',error); }
async function loadStatus(){
  try{
    const s=await request('/api/status');
    $('#capacity-label').textContent=`${s.registered} / ${s.maxParticipants}`;
    $('#capacity-bar').style.width=`${Math.min(100,s.registered/s.maxParticipants*100)}%`;
    $('#capacity-note').textContent=s.registrationOpen?'Registration is open until all 15 places are filled.':'Registration is full. No more places are available.';
    $('#register-button').disabled=!s.registrationOpen;
    if(!s.registrationOpen) $('#register-button').textContent='Registration full';
    const pill=$('#brief-pill'); pill.textContent=s.message;
    if(s.phase==='before_brief'){ $('#brief-title').textContent='Your brief will appear here'; }
    else {
      try { const b=await request('/api/brief'); $('#brief-title').textContent=b.title; $('#brief-text').textContent=b.brief; }
      catch(e){ $('#brief-text').textContent=e.message; }
    }
  }catch(e){ $('#capacity-label').textContent='Unavailable'; $('#capacity-note').textContent=e.message; message($('#register-message'),'Website setup is not complete yet. Please try again later.',true); }
}
$('#register-form').addEventListener('submit',async e=>{
  e.preventDefault(); const button=$('#register-button'); const msg=$('#register-message'); button.disabled=true; message(msg,'Registering…');
  try{
    const data=await request('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({creativeName:$('#creativeName').value,phone:$('#phone').value})});
    message(msg,data.message); const r=$('#participant-receipt'); r.hidden=false; r.innerHTML=`<b>Save your Participant ID</b><span>${escapeHtml(data.participant.id)}</span><p>Keep this ID private. You will need it to submit your design.</p><button type="button" class="button primary" id="copy-id">Copy Participant ID</button>`;
    $('#copy-id').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(data.participant.id);$('#copy-id').textContent='Copied';}catch{ $('#copy-id').textContent=data.participant.id; }});
    $('#register-form').reset(); await loadStatus();
  }catch(err){message(msg,err.message,true);button.disabled=false;}
});
$('#submit-form').addEventListener('submit',async e=>{
  e.preventDefault(); const button=$('#submit-button'); const msg=$('#submit-message'); button.disabled=true; message(msg,'Uploading your design…');
  try{const form=new FormData(e.currentTarget);const data=await request('/api/submit',{method:'POST',body:form});message(msg,data.message);e.currentTarget.reset();}
  catch(err){message(msg,err.message,true);}finally{button.disabled=false;}
});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function loadResults(){
 try{
  const d=await request('/api/results'); const area=$('#results-content');
  if(!d.published){$('#results-note').textContent='The scoreboard will appear here after judging results are published.';return;}
  $('#results-note').textContent='Official results published by the organizer.';
  if(!d.results.length){area.innerHTML='<p>No scored entries have been published yet.</p>';return;}
  area.innerHTML=`<div style="overflow-x:auto"><table class="results-table"><thead><tr><th>Rank</th><th>Creative name</th><th>Concept</th><th>Type</th><th>Colour</th><th>Layout</th><th>Total</th></tr></thead><tbody>${d.results.map(r=>`<tr><td>${r.rank===1?'🏆 ':''}${r.rank}</td><td>${escapeHtml(r.creativeName)}</td><td>${r.concept}</td><td>${r.typography}</td><td>${r.colour}</td><td>${r.layout}</td><td><b>${r.total}/100</b></td></tr>`).join('')}</tbody></table></div>`;
 }catch(e){$('#results-note').textContent='Results will be available when the website database is configured.';}
}
loadStatus();loadResults();
