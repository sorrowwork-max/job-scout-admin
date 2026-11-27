const c=window.JS_ADMIN_CONFIG;
const sb=supabase.createClient(c.supabaseUrl,c.supabasePublishableKey);
let token='';
let rows={profiles:[],devices:[],activity:[]};
let range=30,logs=[],logsOk=true,openUser=null;
let filter='all',query='',sortBy='new';
let aq='',aFrom='',aTo='';
const $=id=>document.getElementById(id);
const ERROR_RE=/fail|error|enter |invalid|required|denied|unknown|could not|not found|missing/i;
const OK_RE=/^(loaded|signed in|you have)/i;
const msg=t=>{const el=$('msg');el.textContent=t;const s=ERROR_RE.test(t)?'error':OK_RE.test(t)?'success':'idle';if(el.dataset.state!==s){el.dataset.state=s;el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');}};
const setBusy=(el,busy,label)=>{el.disabled=busy;const s=el.querySelector('span');if(s)s.textContent=busy?'Signing in…':label;};
function showAdmin(){$('login').hidden=true;$('adminArea').hidden=false;$('signOut').hidden=false;$('refresh').hidden=false;}
function showLogin(){const m=document.getElementById('modal');if(m)m.hidden=true;$('login').hidden=false;$('adminArea').hidden=true;$('signOut').hidden=true;$('refresh').hidden=true;$('users').innerHTML='';token='';rows={profiles:[],devices:[],activity:[]};}
function pill(value,kind){const s=document.createElement('span');s.className='pill '+kind;s.textContent=value;return s;}
function btn(label,klass,fn){const b=document.createElement('button');b.type='button';b.className='btn btn-sm '+klass;b.textContent=label;b.onclick=()=>fn(b);return b;}
// pointer-tracked light on glass buttons, same as the extension
document.addEventListener('pointermove',e=>{const t=e.target.closest?.('.btn, .icon-btn');if(!t)return;const r=t.getBoundingClientRect();t.style.setProperty('--mx',(e.clientX-r.left)+'px');t.style.setProperty('--my',(e.clientY-r.top)+'px');},{passive:true});

$('signIn').onclick=async()=>{
  const button=$('signIn');
  if(!$('email').value.trim()||!$('password').value){msg('Enter your owner email and password.');return;}
  setBusy(button,true);
  try{
    const {data,error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error)throw error;
    token=data.session.access_token;showAdmin();msg('Signed in. Loading account list…');await load();
  }catch(e){msg(e.message||'Sign-in failed.');}
  finally{setBusy(button,false,'Sign in to Admin');}
};
async function call(body){
  const r=await fetch(c.supabaseUrl+'/functions/v1/admin-users',{method:'POST',headers:{'Content-Type':'application/json','apikey':c.supabasePublishableKey,'Authorization':'Bearer '+token},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||d.message||'Admin request failed');
  return d;
}
async function runAction(button,body){
  button.disabled=true;const old=button.textContent;button.textContent='Working…';
  try{await call(body);await load();}catch(e){msg(e.message);}
  finally{button.disabled=false;button.textContent=old;}
}
function formatDate(v){
  if(!v)return 'Never';
  const d=new Date(v);if(Number.isNaN(d.getTime()))return 'Unknown';
  return d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric'})+'\n'+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
}
function activityState(device){
  if(!device)return {label:'Never used',kind:'inactive'};
  if(!device.last_seen_at)return {label:'Registered',kind:'pending'};
  const age=Date.now()-new Date(device.last_seen_at).getTime();
  if(Number.isFinite(age)&&age>=0&&age<=10*60*1000)return {label:'Seen recently',kind:'active'};
  return {label:'Inactive',kind:'inactive'};
}
const statusOf=p=>String(p.approval_status||'pending').toLowerCase();
const deviceOf=p=>(rows.devices||[]).find(x=>x.user_id===p.user_id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const utcDay=d=>d.toISOString().slice(0,10);
const lastDays=n=>{const out=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setUTCDate(d.getUTCDate()-i);out.push({key:utcDay(d),date:d,today:i===0});}return out;};
const fmtDay=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
// usage lookups
let byUser=new Map(),byDay=new Map();
function indexUsage(){
  byUser=new Map();byDay=new Map();
  for(const a of rows.activity||[]){
    const m=byUser.get(a.user_id)||new Map();m.set(String(a.day).slice(0,10),a.checks||0);byUser.set(a.user_id,m);
    const k=String(a.day).slice(0,10);byDay.set(k,(byDay.get(k)||0)+(a.checks||0));
  }
}
function usageOf(p){
  const m=byUser.get(p.user_id)||new Map(),d7=lastDays(7),d14=lastDays(14);
  const today=m.get(d7[6].key)||0;
  const week=d7.reduce((s,d)=>s+(m.get(d.key)||0),0);
  const activeDays=d7.filter(d=>(m.get(d.key)||0)>0).length;
  const series=d14.map(d=>({v:m.get(d.key)||0,today:d.today}));
  return {today,week,activeDays,series};
}

const sumDays=(p,days)=>{const m=byUser.get(p.user_id)||new Map();return days.reduce((s,d)=>s+(m.get(d.key)||0),0);};
const rangeLbl=()=>'Last '+range+' days';
const lastActivity=p=>{const m=byUser.get(p.user_id);let best=null;if(m)for(const [k,v] of m)if(v>0&&(!best||k>best))best=k;const dev=deviceOf(p);const seen=dev?.last_seen_at?new Date(dev.last_seen_at):null;if(seen)return seen;return best?new Date(best+'T00:00:00Z'):null;};
const fmtFull=v=>{if(!v)return 'Never';const d=new Date(v);return Number.isNaN(d.getTime())?'Unknown':d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});};
function bars(el,items,total){const max=Math.max(1,...items.map(i=>i.v));$(el).innerHTML=items.map(i=>`<div class="bar-col${i.today?' today':''}" title="${esc(i.title)}: ${i.v} checks">${items.length<=14?`<span class="bar-val">${i.v||''}</span>`:''}<div class="bar${i.v?'':' zero'}" style="height:${i.v?Math.max(5,Math.round(i.v/max*70)):3}px"></div>${items.length<=14?`<span class="bar-lbl">${esc(i.lbl)}</span>`:''}</div>`).join('');}
function weekStart(d){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x;}
function renderCharts(){
  const days=lastDays(range);
  bars('chD',days.map(d=>({v:byDay.get(d.key)||0,today:d.today,title:fmtDay(d.date),lbl:d.date.getUTCDate()})));
  const nW=Math.max(2,Math.ceil(range/7)),ws=[];const w0=weekStart(new Date());
  for(let i=nW-1;i>=0;i--){const s=new Date(w0);s.setUTCDate(s.getUTCDate()-i*7);ws.push(s);}
  bars('chW',ws.map((s,i)=>{let v=0;for(let k=0;k<7;k++){const d=new Date(s);d.setUTCDate(d.getUTCDate()+k);v+=byDay.get(utcDay(d))||0;}return {v,today:i===ws.length-1,title:'Week of '+fmtDay(s),lbl:fmtDay(s)};}));
  const nM=range>=90?4:range>=30?3:2,ms=[];const n=new Date();
  for(let i=nM-1;i>=0;i--)ms.push(new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth()-i,1)));
  bars('chM',ms.map((s,i)=>{const pre=s.toISOString().slice(0,7);let v=0;for(const [k,c] of byDay)if(k.startsWith(pre))v+=c;return {v,today:i===ms.length-1,title:s.toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'}),lbl:s.toLocaleDateString(undefined,{month:'short',timeZone:'UTC'})};}));
}
function meterList(el,list,empty,color){
  if(!list.length){$(el).innerHTML='<p class="hint" style="margin:0">'+empty+'</p>';return;}
  const max=Math.max(...list.map(r=>r.count),1);
  $(el).innerHTML=list.map(r=>`<div class="meter-row"><div class="meter-head"><span>${esc(r.label)}</span><strong>${r.count}</strong></div><div class="meter"><i style="width:${Math.max(3,Math.round(r.count/max*100))}%;--c:${color}"></i></div></div>`).join('');
}
function renderStats(){
  const ps=rows.profiles||[];indexUsage();
  const days=lastDays(range);
  const approvedList=ps.filter(p=>statusOf(p)==='approved');
  const pending=ps.filter(p=>statusOf(p)==='pending').length;
  const act=approvedList.map(p=>({p,count:sumDays(p,days)}));
  const active=act.filter(x=>x.count>0).length;
  $('sTotal').textContent=ps.length;$('sTotalSub').textContent=pending+' pending';
  $('sApproved').textContent=approvedList.length;$('sApprovedSub').textContent=ps.length?Math.round(approvedList.length/ps.length*100)+'% of users':'';
  $('sActive').textContent=active;$('sActiveSub').textContent='Checked in, '+rangeLbl().toLowerCase();
  $('sInactive').textContent=approvedList.length-active;$('sInactiveSub').textContent='Approved, no checks';
  document.querySelectorAll('.rangeLbl').forEach(e=>{if(!e.closest('#topLeast'))e.textContent=rangeLbl();});
  $('cAll').textContent=ps.length;$('cPending').textContent=pending;$('cApproved').textContent=approvedList.length;
  $('cBlocked').textContent=ps.filter(p=>['rejected','suspended'].includes(statusOf(p))).length;
  renderCharts();
  const label=x=>x.p.email||'Unknown account';
  meterList('topMost',act.filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,5).map(x=>({label:label(x),count:x.count})),'No checks in this range.','var(--green)');
  meterList('topLeast',[...act].sort((a,b)=>a.count-b.count).slice(0,5).map(x=>({label:label(x),count:x.count})),'No approved users yet.','var(--orange)');
  renderActivity();
}
function renderActivity(){
  const ps=rows.profiles||[],days=lastDays(range);
  const dayKeys=days.map(d=>d.key);
  let total=0;for(const k of dayKeys)total+=byDay.get(k)||0;
  $('aTotal').textContent=total;
  $('aDay').textContent=byDay.get(lastDays(1)[0].key)||0;
  $('aWeek').textContent=lastDays(7).reduce((s,d)=>s+(byDay.get(d.key)||0),0);
  $('aMonth').textContent=lastDays(30).reduce((s,d)=>s+(byDay.get(d.key)||0),0);
  let lastOk=null;for(const a of rows.activity||[])if((a.checks||0)>0){const k=String(a.day).slice(0,10);if(!lastOk||k>lastOk)lastOk=k;}
  const seenMax=(rows.devices||[]).reduce((m,d)=>d.last_seen_at&&(!m||d.last_seen_at>m)?d.last_seen_at:m,null);
  $('aLast').textContent='Last activity: '+(seenMax?fmtFull(seenMax):lastOk||'never');
  const from=aFrom||dayKeys[0],to=aTo||dayKeys[dayKeys.length-1];
  const body=$('aRows');body.innerHTML='';
  const list=ps.filter(p=>!aq||String(p.email||'').toLowerCase().includes(aq)).map(p=>{
    const m=byUser.get(p.user_id)||new Map();let c=0,ad=0;const series=[];
    for(const [k,v] of m)if(k>=from&&k<=to){c+=v;if(v>0)ad++;}
    const d14=lastDays(14);for(const d of d14)series.push({v:m.get(d.key)||0,today:d.today});
    return {p,c,ad,series};}).sort((a,b)=>b.c-a.c);
  for(const r of list){
    const tr=document.createElement('tr');tr.className='clickable';tr.onclick=()=>showUser(r.p.user_id);
    const max=Math.max(1,...r.series.map(x=>x.v));
    tr.innerHTML=`<td class="who">${esc(r.p.email||'Unknown account')}</td><td><b>${r.c}</b></td><td>${r.ad}</td><td class="when" style="white-space:normal">${esc(fmtFull(lastActivity(r.p)))}</td><td class="usage-cell"><div class="spark">${r.series.map(x=>`<i class="${x.v?'on':''}${x.today?' today':''}" style="height:${x.v?Math.max(16,Math.round(x.v/max*100)):10}%"></i>`).join('')}</div></td>`;
    body.append(tr);}
  $('aEmpty').hidden=!!list.length;
}
function matches(p){
  const s=statusOf(p);
  if(filter==='pending'&&s!=='pending')return false;
  if(filter==='approved'&&s!=='approved')return false;
  if(filter==='blocked'&&!['rejected','suspended'].includes(s))return false;
  return !query||String(p.email||'').toLowerCase().includes(query);
}
function sorted(list){
  const out=[...list];
  if(sortBy==='usage')out.sort((a,b)=>usageOf(b).week-usageOf(a).week||usageOf(b).today-usageOf(a).today);
  if(sortBy==='seen')out.sort((a,b)=>new Date(deviceOf(b)?.last_seen_at||0)-new Date(deviceOf(a)?.last_seen_at||0));
  return out;
}
function usageCell(p){
  const u=usageOf(p),td=document.createElement('td');td.className='usage-cell';
  const max=Math.max(1,...u.series.map(x=>x.v));
  td.innerHTML=`<b>${u.today}</b> <span class="hint" style="margin:0">today</span><small>${u.week} this week, ${u.activeDays} active day${u.activeDays===1?'':'s'}</small><div class="spark" title="Checks per day, last 14 days">${u.series.map(x=>`<i class="${x.v?'on':''}${x.today?' today':''}" style="height:${x.v?Math.max(16,Math.round(x.v/max*100)):10}%"></i>`).join('')}</div>`;
  return td;
}

function renderRows(){
  const body=$('users');body.innerHTML='';
  const list=sorted((rows.profiles||[]).filter(matches));
  for(const p of list){
    const dev=deviceOf(p),s=statusOf(p),tr=document.createElement('tr');tr.className='clickable';
    tr.onclick=e=>{if(e.target.closest('button'))return;showUser(p.user_id);};
    const email=document.createElement('td');email.className='who';email.textContent=p.email||'Unknown account';
    const joined=document.createElement('small');joined.textContent='Joined '+(p.created_at?new Date(p.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'unknown');email.append(joined);tr.append(email);
    const st=document.createElement('td');st.append(pill(s,s));tr.append(st);
    const dv=document.createElement('td');dv.append(pill(dev?(dev.active?'Active':'Revoked'):'Not registered',dev?(dev.active?'active':'revoked'):'pending'));tr.append(dv);
    tr.append(usageCell(p));
    const l=document.createElement('td');l.className='when';l.textContent=formatDate(dev?.last_seen_at);tr.append(l);
    const act=document.createElement('td');const w=document.createElement('div');w.className='row-actions';
    w.append(btn('Details','btn-secondary',()=>showUser(p.user_id)));
    if(s!=='approved')w.append(btn(s==='pending'?'Approve':'Reactivate','btn-secondary btn-good',()=>doStatus(p,'approved')));
    if(s==='pending')w.append(btn('Reject','btn-danger',()=>doStatus(p,'rejected')));
    if(s==='approved')w.append(btn('Suspend','btn-danger',()=>doStatus(p,'suspended')));
    act.append(w);tr.append(act);body.append(tr);
  }
  $('empty').hidden=!!list.length;
}

/* ---- modal + confirmation ---- */
function openModal(title,bodyNode,footNodes){
  $('mTitle').textContent=title;$('mBody').replaceChildren(...(Array.isArray(bodyNode)?bodyNode:[bodyNode]));$('mFoot').replaceChildren(...(footNodes||[]));$('modal').hidden=false;
}
function closeModal(){$('modal').hidden=true;openUser=null;}
const htmlNode=h=>{const d=document.createElement('div');d.innerHTML=h;return d;};
function confirmBox(title,text,okLabel,danger){
  return new Promise(res=>{
    const prev=openUser;
    const done=v=>{res(v);if(prev){showUser(prev);}else closeModal();};
    openModal(title,htmlNode('<p style="margin:0;line-height:1.5">'+esc(text)+'</p>'),[
      btn(okLabel,danger?'btn-danger':'btn-primary',()=>done(true)),btn('Cancel','btn-secondary',()=>done(false))]);
    openUser=null;
  });
}
async function logAdmin(action,p,result){
  try{await callLogs({op:'write',action,target_user_id:p.user_id,target_email:p.email||null,result});}catch(_){}
}
async function doStatus(p,value){
  const verbs={approved:p.approval_status==='pending'?['Approve user','User approved','Approve']:['Reactivate user','User reactivated','Reactivate'],rejected:['Reject user','User rejected','Reject'],suspended:['Suspend user','User suspended','Suspend']};
  const [t,logName,ok]=verbs[value];
  if(!await confirmBox(t,(p.email||'This user')+' will be set to "'+value+'".',ok,value!=='approved'))return;
  try{await call({user_id:p.user_id,status:value});await logAdmin(logName,p,'success');msg('Updated '+(p.email||'user')+'.');}
  catch(e){await logAdmin(logName,p,'failed');msg(e.message);}
  await load();
}
async function doDevice(p,kind){
  const rel=kind==='release';
  if(!await confirmBox(rel?'Release device':'Revoke device',rel?'Release the registered device for '+(p.email||'this user')+'? They can register a new device on next sign in.':'Revoke the registered device for '+(p.email||'this user')+'? It will lose access immediately.',rel?'Release':'Revoke',!rel))return;
  const name=rel?'Device released':'Device revoked';
  try{await call({user_id:p.user_id,status:p.approval_status,[rel?'release_device':'revoke_device']:true});await logAdmin(name,p,'success');msg(name+' for '+(p.email||'user')+'.');}
  catch(e){await logAdmin(name,p,'failed');msg(e.message);}
  await load();
}
function passwordBox(p){
  const body=htmlNode('<label class="field-label" for="pw1">New password</label><div class="field"><input id="pw1" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div><label class="field-label" for="pw2">Confirm password</label><div class="field"><input id="pw2" type="password" autocomplete="new-password" placeholder="Repeat password"></div><p class="hint" id="pwErr" style="color:var(--red)"></p>');
  const prev=p.user_id;
  const back=()=>showUser(prev);
  const go=btn('Update password','btn-primary',async b=>{
    const a=$('pw1').value,c=$('pw2').value,err=$('pwErr');
    if(a.length<8){err.textContent='Password must contain at least 8 characters.';return;}
    if(a!==c){err.textContent='Passwords do not match.';return;}
    b.disabled=true;b.textContent='Updating…';
    try{await call({action:'set_password',user_id:p.user_id,password:a});await logAdmin('Password reset',p,'success');msg('Password updated for '+(p.email||'the selected user')+'.');back();}
    catch(e){await logAdmin('Password reset',p,'failed');err.textContent=e.message;b.disabled=false;b.textContent='Update password';}
  });
  openModal('Reset password for '+(p.email||'user'),body,[go,btn('Cancel','btn-secondary',back)]);openUser=null;
  setTimeout(()=>$('pw1')?.focus(),30);
}
function showUser(id){
  const p=(rows.profiles||[]).find(x=>x.user_id===id);if(!p)return;openUser=id;
  const dev=deviceOf(p),s=statusOf(p),m=byUser.get(p.user_id)||new Map();
  const total=[...m.values()].reduce((a,b)=>a+b,0);
  const d30=lastDays(30).map(d=>({d,v:m.get(d.key)||0}));
  const recent=[...m.entries()].filter(([,v])=>v>0).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10);
  const devTxt=dev?(dev.active?'Registered, active':'Revoked'):'No device registered';
  const max=Math.max(1,...d30.map(x=>x.v));
  const body=htmlNode(`<div class="kv">
    <div><span>Email</span><b>${esc(p.email||'Unknown')}</b></div>
    <div><span>Approval status</span><b>${esc(s)}</b></div>
    <div><span>Registered</span><b>${esc(fmtFull(p.created_at))}</b></div>
    <div><span>Last active</span><b>${esc(fmtFull(dev?.last_seen_at||lastActivity(p)))}</b></div>
    <div><span>Device</span><b>${esc(devTxt)}</b></div>
    <div><span>Total authorization checks</span><b>${total}</b></div></div>
    <div class="mini-h">Daily checks, last 30 days</div>
    <div class="chart mini">${d30.map(x=>`<div class="bar-col${x.d.today?' today':''}" title="${esc(fmtDay(x.d.date))}: ${x.v}"><div class="bar${x.v?'':' zero'}" style="height:${x.v?Math.max(5,Math.round(x.v/max*70)):3}px"></div></div>`).join('')}</div>
    <div class="mini-h">Recent activity</div>
    <div class="hist">${recent.length?recent.map(([k,v])=>`<div><span>${esc(fmtDay(new Date(k+'T00:00:00Z')))}</span><b>${v} check${v===1?'':'s'}</b></div>`).join(''):'<div><span>No activity recorded</span></div>'}</div>`);
  const foot=[];
  if(s!=='approved')foot.push(btn(s==='pending'?'Approve':'Reactivate','btn-secondary btn-good',()=>doStatus(p,'approved')));
  if(s==='pending')foot.push(btn('Reject','btn-danger',()=>doStatus(p,'rejected')));
  if(s==='approved')foot.push(btn('Suspend','btn-danger',()=>doStatus(p,'suspended')));
  foot.push(btn('Reset password','btn-secondary',()=>passwordBox(p)));
  foot.push(btn('Generate invoice','btn-secondary',()=>invoiceBox(p)));
  foot.push(btn('Release device','btn-secondary',()=>doDevice(p,'release')));
  foot.push(btn('Revoke device','btn-danger',()=>doDevice(p,'revoke')));
  openModal(p.email||'User details',body,foot);openUser=id;
}

/* ---- admin logs ---- */
async function callLogs(body){
  const r=await fetch(c.supabaseUrl+'/functions/v1/admin-logs',{method:'POST',headers:{'Content-Type':'application/json','apikey':c.supabasePublishableKey,'Authorization':'Bearer '+token},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Logs request failed');
  return d;
}
async function loadLogs(){
  try{const d=await callLogs({op:'list'});logs=d.logs||[];logsOk=true;}catch(e){logs=[];logsOk=false;}
  renderLogs();
}
function renderLogs(){
  const b=$('logRows');b.innerHTML='';
  for(const l of logs){const tr=document.createElement('tr');
    tr.innerHTML=`<td class="who">${esc(l.action)}</td><td>${esc(l.target_email||'-')}</td><td class="when" style="white-space:normal">${esc(fmtFull(l.created_at))}</td><td>${l.result==='success'?'<span class="pill active">Success</span>':'<span class="pill revoked">Failed</span>'}</td>`;b.append(tr);}
  $('logEmpty').hidden=!!logs.length;
  $('logEmpty').textContent=logsOk?'No admin actions recorded yet.':'Admin logging is not set up yet. Deploy the admin-logs function and run the SQL in the supabase folder.';
}

/* ---- extension placeholders ---- */
const EXT=['Job listings checked','Direct application links found','Jobs saved to Google Sheets','Total scanning duration','Completed scans','Last successful scan'];
$('extGrid').innerHTML=EXT.map(n=>`<div class="ext-item"><span>${n}</span><strong>Unavailable</strong><small>Needs extension reporting</small></div>`).join('');

/* ---- tabs and range ---- */
function setTab(t){
  document.querySelectorAll('#tabs .tab').forEach(b=>{const on=b.dataset.tab===t;b.classList.toggle('is-on',on);b.setAttribute('aria-selected',on);});
  document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!=='pane-'+t);
  $('rangeSeg').style.visibility=['overview','activity'].includes(t)?'visible':'hidden';
  if(t==='logs')loadLogs();
}
$('tabs').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b)setTab(b.dataset.tab);});
function setRange(r){range=r;document.querySelectorAll('#rangeSeg .btn').forEach(b=>b.classList.toggle('is-on',+b.dataset.r===r));if(rows.profiles.length||rows.activity.length)renderStats();}
$('rangeSeg').addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b)setRange(+b.dataset.r);});
setRange(30);
$('aSearch').addEventListener('input',e=>{aq=e.target.value.trim().toLowerCase();renderActivity();});
$('aFrom').addEventListener('change',e=>{aFrom=e.target.value;renderActivity();});
$('aTo').addEventListener('change',e=>{aTo=e.target.value;renderActivity();});
$('aClear').onclick=()=>{aq=aFrom=aTo='';$('aSearch').value=$('aFrom').value=$('aTo').value='';renderActivity();};
$('mClose').onclick=closeModal;
$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').hidden)closeModal();});

