const SCHEME = {
  vehicle: {
    'new-retail': { order: 40, delivery: 40 },
    'new-motab':  { order: 30, delivery: 30 },
    'used':       { order: 0,  delivery: 60 }
  },
  fi: {
    'new-retail': { finance: 10, paint: 35, refresh: 35, warranty: 35, carepack: 25 },
    'new-motab':  { finance: 10, paint: 35, refresh: 35, warranty: 35, carepack: 25 },
    'used':       { finance: 60, paint: 30, refresh: 30, warranty: 30, assurance: 10 }
  }
};
const FI_LABELS = {
  finance:'Finance', paint:'Paint', refresh:'Refresh', warranty:'Warranty',
  carepack:'Motability Care Pack', assurance:'Assurance Upgrade'
};
const STAGE_LABELS = {
  lead:'Lead', quoted:'Quoted', 'test-drive':'Test drive', ordered:'Ordered',
  'awaiting-delivery':'Awaiting delivery', delivered:'Delivered', lost:'Lost / cancelled'
};
const ANNUAL_TARGET = 160;
// Pentagon's scheme year runs July to June.
const nowForScheme = new Date();
const ANNUAL_YEAR = nowForScheme.getMonth() >= 6 ? nowForScheme.getFullYear() : nowForScheme.getFullYear() - 1;
const ANNUAL_START = ANNUAL_YEAR+'-07-01';
const ANNUAL_END   = (ANNUAL_YEAR+1)+'-06-30';
const ORDER_COMMISSION_START = '2026-07-01';
const SUPABASE_URL = 'https://fwrvpjxxcdmeuukjwhjp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VRXsdVEqBBCQ1YUHYrHf8Q_szqZWGsx';
const CLOUD_TABLE = 'deals';

let deals = JSON.parse(localStorage.getItem('ps_deals') || '[]');
let tasks = JSON.parse(localStorage.getItem('ps_tasks') || '[]');
let settings = JSON.parse(localStorage.getItem('ps_settings') || JSON.stringify({
  basic:20000, netTarget:3000, pension:0, otherDed:0, theme:'dark', monthTargets:{}, newVehicleTargets:{}, naMonths:{}
}));
settings.monthTargets=settings.monthTargets||{};
settings.newVehicleTargets=settings.newVehicleTargets||{};settings.naMonths=settings.naMonths||{};
let paymentContext = null;
let openDealId = null;
let calendarEvents = JSON.parse(localStorage.getItem('ps_calendar') || '[]');
let calendarView = 'week';
let calendarCursor = new Date();
let calendarEditId = '';