async function load(){
  try{
    const d=await call({action:'list'});
    rows={profiles:d.profiles||[],devices:d.devices||[],activity:d.activity||[]};
    renderStats();renderRows();
    msg('Loaded '+rows.profiles.length+' account(s). Activity updates when the extension checks account access.');
  }catch(e){msg(e.message);}
}
$('refresh').onclick=load;
$('signOut').onclick=async()=>{try{await sb.auth.signOut();}catch(_){}showLogin();msg('You have signed out.');};
$('password').addEventListener('keydown',e=>{if(e.key==='Enter')$('signIn').click();});
$('sort').addEventListener('change',e=>{sortBy=e.target.value;renderRows();});
$('filter').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderRows();});
$('chips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;filter=b.dataset.f;document.querySelectorAll('#chips .btn').forEach(x=>x.classList.toggle('is-on',x===b));renderRows();});

/* ---- invoice generator (document only: no billing or payment processing) ---- */
function invoiceBox(p){
  const today=new Date().toISOString().slice(0,10);
  const no='JS-'+today.replace(/-/g,'')+'-'+String(Math.floor(1000+Math.random()*9000));
  const f=(id,label,val,type)=>`<label class="field-label" for="${id}">${label}</label><div class="field"><input id="${id}" type="${type||'text'}" value="${esc(val)}"></div>`;
  const body=htmlNode(f('ivNo','Invoice number',no)+f('ivDate','Invoice date',today,'date')+f('ivDesc','Description','Job Scout extension access')+f('ivPeriod','Period (optional)','')+f('ivAmt','Amount','', 'number')+f('ivCur','Currency','PKR')+f('ivNote','Notes / payment instructions (optional)','')+'<p class="hint" id="ivErr" style="color:var(--red)"></p>');
  const back=()=>showUser(p.user_id);
  const go=btn('Generate invoice','btn-primary',()=>{
    const amt=parseFloat($('ivAmt').value);
    if(!(amt>=0)||$('ivAmt').value===''){$('ivErr').textContent='Enter a valid amount.';return;}
    const v=id=>$(id).value.trim();
    const data={no:v('ivNo'),date:v('ivDate'),desc:v('ivDesc'),period:v('ivPeriod'),cur:v('ivCur')||'',note:v('ivNote'),amt,email:p.email||''};
    if(!printInvoice(data)){$('ivErr').textContent='Pop-up blocked. Allow pop-ups for this page and try again.';return;}
    logAdmin('Invoice generated',p,'success');back();
  });
  openModal('Invoice for '+(p.email||'user'),body,[go,btn('Cancel','btn-secondary',back)]);openUser=null;
}
function printInvoice(d){
  const w=window.open('','_blank');if(!w)return false;
  const money=d.cur+' '+d.amt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const dt=d.date?new Date(d.date+'T00:00:00').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):'';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(d.no)}</title><style>
  *{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:40px;max-width:760px;margin:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}h1{margin:0;font-size:28px;letter-spacing:-.02em}
  .muted{color:#666;font-size:13px;line-height:1.6}table{width:100%;border-collapse:collapse;margin-top:24px}
  th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:2px solid #111;padding:8px 0}
  td{padding:14px 0;border-bottom:1px solid #ddd}td:last-child,th:last-child{text-align:right}
  .total{display:flex;justify-content:flex-end;margin-top:18px;font-size:20px;font-weight:700}.note{margin-top:32px;font-size:13px;white-space:pre-wrap}
  .bar{margin-bottom:20px;text-align:right}button{padding:8px 16px;font-size:14px;cursor:pointer}@media print{.bar{display:none}body{padding:0}}
  </style></head><body><div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="top"><div><h1>INVOICE</h1><div class="muted">No. ${esc(d.no)}<br>Date: ${esc(dt)}</div></div><div style="text-align:right"><strong>Job Scout</strong></div></div>
  <div class="muted"><strong style="color:#111">Billed to</strong><br>${esc(d.email)}</div>
  <table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>${esc(d.desc)}${d.period?'<div class="muted">'+esc(d.period)+'</div>':''}</td><td>${esc(money)}</td></tr></tbody></table>
  <div class="total">Total: ${esc(money)}</div>${d.note?'<div class="note"><strong>Notes</strong><br>'+esc(d.note)+'</div>':''}
  </body></html>`);
  w.document.close();return true;
}