function uid(prefix='id'){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function money(n){ return '£' + Math.round(Number(n)||0).toLocaleString('en-GB'); }
function money2(n){ return '£' + Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function parseDate(s){ return s ? new Date(s + 'T12:00:00') : null; }
function monthKey(dateStr){ const d=parseDate(dateStr); if(!d || isNaN(d)) return ''; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function monthAfter(key){ if(!/^\d{4}-\d{2}$/.test(key)) return ''; const [y,m]=key.split('-').map(Number); const next=m===12?{y:y+1,m:1}:{y,m:m+1}; return next.y+'-'+String(next.m).padStart(2,'0'); }
function monthLabel(key){ if(!/^\d{4}-\d{2}$/.test(key)) return '—'; const [y,m]=key.split('-').map(Number); return new Date(y,m-1,1).toLocaleString('en-GB',{month:'long',year:'numeric'}); }
function shortMonth(key){ if(!/^\d{4}-\d{2}$/.test(key)) return '—'; const [y,m]=key.split('-').map(Number); return new Date(y,m-1,1).toLocaleString('en-GB',{month:'short'}); }
function dateLabel(s){ return s ? parseDate(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'; }
function currentMonthKey(){ return monthKey(todayKey()); }
function previousMonthKey(){ const d=new Date(); d.setMonth(d.getMonth()-1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function annualMonths(){ const out=[]; const d=new Date(ANNUAL_YEAR,6,1,12); for(let i=0;i<12;i++){ out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); d.setMonth(d.getMonth()+1); } return out; }

function normalizeStage(d){
  if(d.stage) return d.stage;
  if(d.status==='lead') return 'lead';
  if(d.status==='order') return 'ordered';
  if(d.status==='delivery' || d.status==='both') return d.deliveryDate ? 'delivered' : 'awaiting-delivery';
  return 'lead';
}
function migrateDeal(d){
  const x={...d};
  x.id=x.id||uid('deal');
  x.customer=x.customer||'';
  x.phone=x.phone||'';
  x.email=x.email||'';
  x.vehicle=x.vehicle||'';
  x.stock=x.stock||'';
  x.type=x.type||'new-retail';
  x.stage=normalizeStage(x);
  x.leadDate=x.leadDate||x.date||'';
  x.orderDate=x.orderDate || ((x.status==='order'||x.status==='both') ? x.date : '');
  x.deliveryDate=x.deliveryDate || ((x.status==='delivery'||x.status==='both') ? x.date : '');
  x.expectedDeliveryDate=x.expectedDeliveryDate||'';
  x.handoverDate=x.handoverDate||'';
  x.handoverTime=x.handoverTime||'';
  x.handover=x.handover&&typeof x.handover==='object'?x.handover:{
    prep:'not-set',service:'not-set',mot:'not-set',cosmetic:'not-set',valet:'not-set',documents:'not-set'
  };
  x.handover={prep:x.handover.prep||'not-set',service:x.handover.service||'not-set',mot:x.handover.mot||'not-set',cosmetic:x.handover.cosmetic||'not-set',valet:x.handover.valet||'not-set',documents:x.handover.documents||'not-set'};
  x.financePayoutDate=x.financePayoutDate||'';
  x.csi=(x.csi!==undefined && x.csi!==null && x.csi!=='') ? Number(x.csi) : null;
  x.px=x.px||'';
  x.nextAction=x.nextAction||'';
  x.fi=Array.isArray(x.fi)?x.fi:[];
  x.journal=Array.isArray(x.journal)?x.journal:(x.notes?[{id:uid('note'),date:x.leadDate||todayKey(),text:x.notes}]:[]);
  x.adjustments=Array.isArray(x.adjustments)?x.adjustments:[];
  x.payments=x.payments && typeof x.payments==='object' ? x.payments : {};
  return x;
}
deals=deals.map(migrateDeal);

function setTheme(t){
  settings.theme=t; document.body.setAttribute('data-theme',t);
  const b=document.getElementById('themeBtn'); if(b)b.textContent=t==='dark'?'Light':'Dark';
  localStorage.setItem('ps_settings',JSON.stringify(settings));
}
function toggleTheme(){ setTheme(document.body.getAttribute('data-theme')==='dark'?'light':'dark'); persist(); cloudSave(); }

function annualEligibleDeals(){
  // A delivery is a delivered unit for performance purposes. Do not remove a
  // historical delivery just because a later note/stage is changed.
  return deals.filter(d=>d.deliveryDate && d.deliveryDate>=ANNUAL_START && d.deliveryDate<=ANNUAL_END);
}
function monthDeals(key){ return deals.filter(d=>monthKey(d.deliveryDate)===key || monthKey(d.orderDate)===key); }
function monthTarget(key){
  const v=(settings.monthTargets||{})[key];
  return v ? Number(v) : null;
}
function newVehicleTarget(key){
  const v=(settings.newVehicleTargets||{})[key];
  return v ? Number(v) : null;
}
function monthNA(key){ return !!((settings.naMonths||{})[key]); }
function toggleMonthNA(key){
  settings.naMonths=settings.naMonths||{};
  if(settings.naMonths[key]) delete settings.naMonths[key];
  else settings.naMonths[key]=true;
  persist();refreshAll();cloudSave();
}
function openTargetSettings(key){
  const tab=document.querySelector('.tab[data-tab="settings"]');
  if(tab)tab.click();
  const monthEl=document.getElementById('setTargetMonth');
  if(monthEl)monthEl.value=key;
  document.getElementById('setMonthTarget').value=monthTarget(key)||'';
  document.getElementById('setNewVehicleTarget').value=newVehicleTarget(key)||'';
}

function estimateAnnualNet(grossAnnual){
  const gross=Math.max(0,Number(grossAnnual)||0);
  const pensionRate=Math.max(0,Number(settings.pension)||0)/100;
  const pension=gross*pensionRate;
  let taxableBase=Math.max(0,gross-pension);
  let pa=12570;
  if(taxableBase>100000) pa=Math.max(0,12570-(taxableBase-100000)/2);
  let taxable=Math.max(0,taxableBase-pa);
  const basic=Math.min(taxable,37700);
  taxable-=basic;
  const higher=Math.min(taxable,125140-50270);
  taxable-=higher;
  const additional=Math.max(0,taxable);
  const tax=basic*.20+higher*.40+additional*.45;
  const niBase=Math.max(0,gross-pension);
  const ni8=Math.max(0,Math.min(niBase,50270)-12570)*.08;
  const ni2=Math.max(0,niBase-50270)*.02;
  return Math.max(0,gross-pension-tax-ni8-ni2-(Number(settings.otherDed)||0)*12);
}
function grossForNet(targetMonthly){
  let lo=Math.max(1,targetMonthly*12),hi=Math.max(hiForTarget(targetMonthly),60000);
  for(let i=0;i<60;i++){ const mid=(lo+hi)/2; if(estimateAnnualNet(mid)/12<targetMonthly)lo=mid;else hi=mid; }
  return Math.round(hi);
}
function hiForTarget(t){ return t*12*2; }
function commissionTarget(){
  const grossMonth=grossForNet(Number(settings.netTarget)||3000)/12;
  const basicMonth=(Number(settings.basic)||20000)/12;
  return Math.max(0,Math.round(grossMonth-basicMonth));
}

function eventDefs(d){
  const out=[];
  const v=SCHEME.vehicle[d.type]||{order:0,delivery:0};

  // New vehicle order/invoice commission is a separate event from delivery.
  // Under the current 2026/27 scheme, the £40/£30 order payment applies to
  // orders taken from 1 July onwards. It is tracked in the month of the
  // order/invoice, with the one-month-in-arrears payroll view handled here.
  if(d.type!=='used' && d.orderDate && d.orderDate>=ORDER_COMMISSION_START && v.order>0){
    out.push({
      id:'order',kind:'order',label:'Order / invoice commission',amount:v.order,
      eligibleDate:d.orderDate,payMonth:monthAfter(monthKey(d.orderDate)),
      requires:'Order / invoice + compliant deal file'
    });
  }

  // All new and used delivery commission is a separate delivery event.
  if(d.deliveryDate){
    out.push({
      id:'delivery',kind:'delivery',
      label:d.type==='used'?'Used delivery commission':'Vehicle delivery commission',
      amount:v.delivery,eligibleDate:d.deliveryDate,payMonth:monthAfter(monthKey(d.deliveryDate)),
      requires:'Delivery + compliant deal file'
    });
  }

  const products=SCHEME.fi[d.type]||{};
  (d.fi||[]).forEach(k=>{
    const amount=products[k]; if(!amount)return;
    const earnedDate=k==='finance' ? d.financePayoutDate : d.deliveryDate;
    out.push({
      id:'fi:'+k,kind:'fi',label:FI_LABELS[k]||k,amount,
      eligibleDate:earnedDate||'',
      payMonth:earnedDate?monthAfter(monthKey(earnedDate)):'',
      requires:k==='finance'?'Finance company payout confirmation':'Delivery + compliant deal file'
    });
  });
  return out;
}
function paymentFor(d,eventId){
  const p=d.payments && d.payments[eventId];
  return p && typeof p==='object' ? p : {amount:0,date:'',note:''};
}
function dealRisk(d){
  const reasons=[];
  if(d.csi!==null && d.csi<8) reasons.push('CSI below 8: full commission on this deal is at risk / subject to debit back.');
  if(d.stage==='lost' && eventPaid(d,{id:'order'})) reasons.push('Order commission was previously recorded as paid; record any actual debit-back separately if it appears on payroll.');
  if((d.fi||[]).includes('finance') && !d.financePayoutDate && d.deliveryDate) reasons.push('Finance payout confirmation not recorded.');
  if(d.deliveryDate && d.stage!=='lost' && !d.nextAction && tasks.filter(t=>t.dealId===d.id&&!t.done).length===0) reasons.push('No next action or open task recorded.');
  return reasons;
}
function eligibleEvent(d,e){
  if(!e.amount || !e.eligibleDate) return 0;
  // Do not erase a commission event from history merely because the current
  // deal stage later changes to lost or a CSI issue is recorded. If it was
  // already paid, the historical event stays visible and any actual debit-back
  // is entered as a separate adjustment. For unpaid cancelled/failed events,
  // do not project the commission as payable.
  if(d.stage==='lost' && eventPaid(d,e)===0) return 0;
  if(d.csi!==null && d.csi<8 && eventPaid(d,e)===0) return 0;
  return e.amount;
}
function eventPaid(d,e){ return Math.max(0,Number(paymentFor(d,e.id).amount)||0); }
function monthlyAdjustments(key){
  return deals.reduce((sum,d)=>(d.adjustments||[]).reduce((s,a)=>monthKey(a.date)===key?s+Number(a.amount||0):s, sum),0);
}
function schemeReduction(key,rawEarned,newDeliveries){
  const target=newVehicleTarget(key);
  if(monthNA(key)||target===null||newDeliveries>=target||rawEarned<=0)return 0;
  return rawEarned*0.20;
}
function monthStatsRaw(key){
  let rawEarned=0;
  deals.forEach(d=>eventDefs(d).forEach(e=>{
    const el=eligibleEvent(d,e);
    if(e.eligibleDate&&monthKey(e.eligibleDate)===key)rawEarned+=el;
  }));
  const yearDeals=annualEligibleDeals().filter(d=>monthKey(d.deliveryDate)===key);
  return {rawEarned,units:yearDeals.length,newUnits:yearDeals.filter(d=>d.type!=='used').length};
}
function previousKey(key){
  if(!/^\d{4}-\d{2}$/.test(key))return '';
  const [y,m]=key.split('-').map(Number);
  const prev=m===1?{y:y-1,m:12}:{y,m:m-1};
  return prev.y+'-'+String(prev.m).padStart(2,'0');
}
function monthStats(key){
  let rawEarned=0,expected=0,paid=0,units=0,newUnits=0,used=0,motab=0;
  const expectedEvents=[];
  annualEligibleDeals().forEach(d=>{
    if(monthKey(d.deliveryDate)===key){
      units++; if(d.type==='used')used++;else if(d.type==='new-motab')motab++;else newUnits++;
    }
  });
  deals.forEach(d=>{
    eventDefs(d).forEach(e=>{
      const el=eligibleEvent(d,e);
      if(e.eligibleDate&&monthKey(e.eligibleDate)===key)rawEarned+=el;
      if(e.payMonth===key){
        const paidAlready=eventPaid(d,e);
        const remaining=Math.max(0,el-paidAlready);
        if(remaining>0){expected+=remaining;expectedEvents.push({d,e,remaining});}
      }
      const p=paymentFor(d,e);
      if(p.date&&monthKey(p.date)===key)paid+=Number(p.amount)||0;
    });
  });
  const adj=monthlyAdjustments(key);
  const reduction=schemeReduction(key,rawEarned,newUnits+motab);
  const prev=previousKey(key);
  const prevRaw=monthStatsRaw(prev);
  const priorReduction=schemeReduction(prev,prevRaw.rawEarned,prevRaw.newUnits);
  expected=Math.max(0,expected-priorReduction);
  return {key,earned:Math.max(0,rawEarned-reduction+adj),grossEarned:rawEarned,adjustments:adj,schemeReduction:reduction,expected,paid,units,newUnits,used,motab,expectedEvents,priorKey:prev,priorReduction};
}
function netForMonthCommission(comm){
  const grossMonth=(Number(settings.basic)||20000)/12+Number(comm||0);
  return estimateAnnualNet(grossMonth*12)/12;
}
function payMonthForCurrent(){ return monthAfter(currentMonthKey()); }

function renderSummary(){
  const key=currentMonthKey(), s=monthStats(key);
  const target=commissionTarget(), grossNeeded=Math.round(grossForNet(Number(settings.netTarget)||3000)/12), net=netForMonthCommission(s.earned);
  document.getElementById('grossNeeded').textContent=money(grossNeeded);
  document.getElementById('commNeeded').textContent=money(target);
  document.getElementById('netNow').textContent=money(net);
  document.getElementById('commGap').textContent=money(Math.max(0,target-s.earned));
  document.getElementById('netProgress').style.width=Math.min(100,s.earned/(target||1)*100)+'%';
  document.getElementById('dashEarned').textContent=money(s.earned);
  document.getElementById('dashEarnedSub').textContent=monthLabel(key);
  document.getElementById('dashCommProgress').style.width=Math.min(100,s.earned/(target||1)*100)+'%';
  const next=monthStats(payMonthForCurrent());
  document.getElementById('dashExpected').textContent=money(next.expected);
  document.getElementById('dashExpectedSub').textContent=monthLabel(next.key)+' payslip view';
  document.getElementById('dashPaid').textContent=money(s.paid);
  const dashGap=document.getElementById('dashCommGap');if(dashGap)dashGap.textContent=money(Math.max(0,target-s.earned));
  const openTasks=tasks.filter(t=>!t.done);
  const overdue=openTasks.filter(t=>t.due && t.due<todayKey()).length;
  document.getElementById('dashWork').textContent=String(openTasks.length);
  document.getElementById('dashWorkSub').textContent=overdue?overdue+' overdue':'Open customer tasks';
}
const HANDOVER_STEPS=[
  ['prep','Prep'],['service','Service'],['mot','MOT'],['cosmetic','Cosmetic'],['valet','Valet'],['documents','Docs / keys']
];
const HANDOVER_STATUS_LABELS={ 'not-set':'Not set', booked:'Booked', progress:'In progress', done:'Done', na:'N/A' };
const CALENDAR_TYPE_LABELS={appointment:'Appointment','test-drive':'Test drive',meeting:'Meeting',followup:'Follow-up',other:'Other'};

function addDaysKey(key,delta){
  const d=parseDate(key)||new Date();
  d.setDate(d.getDate()+delta);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function startOfWeekKey(key){
  const d=parseDate(key)||new Date(),day=d.getDay(),diff=day===0?-6:1-day;
  return addDaysKey(key,diff);
}
function daysInMonth(year,monthIndex){ return new Date(year,monthIndex+1,0).getDate(); }
function getHandoverDate(d){ return d?.handoverDate || d?.expectedDeliveryDate || d?.deliveryDate || ''; }
function handoverProgress(d){
  const h=d?.handover||{};
  const total=HANDOVER_STEPS.length;
  const done=HANDOVER_STEPS.filter(([k])=>h[k]==='done'||h[k]==='na').length;
  return {done,total,pct:Math.round(done/total*100)};
}
function handoverReady(d){
  return HANDOVER_STEPS.every(([k])=>d?.handover?.[k]==='done'||d?.handover?.[k]==='na');
}
function handoverItemsForDate(dateKey){
  return deals.filter(d=>d.stage!=='lost'&&getHandoverDate(d)===dateKey).sort((a,b)=>(a.handoverTime||'99:99').localeCompare(b.handoverTime||'99:99'));
}
function calendarItemsForDate(dateKey){
  const items=calendarEvents.filter(e=>e.date===dateKey).map(e=>({kind:'event',...e}));
  handoverItemsForDate(dateKey).forEach(d=>items.push({kind:'handover',id:'handover_'+d.id,dealId:d.id,date:dateKey,time:d.handoverTime||'',title:'Handover · '+(d.customer||'Unnamed'),notes:d.vehicle||''}));
  return items.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
}
function calendarEventLabel(e){ return e.kind==='handover'?'Handover':(CALENDAR_TYPE_LABELS[e.type]||'Calendar'); }
function renderHubHandover(d){
  const p=handoverProgress(d),date=getHandoverDate(d),ready=handoverReady(d);
  const outstanding=HANDOVER_STEPS.filter(([k])=>!['done','na'].includes(d.handover?.[k])).map(([,label])=>label);
  return '<div class="hub-handover"><div class="hub-handover-head"><div><strong>'+esc(d.customer||'Unnamed')+'</strong><span>'+esc(d.vehicle||'Vehicle')+'</span></div><div class="hub-date">'+(d.handoverTime?esc(d.handoverTime)+' · ':'')+esc(dateLabel(date))+'</div></div>'+
    '<div class="progress"><div class="fill '+(ready?'green':'blue')+'" style="width:'+p.pct+'%"></div></div>'+
    '<div class="hub-check-row"><span>'+p.done+'/'+p.total+' ready</span><span class="'+(ready?'good-text':'warn-text')+'">'+(ready?'READY':'Needs '+esc(outstanding.slice(0,2).join(', ')+(outstanding.length>2?'…':'')))+'</span></div>'+
    '<div class="hub-actions"><button class="btn sm" onclick="openDealModal(\''+esc(d.id)+'\')">Open deal</button></div></div>';
}
function renderDashboard(){
  const key=currentMonthKey(),s=monthStats(key);
  const attention=deals.filter(d=>dealRisk(d).length).sort((a,b)=>(a.deliveryDate||'').localeCompare(b.deliveryDate||'')).slice(0,8);
  const todayHandovers=handoverItemsForDate(todayKey());
  const upcoming=deals.filter(d=>d.stage!=='lost'&&getHandoverDate(d)&&getHandoverDate(d)>=todayKey()&&getHandoverDate(d)<=addDaysKey(todayKey(),7)).sort((a,b)=>(getHandoverDate(a)+a.handoverTime).localeCompare(getHandoverDate(b)+b.handoverTime));
  const openTasks=tasks.filter(t=>!t.done),overdue=openTasks.filter(t=>t.due&&t.due<todayKey()),todayTasks=openTasks.filter(t=>t.due===todayKey());
  const readiness=upcoming.filter(d=>!handoverReady(d));
  document.getElementById('dashHandoversToday').textContent=todayHandovers.length;
  document.getElementById('dashHandoversSub').textContent=todayHandovers.length?(todayHandovers.filter(h=>handoverReady(h)).length+' ready · '+todayHandovers.filter(h=>!handoverReady(h)).length+' need prep'):'No handovers scheduled today';
  document.getElementById('dashNextHandovers').textContent=String(upcoming.length);
  document.getElementById('dashNextHandoversSub').textContent=upcoming.length?'Next 7 days':'Nothing scheduled';
  document.getElementById('dashReadiness').textContent=readiness.length;
  document.getElementById('dashReadinessSub').textContent=readiness.length?'Need checklist updates':'All scheduled handovers ready';
  document.getElementById('dashWork').textContent=String(openTasks.length);
  document.getElementById('dashWorkSub').textContent=overdue.length?overdue.length+' overdue · '+todayTasks.length+' today':'Open customer tasks';
  document.getElementById('dashTodayHandovers').innerHTML=todayHandovers.length?todayHandovers.map(renderHubHandover).join(''):'<div class="empty">No handovers scheduled today.</div>';
  document.getElementById('dashUpcomingHandovers').innerHTML=upcoming.length?upcoming.slice(0,8).map(renderHubHandover).join(''):'<div class="empty">No upcoming handovers in the next 7 days.</div>';
  document.getElementById('dashTodayWork').innerHTML=(overdue.concat(todayTasks)).slice(0,8).map(taskHtml).join('')||'<div class="empty">No urgent work.</div>';
  document.getElementById('dashHubAlerts').innerHTML=readiness.length?readiness.slice(0,8).map(d=>'<div class="statline"><span>'+esc(d.customer||'Unnamed')+' · '+esc(d.vehicle||'Vehicle')+'</span><button class="btn sm" onclick="openDealModal(\''+esc(d.id)+'\')">Checklist</button></div>').join(''):'<div class="empty">No handover readiness alerts.</div>';
  document.getElementById('dashAttention').innerHTML=attention.length?attention.map(d=>`<div class="task"><div class="task-main"><div class="task-title">${esc(d.customer||'Unnamed')} · ${esc(d.vehicle||'Vehicle')}</div><div class="task-meta">${STAGE_LABELS[d.stage]||d.stage} · ${esc(dealRisk(d)[0])}</div></div><button class="btn sm" onclick="openDealModal('${d.id}')">Open</button></div>`).join(''):'<div class="empty">No commission or deal-risk flags.</div>';
  const target=monthTarget(key);
  document.getElementById('dashBreakdown').innerHTML=[
    ['Orders logged',deals.filter(d=>monthKey(d.orderDate)===key).length],
    ['Delivered',s.units],['New Retail',s.newUnits],['Motability',s.motab],['Used',s.used],['Commission adjustments',money(s.adjustments)]
  ].map(x=>`<div class="statline"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join('')+(target===null?'':`<div class="statline"><span>Monthly unit target</span><strong>${target}</strong></div>`);
  const nextKey=payMonthForCurrent(), prev=monthStats(currentMonthKey());
  document.getElementById('dashFlow').innerHTML=[
    `<div class="statline"><span>${monthLabel(key)} earned</span><strong>${money(prev.earned)}</strong></div>`,
    `<div class="statline"><span>${monthLabel(nextKey)} expected from this month's earned commission</span><strong>${money(monthStats(nextKey).expected)}</strong></div>`,
    `<div class="statline"><span>${monthLabel(nextKey)} actually recorded paid</span><strong>${money(monthStats(nextKey).paid)}</strong></div>`
  ].join('');
}

function renderDealHandoverChecklist(){
  const wrap=document.getElementById('dealHandoverChecklist');if(!wrap)return;
  if(!openDealId){wrap.innerHTML='<div class="note">Save the deal first, then manage its handover checklist.</div>';return;}
  const d=deals.find(x=>x.id===openDealId);if(!d)return;
  wrap.innerHTML=HANDOVER_STEPS.map(([key,label])=>{
    const value=d.handover?.[key]||'not-set';
    return '<div class="handover-step"><div><strong>'+esc(label)+'</strong><span>'+((value==='done'||value==='na')?'Ready for handover':'Action required')+'</span></div><select onchange="updateHandoverStep(\''+esc(d.id)+'\',\''+key+'\',this.value)">'+Object.entries(HANDOVER_STATUS_LABELS).map(([v,l])=>'<option value="'+v+'" '+(value===v?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select></div>';
  }).join('');
  const p=handoverProgress(d);
  document.getElementById('handoverProgressText').textContent=p.done+'/'+p.total+' complete';
  document.getElementById('handoverProgressBar').style.width=p.pct+'%';
}
function updateHandoverStep(dealId,key,value){
  const d=deals.find(x=>x.id===dealId);if(!d)return;
  d.handover=d.handover||{};d.handover[key]=value;
  persist();renderDealHandoverChecklist();renderDashboard();cloudSave();
}

function calendarOpenEvent(item){
  if(item.kind==='handover')openDealModal(item.dealId);else openCalendarModal(item.id);
}
function renderCalendar(){
  const wrap=document.getElementById('calendarCanvas');if(!wrap)return;
  document.querySelectorAll('[data-cal-view]').forEach(b=>b.classList.toggle('active',b.dataset.calView===calendarView));
  if(calendarView==='day'){
    const dateKey=calendarCursor.getFullYear()+'-'+String(calendarCursor.getMonth()+1).padStart(2,'0')+'-'+String(calendarCursor.getDate()).padStart(2,'0');
    document.getElementById('calendarRangeLabel').textContent=dateLabel(dateKey);
    const items=calendarItemsForDate(dateKey);
    wrap.innerHTML='<div class="calendar-day">'+(items.length?items.map(calendarItemHtml).join(''):'<div class="empty">Nothing scheduled.</div>')+'</div>';
    return;
  }
  if(calendarView==='week'){
    const start=startOfWeekKey(calendarCursor.getFullYear()+'-'+String(calendarCursor.getMonth()+1).padStart(2,'0')+'-'+String(calendarCursor.getDate()).padStart(2,'0'));
    const end=addDaysKey(start,6);
    document.getElementById('calendarRangeLabel').textContent=dateLabel(start)+' → '+dateLabel(end);
    wrap.innerHTML='<div class="calendar-week">'+Array.from({length:7},(_,i)=>{const k=addDaysKey(start,i),items=calendarItemsForDate(k);return '<div class="calendar-col '+(k===todayKey()?'today-col':'')+'"><div class="calendar-col-head"><strong>'+parseDate(k).toLocaleDateString('en-GB',{weekday:'short'})+'</strong><span>'+parseDate(k).getDate()+'</span></div><div class="calendar-items">'+(items.length?items.map(calendarItemHtml).join(''):'<div class="calendar-none">—</div>')+'</div></div>';}).join('')+'</div>';
    return;
  }
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(),first=new Date(y,m,1,12),firstKey=y+'-'+String(m+1).padStart(2,'0')+'-01',start=startOfWeekKey(firstKey),total=Math.ceil((first.getDay()===0?6:first.getDay()-1+daysInMonth(y,m))/7)*7;
  document.getElementById('calendarRangeLabel').textContent=new Date(y,m,1).toLocaleString('en-GB',{month:'long',year:'numeric'});
  wrap.innerHTML='<div class="calendar-month"><div class="calendar-month-head">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<div>'+x+'</div>').join('')+'</div><div class="calendar-month-grid">'+Array.from({length:total},(_,i)=>{const k=addDaysKey(start,i),d=parseDate(k),inMonth=d.getMonth()===m,items=calendarItemsForDate(k);return '<div class="calendar-cell '+(inMonth?'':'outside')+' '+(k===todayKey()?'today-cell':'')+'"><div class="calendar-cell-date">'+d.getDate()+'</div><div>'+(items.slice(0,4).map(calendarItemHtml).join('')||'')+'</div></div>';}).join('')+'</div></div>';
}
function calendarItemHtml(item){
  const cls=item.kind==='handover'?'handover-item':'calendar-item';
  return '<button type="button" class="'+cls+'" onclick="calendarOpenEvent(this.dataset)" data-kind="'+esc(item.kind||'event')+'" data-id="'+esc(item.id)+'" data-deal-id="'+esc(item.dealId||'')+'"><span>'+(item.time?esc(item.time)+' ':'')+esc(item.title)+'</span><small>'+esc(calendarEventLabel(item))+'</small></button>';
}
function calendarPrev(){
  if(calendarView==='day')calendarCursor.setDate(calendarCursor.getDate()-1);
  else if(calendarView==='week')calendarCursor.setDate(calendarCursor.getDate()-7);
  else calendarCursor.setMonth(calendarCursor.getMonth()-1);
  renderCalendar();
}
function calendarNext(){
  if(calendarView==='day')calendarCursor.setDate(calendarCursor.getDate()+1);
  else if(calendarView==='week')calendarCursor.setDate(calendarCursor.getDate()+7);
  else calendarCursor.setMonth(calendarCursor.getMonth()+1);
  renderCalendar();
}
function calendarToday(){calendarCursor=new Date();renderCalendar();}
function setCalendarView(v){calendarView=v;renderCalendar();}
function openCalendarModal(id=''){
  const e=id?calendarEvents.find(x=>x.id===id):null;if(id&&!e)return;
  calendarEditId=id||'';
  const modal=document.getElementById('calendarModal');modal.classList.add('show');
  document.getElementById('calendarModalTitle').textContent=e?'Edit calendar item':'New calendar item';
  document.getElementById('calendarDeleteBtn').style.display=e?'inline-flex':'none';
  document.getElementById('cTitle').value=e?.title||'';
  document.getElementById('cDate').value=e?.date||todayKey();
  document.getElementById('cStart').value=e?.time||'';
  document.getElementById('cEnd').value=e?.endTime||'';
  document.getElementById('cType').value=e?.type||'appointment';
  document.getElementById('cDeal').innerHTML='<option value="">No linked deal</option>'+deals.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.customer||'Unnamed')+' · '+esc(d.vehicle||'Vehicle')+'</option>').join('');
  document.getElementById('cDeal').value=e?.dealId||'';
  document.getElementById('cNotes').value=e?.notes||'';
}
function closeCalendarModal(){document.getElementById('calendarModal').classList.remove('show');calendarEditId='';}
function saveCalendarEvent(e){
  e.preventDefault();
  const id=calendarEditId||uid('cal'),old=calendarEvents.find(x=>x.id===id);
  const obj={id,title:document.getElementById('cTitle').value.trim(),date:document.getElementById('cDate').value,time:document.getElementById('cStart').value,endTime:document.getElementById('cEnd').value,type:document.getElementById('cType').value,dealId:document.getElementById('cDeal').value,notes:document.getElementById('cNotes').value.trim()};
  if(!obj.title||!obj.date){alert('Enter a title and date.');return;}
  if(old){const i=calendarEvents.findIndex(x=>x.id===id);calendarEvents[i]=obj;}else calendarEvents.push(obj);
  persist();closeCalendarModal();refreshAll();cloudSave();
}
function deleteCalendarEvent(id){
  const e=calendarEvents.find(x=>x.id===id);if(!e)return;
  if(!confirm('Delete this calendar item?'))return;
  calendarEvents=calendarEvents.filter(x=>x.id!==id);persist();closeCalendarModal();refreshAll();cloudSave();
}

function taskDueClass(t){
  if(t.done)return 'done';
  if(!t.due)return '';
  if(t.due<todayKey())return 'overdue';
  if(t.due===todayKey())return 'today';
  return 'upcoming';
}
function taskHtml(t){
  const d=deals.find(x=>x.id===t.dealId);
  return `<div class="task ${t.done?'done':''}">
    <input type="checkbox" aria-label="${t.done?'Mark task open':'Mark task done'}" ${t.done?'checked':''} onchange="toggleTask('${t.id}')">
    <div class="task-main"><div class="task-title">${esc(t.title)}</div>
    <div class="task-meta">${esc(t.type||'Other')} · ${d?esc(d.customer):'No linked deal'} · ${t.due?dateLabel(t.due):'No due date'} ${t.priority==='high'?'· HIGH':''}</div>
    ${t.notes?`<div class="task-meta">${esc(t.notes)}</div>`:''}</div>
    <div class="task-actions"><button class="btn sm" type="button" onclick="openTaskForEdit('${t.id}')">Edit</button><button class="btn sm danger" type="button" onclick="deleteTask('${t.id}')">Delete</button></div>
  </div>`;
}
function renderWork(){
  const open=tasks.filter(t=>!t.done).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  const overdue=open.filter(t=>t.due&&t.due<todayKey()),today=open.filter(t=>t.due===todayKey()),upcoming=open.filter(t=>t.due&&t.due>todayKey());
  const noDue=open.filter(t=>!t.due);
  document.getElementById('workOverdue').innerHTML=overdue.length?overdue.map(taskHtml).join(''):'<div class="empty">Nothing overdue.</div>';
  document.getElementById('workToday').innerHTML=today.length?today.map(taskHtml).join(''):'<div class="empty">Nothing due today.</div>';
  document.getElementById('workUpcoming').innerHTML=(upcoming.length?upcoming:[]).slice(0,10).map(taskHtml).join('')+(noDue.length?`<div style="margin-top:8px"><div class="note">No due date</div>${noDue.slice(0,5).map(taskHtml).join('')}</div>`:'');
  document.getElementById('workAll').innerHTML=open.length?open.map(taskHtml).join(''):'<div class="empty">No open customer work.</div>';
}
function openTaskModal(id=''){
  const t=id?tasks.find(x=>x.id===id):null;
  if(id&&!t)return;
  const el=document.getElementById('taskModal');
  el.classList.add('show');
  document.getElementById('taskModalTitle').textContent=t?'Edit work item':'New work item';
  document.getElementById('taskSubmit').textContent=t?'Save task':'Add task';
  document.getElementById('taskDeleteBtn').style.display=t?'inline-flex':'none';
  document.getElementById('tDeal').innerHTML='<option value="">No linked deal</option>'+deals.map(d=>`<option value="${esc(d.id)}">${esc(d.customer||'Unnamed')} · ${esc(d.vehicle||'Vehicle')}</option>`).join('');
  document.getElementById('tDeal').value=t?.dealId||'';
  document.getElementById('tTitle').value=t?.title||'';
  document.getElementById('tDue').value=t?.due||todayKey();
  document.getElementById('tType').value=t?.type||'Call';
  document.getElementById('tPriority').value=t?.priority||'normal';
  document.getElementById('tNotes').value=t?.notes||'';
  el.dataset.editId=id;
  requestAnimationFrame(()=>document.getElementById('tTitle').focus());
}
function closeTaskModal(){document.getElementById('taskModal').classList.remove('show')}
function openTaskForEdit(id){openTaskModal(id)}
function deleteTask(id){
  const t=tasks.find(x=>x.id===id);if(!t)return;
  if(!confirm('Delete this work item?'))return;
  tasks=tasks.filter(x=>x.id!==id);
  persist();refreshAll();cloudSave();
}
function saveTask(e){
  e.preventDefault();
  const id=document.getElementById('taskModal').dataset.editId||'';
  const existing=tasks.find(x=>x.id===id);
  const obj={id:id||uid('task'),dealId:document.getElementById('tDeal').value,title:document.getElementById('tTitle').value.trim(),due:document.getElementById('tDue').value,type:document.getElementById('tType').value,priority:document.getElementById('tPriority').value,notes:document.getElementById('tNotes').value.trim(),done:existing?!!existing.done:false,completedDate:existing?.completedDate||''};
  const i=tasks.findIndex(x=>x.id===id); if(i>=0)tasks[i]={...tasks[i],...obj};else tasks.push(obj);
  persist();closeTaskModal();refreshAll();cloudSave();
}
function toggleTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;t.completedDate=t.done?todayKey():'';persist();refreshAll();cloudSave()}

function renderDeals(){
  const q=(document.getElementById('dealSearch').value||'').toLowerCase(),f=document.getElementById('dealFilter').value;
  const rows=deals.filter(d=>(f==='all'||d.stage===f)&&((d.customer+' '+d.vehicle+' '+d.stock).toLowerCase().includes(q))).sort((a,b)=>(b.orderDate||b.leadDate||'').localeCompare(a.orderDate||a.leadDate||''));
  const body=document.getElementById('dealsBody');
  const mobile=document.getElementById('dealsMobile');
  document.getElementById('noDeals').style.display=rows.length?'none':'block';

  body.innerHTML=rows.map(d=>{
    const ev=eventDefs(d),earned=ev.reduce((s,e)=>s+eligibleEvent(d,e),0),expected=ev.reduce((s,e)=>s+(e.payMonth===payMonthForCurrent()?Math.max(0,eligibleEvent(d,e)-eventPaid(d,e)):0),0);
    const next=tasks.filter(t=>t.dealId===d.id&&!t.done).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'))[0];
    const cls=d.stage==='delivered'?'b-green':d.stage==='lost'?'b-red':d.stage==='awaiting-delivery'?'b-yellow':'b-blue';
    return `<tr>
      <td><strong>${esc(d.customer||'Unnamed')}</strong><div class="small">${esc(d.phone||d.email||'')}</div></td>
      <td>${esc(d.vehicle||'—')}<div class="small">${esc(d.stock||'')}</div></td>
      <td><span class="badge ${cls}">${esc(STAGE_LABELS[d.stage]||d.stage)}</span></td>
      <td>${dateLabel(d.orderDate)}</td><td>${dateLabel(d.deliveryDate)}</td>
      <td>${next?`<strong>${esc(next.title)}</strong><div class="small">${dateLabel(next.due)}</div>`:'<span class="muted">—</span>'}</td>
      <td><strong>${money(earned)}</strong></td><td>${money(expected)}</td>
      <td><button class="btn sm" onclick="openDealModal('${d.id}')">Open</button></td>
    </tr>`;
  }).join('');

  mobile.innerHTML=rows.map(d=>{
    const ev=eventDefs(d);
    const earned=ev.reduce((s,e)=>s+eligibleEvent(d,e),0);
    const expected=ev.reduce((s,e)=>s+(e.payMonth===payMonthForCurrent()?Math.max(0,eligibleEvent(d,e)-eventPaid(d,e)):0),0);
    const next=tasks.filter(t=>t.dealId===d.id&&!t.done).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'))[0];
    const cls=d.stage==='delivered'?'b-green':d.stage==='lost'?'b-red':d.stage==='awaiting-delivery'?'b-yellow':'b-blue';
    return `<article class="deal-card">
      <div class="deal-card-head">
        <div><div class="deal-card-name">${esc(d.customer||'Unnamed')}</div><div class="small">${esc(d.vehicle||'Vehicle')}${d.stock?' · '+esc(d.stock):''}</div></div>
        <span class="badge ${cls}">${esc(STAGE_LABELS[d.stage]||d.stage)}</span>
      </div>
      <div class="deal-card-grid">
        <div><span>Order</span><strong>${dateLabel(d.orderDate)}</strong></div>
        <div><span>Delivery</span><strong>${dateLabel(d.deliveryDate)}</strong></div>
        <div><span>Earned</span><strong>${money(earned)}</strong></div>
        <div><span>Expected pay</span><strong>${money(expected)}</strong></div>
      </div>
      <div class="deal-card-next">${next?'<span>Next:</span> '+esc(next.title)+' · '+dateLabel(next.due):'<span>No open customer task</span>'}</div>
      <button class="btn primary deal-open" onclick="openDealModal('${d.id}')">Open deal</button>
    </article>`;
  }).join('');
}
function buildFiChecks(selected=[]){
  const type=document.getElementById('fType').value,products=SCHEME.fi[type]||{};
  document.getElementById('fiChecks').innerHTML=Object.keys(products).map(k=>`<label class="check"><input type="checkbox" name="fi" value="${esc(k)}" ${selected.includes(k)?'checked':''}> ${esc(FI_LABELS[k])} +${money(products[k])}</label>`).join('');
}
function renderDealEventsInModal(){
  if(!openDealId){document.getElementById('dealEvents').innerHTML='<div class="note">Save the deal first, then commission events and payment tracking appear here.</div>';return;}
  const d=deals.find(x=>x.id===openDealId);if(!d)return;
  const events=eventDefs(d);
  const wrap=document.getElementById('dealEvents');
  if(!events.length){wrap.innerHTML='<div class="empty">No commission event can be calculated from the information recorded yet.</div>';return;}
  wrap.innerHTML=events.map(e=>{
    const eligible=eligibleEvent(d,e),p=paymentFor(d,e.id),remaining=Math.max(0,eligible-eventPaid(d,e));
    let status='Potential';
    if(eligible)status=remaining>0?'Eligible / awaiting payment':'Paid / recorded';
    if(d.csi!==null&&d.csi<8)status='At risk — CSI';
    if(e.kind==='fi'&&!e.eligibleDate)status='Sold / waiting qualification';
    const payButton=remaining>0
      ? '<button class="btn sm" data-pay-deal="'+esc(d.id)+'" data-pay-event="'+esc(e.id)+'">Record payment</button>'
      : '';
    return '<div class="event"><div class="eventline"><div class="eventtitle">'+esc(e.label)+'</div><strong>'+money(e.amount)+'</strong></div>'+
      '<div class="eventmeta">Eligible: '+dateLabel(e.eligibleDate)+' · Expected pay: '+(e.payMonth?monthLabel(e.payMonth):'Not yet known')+' · '+esc(e.requires)+'</div>'+
      '<div class="toolbar" style="margin-top:6px"><span class="badge '+(remaining>0&&eligible?'b-yellow':eligible?'b-green':'b-gray')+'">'+esc(status)+'</span>'+
      '<span class="small">Paid '+money(p.amount||0)+' '+(p.date?'on '+dateLabel(p.date):'')+'</span>'+payButton+'</div>'+
      (p.note?'<div class="small" style="margin-top:4px">'+esc(p.note)+'</div>':'')+
      '</div>';
  }).join('');
  wrap.querySelectorAll('[data-pay-deal]').forEach(btn=>{
    btn.addEventListener('click',()=>openPaymentModal(btn.dataset.payDeal,btn.dataset.payEvent));
  });
}
function renderDealDiary(){
  if(!openDealId)return;const d=deals.find(x=>x.id===openDealId);if(!d)return;
  document.getElementById('dealDiary').innerHTML=d.journal.length?[...d.journal].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>`<div class="entry"><div class="d">${dateLabel(e.date)}</div><div class="t">${esc(e.text)}</div></div>`).join(''):'<div class="empty">No diary entries yet.</div>';
}
function renderDealTasks(){
  if(!openDealId)return;const rows=tasks.filter(t=>t.dealId===openDealId).sort((a,b)=>(a.done-b.done)||(a.due||'9999').localeCompare(b.due||'9999'));
  document.getElementById('dealTasks').innerHTML=rows.length?rows.map(taskHtml).join(''):'<div class="empty">No work items for this customer.</div>';
}
function openDealModal(id=''){
  const existing=id?deals.find(x=>x.id===id):null;
  if(id&&!existing)return;
  openDealId=id||'';
  const el=document.getElementById('dealModal');el.classList.add('show');
  document.getElementById('dealModalTitle').textContent=id?'Edit deal':'Add deal';
  document.getElementById('deleteDealBtn').style.display=id?'inline-flex':'none';
  document.getElementById('editId').value=id;
  document.getElementById('quickTaskDue').value=todayKey();
  document.getElementById('adjDate').value=todayKey();
  if(!id){
    ['fCustomer','fPhone','fEmail','fVehicle','fStock','fPx','fNextAction','fDiary'].forEach(x=>document.getElementById(x).value='');
    document.getElementById('fLeadDate').value=todayKey();document.getElementById('fOrderDate').value='';document.getElementById('fExpectedDelivery').value='';document.getElementById('fHandoverDate').value='';document.getElementById('fHandoverTime').value='';document.getElementById('fDeliveryDate').value='';document.getElementById('fFinancePayout').value='';document.getElementById('fCSI').value='';document.getElementById('fStage').value='lead';document.getElementById('fType').value='new-retail';buildFiChecks([]);renderDealHandoverChecklist();document.getElementById('dealEvents').innerHTML='<div class="note">Save the deal first, then commission events and payment tracking appear here.</div>';document.getElementById('dealDiary').innerHTML='<div class="empty">Save the deal and start the diary.</div>';document.getElementById('dealTasks').innerHTML='<div class="empty">Save the deal before adding linked work.</div>';document.getElementById('dealAdjustments').innerHTML='<div class="note">Save the deal first.</div>';return;
  }
  const d=deals.find(x=>x.id===id);if(!d)return;
  document.getElementById('fCustomer').value=d.customer;document.getElementById('fPhone').value=d.phone||'';document.getElementById('fEmail').value=d.email||'';document.getElementById('fVehicle').value=d.vehicle||'';document.getElementById('fStock').value=d.stock||'';
  document.getElementById('fType').value=d.type;document.getElementById('fStage').value=d.stage;document.getElementById('fLeadDate').value=d.leadDate||'';document.getElementById('fOrderDate').value=d.orderDate||'';document.getElementById('fExpectedDelivery').value=d.expectedDeliveryDate||'';document.getElementById('fHandoverDate').value=d.handoverDate||'';document.getElementById('fHandoverTime').value=d.handoverTime||'';document.getElementById('fDeliveryDate').value=d.deliveryDate||'';document.getElementById('fFinancePayout').value=d.financePayoutDate||'';document.getElementById('fCSI').value=d.csi??'';document.getElementById('fPx').value=d.px||'';document.getElementById('fNextAction').value=d.nextAction||'';
  buildFiChecks(d.fi||[]);renderDealEventsInModal();renderDealDiary();renderDealTasks();renderDealAdjustments();renderDealHandoverChecklist();
}
function closeDealModal(){document.getElementById('dealModal').classList.remove('show');openDealId=null}
function saveDeal(e){
  e.preventDefault();
  const id=document.getElementById('editId').value||uid('deal');
  const fi=[...document.querySelectorAll('input[name="fi"]:checked')].map(x=>x.value);
  const old=deals.find(d=>d.id===id);
  const d={
    id,customer:document.getElementById('fCustomer').value.trim(),phone:document.getElementById('fPhone').value.trim(),email:document.getElementById('fEmail').value.trim(),
    vehicle:document.getElementById('fVehicle').value.trim(),stock:document.getElementById('fStock').value.trim(),type:document.getElementById('fType').value,stage:document.getElementById('fStage').value,
    leadDate:document.getElementById('fLeadDate').value,orderDate:document.getElementById('fOrderDate').value,expectedDeliveryDate:document.getElementById('fExpectedDelivery').value,deliveryDate:document.getElementById('fDeliveryDate').value,financePayoutDate:document.getElementById('fFinancePayout').value,
    fi,csi:document.getElementById('fCSI').value===''?null:Number(document.getElementById('fCSI').value),px:document.getElementById('fPx').value.trim(),nextAction:document.getElementById('fNextAction').value.trim(),
    journal:old?.journal||[],adjustments:old?.adjustments||[],payments:old?.payments||{}
  };
  if(!old && d.leadDate)d.journal.push({id:uid('note'),date:d.leadDate,text:'Deal created.'});
  const i=deals.findIndex(x=>x.id===id);if(i>=0)deals[i]=d;else deals.push(d);
  persist();openDealId=id;refreshAll();openDealModal(id);cloudSave();
}
function addDiaryEntry(){
  if(!openDealId)return;
  const d=deals.find(x=>x.id===openDealId),text=document.getElementById('fDiary').value.trim();if(!d||!text)return;
  d.journal=d.journal||[];d.journal.push({id:uid('note'),date:todayKey(),text});document.getElementById('fDiary').value='';persist();renderDealDiary();cloudSave();
}
function addQuickTask(){
  if(!openDealId)return;
  const title=document.getElementById('quickTaskTitle').value.trim();if(!title)return;
  tasks.push({id:uid('task'),dealId:openDealId,title,due:document.getElementById('quickTaskDue').value,type:document.getElementById('quickTaskType').value,priority:'normal',notes:'',done:false});
  document.getElementById('quickTaskTitle').value='';persist();renderDealTasks();renderWork();cloudSave();
}
function renderDealAdjustments(){
  if(!openDealId)return;const d=deals.find(x=>x.id===openDealId);if(!d)return;
  const rows=d.adjustments||[];
  document.getElementById('dealAdjustments').innerHTML=rows.length?rows.map((a,i)=>`<div class="statline"><span>${dateLabel(a.date)} · ${esc(a.reason||'Adjustment')}</span><strong>${money2(a.amount)}</strong><button class="btn sm danger" type="button" onclick="removeDealAdjustment(${i})">Remove</button></div>`).join(''):'<div class="note">No manual adjustments recorded.</div>';
}
function addDealAdjustment(){
  if(!openDealId)return;const d=deals.find(x=>x.id===openDealId);if(!d)return;
  const amount=Number(document.getElementById('adjAmount').value),date=document.getElementById('adjDate').value,reason=document.getElementById('adjReason').value.trim();
  if(!Number.isFinite(amount)||!date||!reason){alert('Enter amount, date and reason.');return}
  d.adjustments=d.adjustments||[];d.adjustments.push({amount,date,reason});
  document.getElementById('adjAmount').value='';document.getElementById('adjDate').value=todayKey();document.getElementById('adjReason').value='';
  persist();renderDealAdjustments();refreshAll();cloudSave();
}
function removeDealAdjustment(index){
  if(!openDealId)return;const d=deals.find(x=>x.id===openDealId);if(!d)return;
  if(!confirm('Remove this adjustment?'))return;d.adjustments.splice(index,1);persist();renderDealAdjustments();refreshAll();cloudSave();
}
function deleteDeal(id){
  const d=deals.find(x=>x.id===id);if(!d)return;
  if(!confirm('Delete this deal and all linked work? This also syncs the deletion to your cloud account.'))return;
  deals=deals.filter(x=>x.id!==id);tasks=tasks.filter(t=>t.dealId!==id);
  if(openDealId===id)closeDealModal();
  persist();refreshAll();cloudSave();
}

function populateCommissionMonths(){
  const keys=annualMonths();const select=document.getElementById('commMonth');const old=select.value||currentMonthKey();
  select.innerHTML=keys.map(k=>`<option value="${k}">${esc(monthLabel(k))}</option>`).join('');
  select.value=keys.includes(old)?old:currentMonthKey();
}
function commissionEventRowsForMonth(key){
  const rows=[];
  deals.forEach(d=>eventDefs(d).forEach(e=>{
    const eligible=eligibleEvent(d,e),paid=eventPaid(d,e),p=paymentFor(d,e);
    if(monthKey(e.eligibleDate)===key && eligible)rows.push({d,e,mode:'earned',amount:eligible,paid});
    if(e.payMonth===key){
      const remaining=Math.max(0,eligible-paid);if(remaining>0)rows.push({d,e,mode:'expected',amount:remaining,paid});
    }
    if(p.date && monthKey(p.date)===key && paid)rows.push({d,e,mode:'paid',amount:paid,paid});
  }));
  return rows;
}
function renderCommission(){
  populateCommissionMonths();
  const key=document.getElementById('commMonth').value||currentMonthKey(),s=monthStats(key),target=commissionTarget();
  document.getElementById('commEarned').textContent=money(s.earned);document.getElementById('commExpected').textContent=money(s.expected);document.getElementById('commPaid').textContent=money(s.paid);document.getElementById('commOutstanding').textContent=money(Math.max(0,s.expected-s.paid));
  const boxes=annualMonths().map(k=>{
    const x=monthStats(k),t=monthTarget(k),na=monthNA(k);
    const status=na?'N/A':t===null?'Target not set':x.units>=t?'Target met':(t-x.units)+' to target';
    const badgeClass=na?'b-gray':status==='Target met'?'b-green':status==='Target not set'?'b-gray':'b-yellow';
    return '<div class="monthbox '+(na?'na':'')+'"><h3>'+esc(shortMonth(k))+' <span class="small">'+k+'</span></h3>'+
      '<div class="n">'+money(x.earned)+'</div>'+
      '<div class="l">adjusted earned · '+x.units+' delivered</div>'+
      '<div class="l" style="margin-top:3px">gross before scheme reduction: '+money(x.grossEarned)+'</div>'+
      '<div class="l" style="margin-top:4px"><span class="badge '+badgeClass+'">'+esc(status)+'</span></div>'+
      (na||t!==null?'':'<button class="btn sm" style="margin-top:7px" onclick="openTargetSettings(\''+k+'\')">Set target</button>')+
      '<button class="btn sm" style="margin-top:7px;margin-left:5px" onclick="toggleMonthNA(\''+k+'\')">'+(na?'Mark active':'Set N/A')+'</button></div>';
  }).join('');
  document.getElementById('commissionMonths').innerHTML=boxes;
  const rows=commissionEventRowsForMonth(key);
  document.getElementById('commEvents').innerHTML=rows.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Customer</th><th>Event</th><th>Amount</th><th>Mode</th><th>Eligible</th><th>Expected pay</th><th>Paid</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.d.customer)}</td><td>${esc(r.e.label)}</td><td><strong>${money(r.amount)}</strong></td><td><span class="badge ${r.mode==='paid'?'b-green':r.mode==='expected'?'b-blue':'b-gray'}">${r.mode}</span></td><td>${dateLabel(r.e.eligibleDate)}</td><td>${r.e.payMonth?monthLabel(r.e.payMonth):'—'}</td><td>${r.paid?money(r.paid):'—'}</td><td>${r.mode==='expected'?'<button class="btn sm" onclick="openPaymentModal(\''+r.d.id+'\',\''+r.e.id+'\')">Record payment</button>':'<button class="btn sm" onclick="openDealModal(\''+r.d.id+'\')">Open deal</button>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No eligible/expected/paid commission events recorded for this month.</div>';
  const adj=[];
  deals.forEach(d=>{
    dealRisk(d).forEach(reason=>adj.push(`<div class="task"><div class="task-main"><div class="task-title">${esc(d.customer||'Unnamed')} · ${esc(reason)}</div><div class="task-meta"><button class="btn sm" onclick="openDealModal('${d.id}')">Open deal</button></div></div></div>`));
    (d.adjustments||[]).filter(a=>monthKey(a.date)===key).forEach(a=>adj.push(`<div class="task"><div class="task-main"><div class="task-title">${esc(d.customer||'Unnamed')} · adjustment ${money(a.amount)}</div><div class="task-meta">${dateLabel(a.date)} · ${esc(a.reason||'')}</div></div></div>`));
  });
  const t=monthTarget(key);if(!monthNA(key)&&t!==null){
    const newDel=s.newUnits+s.motab;
    if(newDel<t)adj.push(`<div class="task"><div class="task-main"><div class="task-title">20% new-vehicle monthly reduction applies</div><div class="task-meta">${newDel} new-vehicle deliveries vs target ${t}. Current earned commission shown above is before the scheme reduction.</div></div></div>`);
  }
  const reductionNote=s.schemeReduction?'<div class="note" style="margin-top:7px">A '+money(s.schemeReduction)+' 20% new-vehicle target reduction is applied to '+esc(monthLabel(key))+'. Gross commission before the reduction is shown in the month card.</div>':'';
  document.getElementById('commAdjustments').innerHTML=(adj.length?adj.join(''):'<div class="empty">No current commission-risk or adjustment flags.</div>')+reductionNote;
}

function renderPerformance(){
  const ds=annualEligibleDeals(),units=ds.length;
  const totalComm=ds.reduce((sum,d)=>sum+eventDefs(d).reduce((x,e)=>{
    return x+(e.eligibleDate&&e.eligibleDate>=ANNUAL_START&&e.eligibleDate<=ANNUAL_END?eligibleEvent(d,e):0);
  },0),0);
  const bonus=units>=240?4000:units>=200?2000:units>=160?1000:0;
  document.getElementById('perfAnnualUnits').textContent=units+' / '+ANNUAL_TARGET;document.getElementById('perfAnnualBar').style.width=Math.min(100,units/ANNUAL_TARGET*100)+'%';
  document.getElementById('perfPace').textContent=(ANNUAL_TARGET/12).toFixed(1);
  document.getElementById('perfBonus').textContent=money(bonus);
  document.getElementById('perfAvgComm').textContent=units?money(totalComm/units):'—';
  document.getElementById('performanceBody').innerHTML=annualMonths().map(k=>{
    const s=monthStats(k),t=monthTarget(k),na=monthNA(k);
    const status=na?'N/A':t===null?'Not set':s.units>=t?'Met':'Below';
    const badgeClass=na?'b-purple':status==='Met'?'b-green':status==='Below'?'b-yellow':'b-gray';
    return '<tr class="'+(na?'na-row':'')+'"><td><strong>'+esc(monthLabel(k))+'</strong></td><td>'+((t===null||na)?'—':t)+'</td><td>'+s.units+'</td><td>'+s.newUnits+'</td><td>'+s.used+'</td><td>'+s.motab+'</td><td>'+money(s.earned)+'</td><td><span class="badge '+badgeClass+'">'+esc(status)+'</span>'+(na||t!==null?'':' <button class="btn sm" onclick="openTargetSettings(\''+k+'\')">Set target</button>')+' <button class="btn sm" style="margin-left:5px" onclick="toggleMonthNA(\''+k+'\')">'+(na?'Mark active':'Set N/A')+'</button></td></tr>';
  }).join('');
  const risk=[];
  deals.forEach(d=>{dealRisk(d).forEach(r=>{risk.push('<div class="statline"><span>'+esc(d.customer||'Unnamed')+' · '+esc(r)+'</span><button class="btn sm" onclick="openDealModal(\''+d.id+'\')">Open</button></div>');});});
  document.getElementById('perfRisk').innerHTML=risk.length?risk.join(''):'<div class="empty">No recorded deal-risk flags.</div>';
}

function openPaymentModal(dealId,eventId){
  const d=deals.find(x=>x.id===dealId),e=eventDefs(d||{}).find(x=>x.id===eventId);if(!d||!e)return;
  paymentContext={dealId,eventId};const p=paymentFor(d,eventId);document.getElementById('paymentContext').innerHTML=`<strong>${esc(d.customer||'Unnamed')}</strong> · ${esc(e.label)} · expected ${money(e.amount)}`;
  document.getElementById('payAmount').value=p.amount||e.amount||'';document.getElementById('payDate').value=p.date||todayKey();document.getElementById('payNote').value=p.note||'';
  document.getElementById('paymentModal').classList.add('show');
}
function closePaymentModal(){document.getElementById('paymentModal').classList.remove('show');paymentContext=null}
function savePayment(){
  if(!paymentContext)return;
  const d=deals.find(x=>x.id===paymentContext.dealId);if(!d)return;
  const amount=Number(document.getElementById('payAmount').value);
  const date=document.getElementById('payDate').value;
  if(!Number.isFinite(amount)||amount<=0){alert('Enter a paid amount greater than £0.');return}
  if(!date){alert('Choose the payment date.');return}
  d.payments=d.payments||{};
  d.payments[paymentContext.eventId]={amount,date,note:document.getElementById('payNote').value.trim()};
  persist();closePaymentModal();refreshAll();if(openDealId)openDealModal(openDealId);cloudSave();
}

function saveMonthTarget(){
  const key=document.getElementById('setTargetMonth').value;if(!key){alert('Choose a month.');return}
  const combined=document.getElementById('setMonthTarget').value===''?null:parseInt(document.getElementById('setMonthTarget').value,10);
  const newTarget=document.getElementById('setNewVehicleTarget').value===''?null:parseInt(document.getElementById('setNewVehicleTarget').value,10);
  if(combined!==null&&(!combined||combined<1)){alert('Enter a valid combined target.');return}
  if(newTarget!==null&&(!newTarget||newTarget<1)){alert('Enter a valid new-vehicle target.');return}
  settings.monthTargets=settings.monthTargets||{};settings.newVehicleTargets=settings.newVehicleTargets||{};settings.naMonths=settings.naMonths||{};
  if(combined===null)delete settings.monthTargets[key];else settings.monthTargets[key]=combined;
  if(newTarget===null)delete settings.newVehicleTargets[key];else settings.newVehicleTargets[key]=newTarget;
  persist();refreshAll();cloudSave();
}
function clearMonthTarget(){
  const key=document.getElementById('setTargetMonth').value;if(!key)return;
  if(settings.monthTargets)delete settings.monthTargets[key];
  if(settings.newVehicleTargets)delete settings.newVehicleTargets[key];
  persist();refreshAll();cloudSave();
}
function saveSettings(){
  settings.basic=Number(document.getElementById('setBasic').value)||20000;
  settings.netTarget=Number(document.getElementById('setNetTarget').value)||3000;
  settings.pension=Number(document.getElementById('setPension').value)||0;
  settings.otherDed=Number(document.getElementById('setOtherDed').value)||0;
  persist();refreshAll();cloudSave();
}
function loadSettingsUI(){
  document.getElementById('setBasic').value=settings.basic??20000;
  document.getElementById('setNetTarget').value=settings.netTarget??3000;
  document.getElementById('setPension').value=settings.pension??0;
  document.getElementById('setOtherDed').value=settings.otherDed??0;
  document.getElementById('setTargetMonth').value=currentMonthKey();
  document.getElementById('setMonthTarget').value=monthTarget(currentMonthKey())||'';
  document.getElementById('setNewVehicleTarget').value=newVehicleTarget(currentMonthKey())||'';
  setTheme(settings.theme||'dark');
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportJSON(){
  const payload={version:10,deals,tasks,calendarEvents,settings,exported:new Date().toISOString()};
  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'my-sales-hq-'+todayKey()+'.json');
}
function exportCSV(){
  const headers=['Customer','Phone','Email','Vehicle','Stock/Reg','Type','Stage','Lead Date','Order / Invoice Date','Expected Delivery','Delivery Date','Finance Payout','F&I','Earned Commission','Expected Next Pay','CSI','Notes'];
  const rows=deals.map(d=>{
    const ev=eventDefs(d),earned=ev.reduce((s,e)=>s+eligibleEvent(d,e),0),expected=ev.reduce((s,e)=>s+(e.payMonth===payMonthForCurrent()?Math.max(0,eligibleEvent(d,e)-eventPaid(d,e)):0),0);
    const note=(d.journal||[]).map(x=>x.text).join(' | ');
    return [d.customer,d.phone,d.email,d.vehicle,d.stock,d.type,STAGE_LABELS[d.stage]||d.stage,d.leadDate,d.orderDate,d.expectedDeliveryDate,d.deliveryDate,d.financePayoutDate,(d.fi||[]).map(k=>FI_LABELS[k]).join('; '),earned,expected,d.csi??'',note].map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',');
  });
  downloadBlob(new Blob([[headers.join(','),...rows].join('\n')],{type:'text/csv'}),'my-sales-hq-deals-'+todayKey()+'.csv');
}
function importData(e){
  const file=e.target.files?.[0];if(!file)return;
  const r=new FileReader();r.onload=ev=>{
    try{
      const x=JSON.parse(ev.target.result);
      if(!Array.isArray(x.deals)||!Array.isArray(x.tasks))throw new Error('Invalid backup shape');
      if((deals.length||tasks.length)&&!confirm('Import this backup and replace the current sales diary on this device? It will also become the cloud copy after sync.'))return;
      deals=x.deals.map(migrateDeal);
      tasks=x.tasks;
      settings={...settings,...(x.settings||{})};
      settings.monthTargets=settings.monthTargets||{};settings.newVehicleTargets=settings.newVehicleTargets||{};settings.naMonths=settings.naMonths||{};
      persist();loadSettingsUI();refreshAll();cloudSave();
      alert('Imported '+deals.length+' deals and '+tasks.length+' work items.');
    }catch(err){alert('Invalid My Sales HQ JSON backup.')}
    finally{e.target.value='';}
  };
  r.readAsText(file);
}
function clearAll(){
  if(!confirm('Delete every deal and work item from My Sales HQ? This also syncs the deletion to your cloud account.'))return;
  deals=[];tasks=[];calendarEvents=[];localStorage.removeItem('ps_deals');localStorage.removeItem('ps_tasks');localStorage.removeItem('ps_calendar');persist();refreshAll();cloudSave();
}

/* Automatic cloud sync: Supabase is the source of truth; localStorage is the offline cache. */
let sb = null;
let sbSession = null;
let cloudSaveTimer = null;
let cloudRefreshTimer = null;
let cloudSyncBusy = false;
let cloudDirty = false;
let localGeneration = Number(localStorage.getItem('ps_local_revision')||0);
const CLOUD_HISTORY_TABLE = 'my_sales_hq_state_history';

function currentCloudData(){
  return {deals:deals.map(x=>cloneData(x)),tasks:tasks.map(x=>cloneData(x)),calendarEvents:calendarEvents.map(x=>cloneData(x)),settings:cloneData(settings)};
}
function cloneData(x){
  if(x===undefined)return undefined;
  if(x===null)return null;
  try{return JSON.parse(JSON.stringify(x));}catch(e){return x;}
}
function deepEqual(a,b){
  return JSON.stringify(a??null)===JSON.stringify(b??null);
}
function isPlainObject(x){
  return x && typeof x==='object' && !Array.isArray(x) && Object.getPrototypeOf(x)===Object.prototype;
}
function normalizeCloudData(payload){
  const base={
    basic:20000,netTarget:3000,pension:0,otherDed:0,theme:'dark',
    monthTargets:{},newVehicleTargets:{},naMonths:{}
  };
  return {
    deals:Array.isArray(payload?.deals)?payload.deals.map(migrateDeal):[],
    tasks:Array.isArray(payload?.tasks)?payload.tasks:[],
    calendarEvents:Array.isArray(payload?.calendarEvents)?payload.calendarEvents:[],
    settings:{...base,...(payload?.settings||{})}
  };
}
function applyCloudData(payload){
  const x=normalizeCloudData(payload);
  deals=x.deals;tasks=x.tasks;calendarEvents=x.calendarEvents||[];settings=x.settings;
  settings.monthTargets=settings.monthTargets||{};
  settings.newVehicleTargets=settings.newVehicleTargets||{};
  settings.naMonths=settings.naMonths||{};
}
function getCloudVersion(){
  const v=Number(localStorage.getItem('ps_cloud_version')||'0');
  return v>0?v:null;
}
function setCloudVersion(v){
  if(v===null||v===undefined)localStorage.removeItem('ps_cloud_version');
  else localStorage.setItem('ps_cloud_version',String(v));
}
function getCloudBaseData(){
  try{
    const raw=localStorage.getItem('ps_cloud_base_data');
    return raw?normalizeCloudData(JSON.parse(raw)):null;
  }catch(e){return null;}
}
function setCloudBaseData(data,version,stamp){
  localStorage.setItem('ps_cloud_base_data',JSON.stringify(normalizeCloudData(data)));
  setCloudVersion(version);
  if(stamp)localStorage.setItem('ps_last_cloud_sync',stamp);
}
function localIsDirty(){
  const base=getCloudBaseData();
  if(!base)return hasLocalData();
  return !deepEqual(currentCloudData(),base);
}
function mergeValue(base,local,remote,conflicts,path){
  const lChanged=!deepEqual(local,base);
  const rChanged=!deepEqual(remote,base);
  if(!lChanged&&!rChanged)return cloneData(base);
  if(lChanged&&!rChanged)return cloneData(local);
  if(!lChanged&&rChanged)return cloneData(remote);
  if(deepEqual(local,remote))return cloneData(local);
  if(isPlainObject(local)&&isPlainObject(remote)&&isPlainObject(base)){
    const keys=new Set([...Object.keys(base||{}),...Object.keys(local||{}),...Object.keys(remote||{})]);
    const out={};
    keys.forEach(k=>{
      const hasL=Object.prototype.hasOwnProperty.call(local||{},k);
      const hasR=Object.prototype.hasOwnProperty.call(remote||{},k);
      const hasB=Object.prototype.hasOwnProperty.call(base||{},k);
      if(!hasL&&!hasR)return;
      out[k]=mergeValue(hasB?base[k]:undefined,hasL?local[k]:undefined,hasR?remote[k]:undefined,conflicts,path?path+'.'+k:k);
    });
    return out;
  }
  conflicts.push(path||'data');
  return cloneData(local);
}
function mergeCollection(baseArr,localArr,remoteArr,conflicts,label){
  const b=new Map((baseArr||[]).map(x=>[x.id,x]));
  const l=new Map((localArr||[]).map(x=>[x.id,x]));
  const r=new Map((remoteArr||[]).map(x=>[x.id,x]));
  const ids=[...new Set([...b.keys(),...l.keys(),...r.keys()])];
  const out=[];
  ids.forEach(id=>{
    const bv=b.get(id),lv=l.get(id),rv=r.get(id),path=label+'.'+id;
    if(bv===undefined){
      if(lv===undefined&&rv!==undefined)out.push(cloneData(rv));
      else if(rv===undefined&&lv!==undefined)out.push(cloneData(lv));
      else if(lv!==undefined&&rv!==undefined){
        if(deepEqual(lv,rv))out.push(cloneData(lv));
        else{conflicts.push(path+' (both created differently)');out.push(cloneData(lv));}
      }
      return;
    }
    if(lv===undefined&&rv===undefined)return;
    if(lv===undefined&&rv!==undefined){
      if(deepEqual(rv,bv))return;
      conflicts.push(path+' (deleted locally, changed remotely)');
      out.push(cloneData(rv));return;
    }
    if(rv===undefined&&lv!==undefined){
      if(deepEqual(lv,bv))return;
      conflicts.push(path+' (changed locally, deleted remotely)');
      out.push(cloneData(lv));return;
    }
    out.push(mergeValue(bv,lv,rv,conflicts,path));
  });
  return out;
}
function mergeCloudData(base,local,remote){
  const conflicts=[];
  const merged={
    deals:mergeCollection(base?.deals||[],local?.deals||[],remote?.deals||[],conflicts,'deal'),
    tasks:mergeCollection(base?.tasks||[],local?.tasks||[],remote?.tasks||[],conflicts,'task'),
    calendarEvents:mergeCollection(base?.calendarEvents||[],local?.calendarEvents||[],remote?.calendarEvents||[],conflicts,'calendar'),
    settings:mergeValue(base?.settings||{},local?.settings||{},remote?.settings||{},conflicts,'settings')
  };
  return {data:merged,conflicts};
}
function mergeFirstRun(localData,cloudData){
  const localDeals=localData.deals||[],cloudDeals=cloudData.deals||[];
  const localTasks=localData.tasks||[],cloudTasks=cloudData.tasks||[];
  const localCalendar=localData.calendarEvents||[],cloudCalendar=cloudData.calendarEvents||[];
  const dealMap=new Map(cloudDeals.map(d=>[d.id,d]));
  localDeals.forEach(d=>{if(!dealMap.has(d.id))dealMap.set(d.id,d);});
  const taskMap=new Map(cloudTasks.map(t=>[t.id,t]));
  localTasks.forEach(t=>{if(!taskMap.has(t.id))taskMap.set(t.id,t);});
  const calendarMap=new Map(cloudCalendar.map(x=>[x.id,x]));
  localCalendar.forEach(x=>{if(!calendarMap.has(x.id))calendarMap.set(x.id,x);});
  return {
    deals:[...dealMap.values()].map(migrateDeal),
    tasks:[...taskMap.values()],
    calendarEvents:[...calendarMap.values()],
    settings:{...localData.settings,...cloudData.settings}
  };
}
function setSyncStatus(state,text){
  const el=document.getElementById('syncStatus');
  if(!el)return;
  el.className='sync '+state;
  el.textContent=text;
}
function hasLocalData(){
  return deals.length>0 || tasks.length>0 || calendarEvents.length>0;
}
function persist(markLocal=true){
  localStorage.setItem('ps_deals',JSON.stringify(deals));
  localStorage.setItem('ps_tasks',JSON.stringify(tasks));
  localStorage.setItem('ps_calendar',JSON.stringify(calendarEvents));
  localStorage.setItem('ps_settings',JSON.stringify(settings));
  if(markLocal){
    localGeneration++;
    localStorage.setItem('ps_local_revision',String(localGeneration));
    localStorage.setItem('ps_local_updated_at',new Date().toISOString());
    cloudDirty=true;
  }
}
function cloudTimeLabel(stamp){
  if(!stamp)return '';
  const d=new Date(stamp);
  if(isNaN(d))return '';
  return d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
function setCloudSynced(stamp,message='Cloud synced'){
  const t=cloudTimeLabel(stamp||new Date().toISOString());
  setSyncStatus('online',t?message+' · '+t:message);
}
function getCloudConflict(){
  try{
    const raw=localStorage.getItem('ps_cloud_conflict');
    return raw?JSON.parse(raw):null;
  }catch(e){return null;}
}
function clearCloudConflict(){
  localStorage.removeItem('ps_cloud_conflict');
  renderCloudConflict();
}
function saveCloudConflict(remote,base,local){
  localStorage.setItem('ps_cloud_conflict',JSON.stringify({
    detectedAt:new Date().toISOString(),remote,base,local
  }));
  renderCloudConflict();
}
function renderCloudConflict(){
  const card=document.getElementById('cloudConflictCard');
  const msg=document.getElementById('cloudConflictMsg');
  if(!card||!msg)return;
  const c=getCloudConflict();
  if(!c){card.style.display='none';return;}
  card.style.display='block';
  const when=c.detectedAt?new Date(c.detectedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'now';
  msg.textContent='Another device changed My Sales HQ since this device last synced ('+when+'). No data was silently overwritten. Non-conflicting changes are merged automatically; overlapping changes need a choice below.';
}
function setCloudUi(){
  const email=document.getElementById('cloudEmail');
  const account=document.getElementById('cloudAccount');
  const loginBtn=document.getElementById('btnCloudLogin');
  const pullBtn=document.getElementById('btnPull');
  const pushBtn=document.getElementById('btnPush');
  const signoutBtn=document.getElementById('btnCloudSignout');
  const authenticated=!!sbSession;
  if(email && authenticated) email.value=sbSession.user.email||'';
  if(account)account.textContent=authenticated ? ('Signed in as '+(sbSession.user.email||'your account')) : 'Not signed in';
  if(loginBtn)loginBtn.style.display=authenticated?'none':'inline-flex';
  if(signoutBtn)signoutBtn.style.display=authenticated?'inline-flex':'none';
  if(pullBtn)pullBtn.disabled=!authenticated;
  if(pushBtn)pushBtn.disabled=!authenticated;
  const historyCard=document.getElementById('cloudHistoryCard');
  if(historyCard)historyCard.style.display=authenticated?'block':'none';
  renderCloudConflict();
}
async function fetchCloudRow(){
  const {data,error}=await sb.from(CLOUD_TABLE).select('data,updated_at,version').eq('id',sbSession.user.id).maybeSingle();
  if(error)throw error;
  return data||null;
}
async function fetchCloudHistory(){
  if(!sb||!sbSession)return [];
  const {data,error}=await sb.from(CLOUD_HISTORY_TABLE)
    .select('id,source_version,created_at')
    .eq('user_id',sbSession.user.id)
    .order('created_at',{ascending:false})
    .limit(30);
  if(error)throw error;
  return data||[];
}
async function renderCloudHistory(){
  const wrap=document.getElementById('cloudHistoryList');
  if(!wrap||!sbSession)return;
  try{
    const rows=await fetchCloudHistory();
    wrap.innerHTML=rows.length?rows.map(h=>'<div class="statline"><span>Version '+esc(h.source_version)+' · '+esc(new Date(h.created_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}))+'</span><button class="btn sm" onclick="restoreCloudVersion(\''+esc(h.id)+'\')">Restore</button></div>').join(''):'<div class="empty">No saved cloud history yet. Versions appear automatically after the first cloud update.</div>';
  }catch(e){
    wrap.innerHTML='<div class="note">Could not load cloud history right now.</div>';
  }
}
async function initSupabase(){
  try{
    sb=supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    const {data,error}=await sb.auth.getSession();
    if(error)throw error;
    sbSession=data.session||null;
    setCloudUi();
    if(sbSession){await syncCloudState();startCloudWatcher();}
    else setSyncStatus('offline','Sign in to sync');
    sb.auth.onAuthStateChange((event,session)=>{
      sbSession=session||null;
      setCloudUi();
      if(event==='SIGNED_IN'&&sbSession){
        startCloudWatcher();
        setTimeout(()=>syncCloudState(),0);
      }else if(event==='SIGNED_OUT'){
        stopCloudWatcher();
        setSyncStatus('offline','Sign in to sync');
      }
    });
  }catch(e){
    sb=null;sbSession=null;setCloudUi();setSyncStatus('error','Cloud unavailable');
    const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Cloud setup error: '+(e.message||e);
  }
}
async function signInCloud(){
  if(!sb)return;
  const email=(document.getElementById('cloudEmail').value||'').trim();
  if(!email){document.getElementById('cloudMsg').textContent='Enter your email address.';return;}
  document.getElementById('cloudMsg').textContent='Sending secure sign-in link...';
  try{
    const {error}=await sb.auth.signInWithOtp({
      email,
      options:{emailRedirectTo:window.location.origin}
    });
    if(error)throw error;
    document.getElementById('cloudMsg').textContent='Sign-in link sent. Open it on this device to activate cloud sync.';
  }catch(e){
    document.getElementById('cloudMsg').textContent='Sign-in failed: '+(e.message||e);
  }
}
function stopCloudWatcher(){
  if(cloudRefreshTimer){clearInterval(cloudRefreshTimer);cloudRefreshTimer=null;}
}
function startCloudWatcher(){
  stopCloudWatcher();
  if(!sbSession)return;
  cloudRefreshTimer=setInterval(()=>{if(navigator.onLine&&document.visibilityState==='visible')syncCloudState();},30000);
}
async function signOutSupabase(){
  if(!sb)return;
  stopCloudWatcher();
  await sb.auth.signOut();
  setCloudUi();
  setSyncStatus('offline','Sign in to sync');
  const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Signed out. Your local cache is still here.';
}
async function resolveCloudConflict(remoteRow){
  const base=getCloudBaseData()||currentCloudData();
  const local=currentCloudData();
  const remote=normalizeCloudData(remoteRow.data||{});
  const merged=mergeCloudData(base,local,remote);
  if(merged.conflicts.length){
    saveCloudConflict(remoteRow,base,local);
    setSyncStatus('error','Conflict — review');
    const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Cloud changed elsewhere. Choose how to resolve the overlap below.';
    return false;
  }
  applyCloudData(merged.data);
  persist(false);
  setCloudBaseData(remote,remoteRow.version,remoteRow.updated_at);
  cloudDirty=!deepEqual(merged.data,remote);
  clearCloudConflict();
  refreshAll();
  if(cloudDirty){
    return await pushToCloud(true);
  }
  setCloudSynced(remoteRow.updated_at,'Cloud synced');
  await renderCloudHistory();
  return true;
}
async function pushToCloud(immediate=false){
  if(!sb||!sbSession)return false;
  if(!immediate){
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer=setTimeout(()=>pushToCloud(true),350);
    return true;
  }
  if(cloudSyncBusy){
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer=setTimeout(()=>pushToCloud(true),500);
    return true;
  }
  cloudSyncBusy=true;
  const genAtStart=localGeneration;
  setSyncStatus(navigator.onLine?'syncing':'offline',navigator.onLine?'Saving to cloud…':'Offline · local cache active');
  try{
    let expectedVersion=getCloudVersion();
    let row=await fetchCloudRow();
    if(!row){
      const {data,error}=await sb.from(CLOUD_TABLE).insert({
        id:sbSession.user.id,
        data:currentCloudData()
      }).select('data,updated_at,version').single();
      if(!error&&data){
        setCloudBaseData(data.data,data.version,data.updated_at);
        if(localGeneration===genAtStart)cloudDirty=false;
        clearCloudConflict();
        setCloudSynced(data.updated_at,'Cloud synced');
        await renderCloudHistory();
        return true;
      }
      if(error&&error.code!=='23505')throw error;
      row=await fetchCloudRow();
    }
    if(expectedVersion===null)expectedVersion=row.version;
    if(row.version!==expectedVersion){
      const ok=await resolveCloudConflict(row);
      return ok;
    }
    const submitted=currentCloudData();
    const {data,error}=await sb.from(CLOUD_TABLE)
      .update({data:submitted})
      .eq('id',sbSession.user.id)
      .eq('version',expectedVersion)
      .select('data,updated_at,version')
      .maybeSingle();
    if(error)throw error;
    if(!data){
      const fresh=await fetchCloudRow();
      if(!fresh)throw new Error('Cloud record disappeared unexpectedly.');
      return await resolveCloudConflict(fresh);
    }
    setCloudBaseData(data.data,data.version,data.updated_at);
    if(localGeneration===genAtStart)cloudDirty=false;
    clearCloudConflict();
    setCloudSynced(data.updated_at,'Cloud synced');
    const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Automatically synced '+deals.length+' deals / '+tasks.length+' tasks.';
    await renderCloudHistory();
    if(localGeneration!==genAtStart)cloudSave();
    return true;
  }catch(e){
    setSyncStatus('error','Sync error');
    const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Cloud save failed: '+(e.message||e);
    return false;
  }finally{
    cloudSyncBusy=false;
    if(cloudDirty)setTimeout(()=>pushToCloud(true),250);
  }
}
async function syncCloudState(){
  if(!sb||!sbSession||!navigator.onLine)return;
  if(cloudSyncBusy)return;
  cloudSyncBusy=true;
  setSyncStatus('syncing','Syncing cloud…');
  try{
    const row=await fetchCloudRow();
    if(!row){
      cloudSyncBusy=false;
      await pushToCloud(true);
      return;
    }
    const remote=normalizeCloudData(row.data||{});
    const base=getCloudBaseData();
    const storedVersion=getCloudVersion();
    if(!base||storedVersion===null){
      if(hasLocalData()){
        const merged=mergeFirstRun({deals,tasks,settings},remote);
        applyCloudData(merged);
        persist(false);
        setCloudBaseData(remote,row.version,row.updated_at);
        cloudDirty=!deepEqual(merged,remote);
        refreshAll();
        cloudSyncBusy=false;
        if(cloudDirty)await pushToCloud(true);
        else{setCloudSynced(row.updated_at,'Cloud synced');await renderCloudHistory();}
        return;
      }
      applyCloudData(remote);persist(false);setCloudBaseData(remote,row.version,row.updated_at);
      cloudDirty=false;refreshAll();setCloudSynced(row.updated_at,'Cloud synced');
      return;
    }
    const local=currentCloudData();
    if(storedVersion===row.version){
      if(!deepEqual(local,base)){
        cloudDirty=true;
        cloudSyncBusy=false;
        await pushToCloud(true);
        return;
      }
      applyCloudData(remote);persist(false);setCloudBaseData(remote,row.version,row.updated_at);
      cloudDirty=false;refreshAll();setCloudSynced(row.updated_at,'Cloud synced');await renderCloudHistory();
      return;
    }
    if(!deepEqual(local,base)){
      const merged=mergeCloudData(base,local,remote);
      if(merged.conflicts.length){
        saveCloudConflict(row,base,local);
        setSyncStatus('error','Conflict — review');
        const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Cloud changed elsewhere. Nothing has been overwritten.';
        return;
      }
      applyCloudData(merged.data);persist(false);setCloudBaseData(remote,row.version,row.updated_at);
      cloudDirty=!deepEqual(merged.data,remote);
      refreshAll();cloudSyncBusy=false;
      if(cloudDirty)await pushToCloud(true);
      else{setCloudSynced(row.updated_at,'Cloud synced');await renderCloudHistory();}
      return;
    }
    applyCloudData(remote);persist(false);setCloudBaseData(remote,row.version,row.updated_at);
    cloudDirty=false;clearCloudConflict();refreshAll();
    setCloudSynced(row.updated_at,'Cloud synced');
  }catch(e){
    setSyncStatus('error','Sync error');
    const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Cloud sync failed: '+(e.message||e);
  }finally{
    cloudSyncBusy=false;
    if(cloudDirty)setTimeout(()=>pushToCloud(true),250);
  }
}
async function keepLocalAfterConflict(){
  const c=getCloudConflict();
  if(!c)return;
  setCloudBaseData(c.remote.data,c.remote.version,c.remote.updated_at);
  cloudDirty=true;
  clearCloudConflict();
  await pushToCloud(true);
}
async function loadCloudAfterConflict(){
  const c=getCloudConflict();
  if(!c)return;
  applyCloudData(c.remote.data);
  persist(false);
  setCloudBaseData(c.remote.data,c.remote.version,c.remote.updated_at);
  cloudDirty=false;
  clearCloudConflict();
  refreshAll();
  setCloudSynced(c.remote.updated_at,'Cloud synced');
  await renderCloudHistory();
}
async function restoreCloudVersion(historyId){
  if(!sb||!sbSession)return;
  if(!confirm('Restore this saved cloud version? The current cloud state will first be preserved in history.'))return;
  try{
    const {data:history,error}=await sb.from(CLOUD_HISTORY_TABLE)
      .select('data,source_version,created_at')
      .eq('id',historyId)
      .eq('user_id',sbSession.user.id)
      .maybeSingle();
    if(error)throw error;
    if(!history){alert('That history version is no longer available.');return;}
    const current=await fetchCloudRow();
    if(!current){alert('No current cloud state is available.');return;}
    applyCloudData(history.data);
    persist();
    setCloudBaseData(current.data,current.version,current.updated_at);
    cloudDirty=true;
    clearCloudConflict();
    refreshAll();
    await pushToCloud(true);
  }catch(e){
    const msg=document.getElementById('cloudMsg');if(msg)msg.textContent='Restore failed: '+(e.message||e);
  }
}
function pullFromCloud(){ return syncCloudState(); }
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&sbSession)syncCloudState();
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(document.getElementById('paymentModal').classList.contains('show'))closePaymentModal();
  else if(document.getElementById('taskModal').classList.contains('show'))closeTaskModal();
  else if(document.getElementById('dealModal').classList.contains('show'))closeDealModal();
});
document.querySelectorAll('.modal').forEach(modal=>{
  modal.addEventListener('click',e=>{
    if(e.target===modal){
      if(modal.id==='paymentModal')closePaymentModal();
      else if(modal.id==='taskModal')closeTaskModal();
      else if(modal.id==='dealModal')closeDealModal();
    }
  });
});
function cloudSave(){
  cloudDirty=true;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer=setTimeout(()=>pushToCloud(true),250);
}
function connectSupabase(){ return signInCloud(); }
function disconnectSupabase(){ return signOutSupabase(); }
window.addEventListener('online',()=>{ if(sbSession){ setSyncStatus('online','Back online · syncing…'); syncCloudState(); } });
window.addEventListener('offline',()=>{ if(sbSession)setSyncStatus('offline','Offline · local cache active'); });

function refreshAll(){
  renderSummary();renderDashboard();renderCalendar();renderWork();renderDeals();renderCommission();renderPerformance();loadSettingsUI();
  if(typeof renderFiConversion==='function')renderFiConversion();
}
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  tab.classList.add('active');document.getElementById('sec-'+tab.dataset.tab).classList.add('active');
  refreshAll();
}
));
document.getElementById('fType').addEventListener('change',()=>buildFiChecks([...document.querySelectorAll('input[name="fi"]:checked')].map(x=>x.value)));

function init(){
  loadSettingsUI();buildFiChecks([]);refreshAll();initSupabase();
  if(typeof showPlay==='function')showPlay('route');
}
init();