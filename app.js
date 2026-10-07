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
  finance: 'Finance', paint: 'Paint', refresh: 'Refresh',
  warranty: 'Warranty', carepack: 'Motab Care Pack', assurance: 'Assurance Upgrade'
};

let deals = JSON.parse(localStorage.getItem('ps_deals') || '[]');
let settings = JSON.parse(localStorage.getItem('ps_settings') || JSON.stringify({
  basic: 20000, pension: 0, otherDed: 0, theme: 'dark',
  monthTargets: {}
}));
let sb = null;

function setTheme(t) {
  document.body.setAttribute('data-theme', t);
  settings.theme = t;
  document.getElementById('themeBtn').textContent = t === 'dark' ? 'Light' : 'Dark';
  document.getElementById('setTheme').value = t;
  localStorage.setItem('ps_settings', JSON.stringify(settings));
}
function toggleTheme() {
  setTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

function getSbCreds() {
  return { url: localStorage.getItem('ps_sb_url') || '', key: localStorage.getItem('ps_sb_key') || '' };
}
function setSyncStatus(state, text) {
  const el = document.getElementById('syncStatus');
  el.className = 'sync-status ' + state;
  el.textContent = text;
}
function initSupabase() {
  const { url, key } = getSbCreds();
  if (!url || !key) { setSyncStatus('offline', 'Local only'); return; }
  document.getElementById('sbUrl').value = url;
  document.getElementById('sbKey').value = key;
  try {
    sb = supabase.createClient(url, key);
    setSyncStatus('online', 'Cloud connected');
    document.getElementById('btnPull').disabled = false;
    document.getElementById('btnPush').disabled = false;
    pullFromCloud(true);
  } catch (e) { setSyncStatus('error', 'Cloud error'); sb = null; }
}
async function connectSupabase() {
  const url = document.getElementById('sbUrl').value.trim();
  const key = document.getElementById('sbKey').value.trim();
  if (!url || !key) { document.getElementById('cloudMsg').textContent = 'Enter URL and key.'; return; }
  localStorage.setItem('ps_sb_url', url);
  localStorage.setItem('ps_sb_key', key);
  document.getElementById('cloudMsg').textContent = 'Connecting...';
  try {
    sb = supabase.createClient(url, key);
    const { error } = await sb.from('deals').select('id').limit(1);
    if (error) throw error;
    setSyncStatus('online', 'Cloud connected');
    document.getElementById('btnPull').disabled = false;
    document.getElementById('btnPush').disabled = false;
    document.getElementById('cloudMsg').textContent = 'Connected. Pulling...';
    await pullFromCloud();
  } catch (e) {
    setSyncStatus('error', 'Cloud error');
    document.getElementById('cloudMsg').textContent = 'Failed: ' + (e.message || e);
    sb = null;
  }
}
function disconnectSupabase() {
  localStorage.removeItem('ps_sb_url');
  localStorage.removeItem('ps_sb_key');
  sb = null;
  document.getElementById('sbUrl').value = '';
  document.getElementById('sbKey').value = '';
  setSyncStatus('offline', 'Local only');
  document.getElementById('btnPull').disabled = true;
  document.getElementById('btnPush').disabled = true;
  document.getElementById('cloudMsg').textContent = 'Disconnected.';
}
async function pushToCloud() {
  if (!sb) return;
  document.getElementById('cloudMsg').textContent = 'Pushing...';
  try {
    const { error } = await sb.from('deals').upsert({
      id: 'state',
      data: { deals, settings, updated: new Date().toISOString() },
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    document.getElementById('cloudMsg').textContent = 'Pushed ' + deals.length + ' deals.';
    setSyncStatus('online', 'Cloud synced');
  } catch (e) {
    document.getElementById('cloudMsg').textContent = 'Push failed: ' + (e.message || e);
    setSyncStatus('error', 'Sync error');
  }
}
async function pullFromCloud(silent) {
  if (!sb) return;
  if (!silent) document.getElementById('cloudMsg').textContent = 'Pulling...';
  try {
    const { data, error } = await sb.from('deals').select('data').eq('id', 'state').single();
    if (error && error.code !== 'PGRST116') throw error;
    if (data && data.data) {
      if (data.data.deals) deals = data.data.deals;
      if (data.data.settings) settings = { ...settings, ...data.data.settings };
      localStorage.setItem('ps_deals', JSON.stringify(deals));
      localStorage.setItem('ps_settings', JSON.stringify(settings));
      loadSettingsUI(); refreshAll();
      if (!silent) document.getElementById('cloudMsg').textContent = 'Pulled ' + deals.length + ' deals.';
      setSyncStatus('online', 'Cloud synced');
    } else if (!silent) document.getElementById('cloudMsg').textContent = 'No cloud data yet - push to create it.';
  } catch (e) {
    if (!silent) document.getElementById('cloudMsg').textContent = 'Pull failed: ' + (e.message || e);
    setSyncStatus('error', 'Sync error');
  }
}
async function cloudSave() { if (sb) await pushToCloud(); }

function estimateTakeHome(grossAnnual) {
  const pa = 12570, basicLimit = 50270, higherLimit = 125140;
  let taxable = Math.max(0, grossAnnual - pa), tax = 0;
  if (taxable > 0) { const b = Math.min(taxable, basicLimit - pa); tax += b * 0.20; taxable -= b; }
  if (taxable > 0) { const h = Math.min(taxable, higherLimit - basicLimit); tax += h * 0.40; taxable -= h; }
  if (taxable > 0) tax += taxable * 0.45;
  let ni = 0;
  if (grossAnnual > 12570) ni += (Math.min(grossAnnual, 50270) - 12570) * 0.08;
  if (grossAnnual > 50270) ni += (grossAnnual - 50270) * 0.02;
  return Math.max(0, grossAnnual - tax - ni - (settings.pension/100)*grossAnnual - (settings.otherDed||0)*12);
}
function calcGrossForTakeHome(targetMonthly) {
  let low = targetMonthly * 12, high = targetMonthly * 12 * 1.6;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (estimateTakeHome(mid) / 12 < targetMonthly) low = mid; else high = mid;
  }
  return Math.round((low + high) / 2);
}
function calcDealComm(d) {
  const v = SCHEME.vehicle[d.type] || { order: 0, delivery: 0 };
  let vehicle = 0;
  if (d.status === 'order' || d.status === 'both') vehicle += v.order;
  if (d.status === 'delivery' || d.status === 'both') vehicle += v.delivery;
  let fi = 0;
  const products = SCHEME.fi[d.type] || {};
  (d.fi || []).forEach(p => { if (products[p]) fi += products[p]; });
  if (d.csi != null && d.csi < 8) return { vehicle: 0, fi: 0, total: 0, clawed: true };
  return { vehicle, fi, total: vehicle + fi, clawed: false };
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function currentMonthKey() {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0');
}
function prevMonthKey() {
  const n = new Date();
  n.setMonth(n.getMonth() - 1);
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0');
}
function monthLabel(key) {
  const [y,m] = key.split('-');
  return new Date(+y, +m-1, 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

function getMonthStats(key) {
  let units = 0, comm = 0, orders = 0, fiTotal = 0, fiCount = 0;
  const byType = { 'new-retail': 0, 'new-motab': 0, used: 0 };
  deals.forEach(d => {
    if (monthKey(d.date) !== key) return;
    const c = calcDealComm(d);
    comm += c.total;
    if (d.status === 'order' || d.status === 'both') orders++;
    if (d.status === 'delivery' || d.status === 'both') { units++; byType[d.type] = (byType[d.type]||0)+1; }
    if ((d.fi||[]).length) { fiTotal += c.fi; fiCount++; }
  });
  return { units, comm, orders, deliveries: units, fiTotal, fiCount, byType, avgFi: fiCount ? fiTotal/fiCount : 0 };
}

function getMonthTarget(key) {
  const targets = settings.monthTargets || {};
  return targets[key] || 14;
}

function renderFiChecks(selected) {
  const type = document.getElementById('dealType').value;
  const products = SCHEME.fi[type] || {};
  const sel = selected || [];
  document.getElementById('fiChecks').innerHTML = Object.keys(products).map(k =>
    '<label><input type="checkbox" name="fi" value="' + k + '" ' + (sel.includes(k)?'checked':'') + '> ' + FI_LABELS[k] + ' (£' + products[k] + ')</label>'
  ).join('');
}

function refreshAll() {
  updateSummary();
  renderDeals();
  renderDashboard();
  renderHistory();
  renderInsight();
  renderWeeklyReminder();
}

function updateSummary() {
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  let yearUnits = 0;
  deals.forEach(d => {
    if (d.status === 'delivery' || d.status === 'both') yearUnits++;
  });

  document.getElementById('monthComm').textContent = '£' + stats.comm.toLocaleString();
  document.getElementById('monthUnits').textContent = stats.units + ' units delivered';
  const target = getMonthTarget(nowKey);
  document.getElementById('unitTargetStat').textContent = stats.units + ' / ' + target;
  document.getElementById('unitTargetLabel').textContent = stats.units >= target ? 'Target met' : (target - stats.units) + ' more to target';
  document.getElementById('unitProg').style.width = Math.min(100, (stats.units / target) * 100) + '%';

  document.getElementById('yearUnitsStat').textContent = yearUnits + ' / 160';
  let bonusLabel = 'Need 160 for £1,000';
  if (yearUnits >= 240) bonusLabel = '240+ → £4,000';
  else if (yearUnits >= 200) bonusLabel = '200 → £2,000 · next 240';
  else if (yearUnits >= 160) bonusLabel = '160 → £1,000 · next 200';
  else bonusLabel = (160 - yearUnits) + ' more for £1,000';
  document.getElementById('bonusLabel').textContent = bonusLabel;
  document.getElementById('yearProg').style.width = Math.min(100, (yearUnits / 160) * 100) + '%';

  const basicM = (settings.basic || 20000) / 12;
  const th = estimateTakeHome((basicM + stats.comm) * 12) / 12;
  const thEl = document.getElementById('takeHomeNow');
  thEl.textContent = '£' + Math.round(th).toLocaleString();
  thEl.className = 'stat ' + (th >= 3000 ? 'green' : th >= 2500 ? 'yellow' : 'red');

  const grossNeeded = calcGrossForTakeHome(3000);
  const commNeeded = Math.max(0, Math.round(grossNeeded / 12 - basicM));
  settings._commNeeded = commNeeded;
  document.getElementById('grossNeeded').textContent = '£' + Math.round(grossNeeded / 12).toLocaleString();
  document.getElementById('commNeeded').textContent = '£' + commNeeded.toLocaleString();
  document.getElementById('monthProg').style.width = Math.min(100, (stats.comm / (commNeeded || 1)) * 100) + '%';

  const gap = Math.max(0, commNeeded - stats.comm);
  const pathEl = document.getElementById('pathToTarget');
  if (gap <= 0) {
    pathEl.innerHTML = '<span style="color:var(--green);font-weight:600;">You are on track for £3,000+ take-home this month.</span>';
  } else {
    const avgFiUsed = stats.avgFi || 100;
    const perUsed = 60 + avgFiUsed;
    const carsNeeded = Math.ceil(gap / Math.max(perUsed, 80));
    pathEl.innerHTML = 'Need <strong style="color:var(--text)">£' + gap.toLocaleString() + '</strong> more commission ≈ <strong style="color:var(--text)">' + carsNeeded + ' more used cars</strong> with typical F&amp;I (or mix of new + products).';
  }
}

function renderDashboard() {
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  const parts = [];
  if (stats.byType['new-retail']) parts.push(stats.byType['new-retail'] + ' New Retail');
  if (stats.byType['new-motab']) parts.push(stats.byType['new-motab'] + ' Motability');
  if (stats.byType.used) parts.push(stats.byType.used + ' Used');
  parts.push(stats.orders + ' orders logged');
  if (stats.fiCount) parts.push('Avg F&amp;I £' + Math.round(stats.avgFi) + ' on ' + stats.fiCount + ' deals');
  document.getElementById('dashBreakdown').innerHTML = parts.length ? parts.map(p => '• ' + p).join('<br>') : 'No activity this month yet.';

  const awaiting = deals.filter(d => d.status === 'order');
  const awEl = document.getElementById('awaitingList');
  if (!awaiting.length) awEl.textContent = 'None - all orders delivered or none logged.';
  else awEl.innerHTML = awaiting.map(d => {
    const c = calcDealComm(d);
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.35rem;">' +
      '<span>' + (d.customer || 'Deal') + ' (' + d.date + ') - order comm £' + c.vehicle + '</span>' +
      '<button class="btn-green btn-sm" onclick="markDelivered(\'' + d.id + '\')">Mark delivered</button></div>';
  }).join('');
}

function renderDeals() {
  const tbody = document.getElementById('dealsBody');
  const noDeals = document.getElementById('noDeals');
  document.getElementById('dealCount').textContent = '(' + deals.length + ')';
  if (!deals.length) { tbody.innerHTML = ''; noDeals.style.display = 'block'; return; }
  noDeals.style.display = 'none';
  const sorted = [...deals].sort((a,b) => b.date.localeCompare(a.date));
  tbody.innerHTML = sorted.map(d => {
    const c = calcDealComm(d);
    const typeTag = d.type === 'used' ? 'tag-used' : d.type === 'new-motab' ? 'tag-motab' : 'tag-new';
    const typeLabel = d.type === 'used' ? 'Used' : d.type === 'new-motab' ? 'Motab' : 'New';
    const stTag = d.status === 'order' ? 'tag-order' : d.status === 'delivery' ? 'tag-delivery' : 'tag-both';
    const stLabel = d.status === 'order' ? 'Order' : d.status === 'delivery' ? 'Delivery' : 'Both';
    const fiStr = (d.fi || []).map(p => FI_LABELS[p] || p).join(', ') || '—';
    const delBtn = d.status === 'order' ? '<button class="btn-green btn-sm" onclick="markDelivered(\'' + d.id + '\')">Delivered</button> ' : '';
    return '<tr>' +
      '<td>' + d.date + '</td>' +
      '<td>' + (d.customer || '—') + '</td>' +
      '<td><span class="tag ' + typeTag + '">' + typeLabel + '</span></td>' +
      '<td><span class="tag ' + stTag + '">' + stLabel + '</span></td>' +
      '<td style="font-size:0.7rem">' + fiStr + '</td>' +
      '<td>£' + c.total + (c.clawed ? ' <span style="color:var(--red)">(CSI)</span>' : '') + '</td>' +
      '<td style="white-space:nowrap">' + delBtn +
        '<button class="btn-secondary btn-sm" onclick="startEdit(\'' + d.id + '\')">Edit</button> ' +
        '<button class="btn-secondary btn-sm" onclick="deleteDeal(\'' + d.id + '\')">×</button></td></tr>';
  }).join('');
}

function renderHistory() {
  const keys = [...new Set(deals.map(d => monthKey(d.date)))].sort().reverse();
  const body = document.getElementById('historyBody');
  const noH = document.getElementById('noHistory');
  if (!keys.length) { body.innerHTML = ''; noH.style.display = 'block'; return; }
  noH.style.display = 'none';
  const basicM = (settings.basic || 20000) / 12;
  body.innerHTML = keys.map(k => {
    const s = getMonthStats(k);
    const th = estimateTakeHome((basicM + s.comm) * 12) / 12;
    return '<div class="hist-row"><div><strong>' + monthLabel(k) + '</strong></div><div>' + s.units + ' units</div><div>£' + s.comm.toLocaleString() + '</div><div class="hide-m">£' + Math.round(th).toLocaleString() + '</div></div>';
  }).join('');

  const prev = prevMonthKey();
  const ps = getMonthStats(prev);
  const insightEl = document.getElementById('lastMonthInsight');
  if (ps.units === 0 && ps.comm === 0) {
    insightEl.textContent = 'No deals logged for last month yet.';
  } else {
    const bits = [];
    bits.push('You delivered <strong style="color:var(--text)">' + ps.units + ' units</strong> and earned <strong style="color:var(--text)">£' + ps.comm.toLocaleString() + '</strong> commission.');
    if (ps.byType.used) bits.push('Used cars: ' + ps.byType.used + ' (strong F&amp;I potential).');
    if (ps.byType['new-retail'] || ps.byType['new-motab']) bits.push('New: ' + ((ps.byType['new-retail']||0)+(ps.byType['new-motab']||0)) + '.');
    if (ps.avgFi > 0) bits.push('Average F&amp;I per deal with products: £' + Math.round(ps.avgFi) + '.');
    if (ps.orders > ps.units) bits.push((ps.orders - ps.units) + ' order(s) still awaiting delivery at month end.');
    const target = getMonthTarget(prev);
    if (ps.units >= target) bits.push('You hit your unit target of ' + target + '.');
    else bits.push('Unit target was ' + target + ' - you finished at ' + ps.units + '.');
    insightEl.innerHTML = bits.join(' ');
  }
}

function renderInsight() {
  const box = document.getElementById('insightBox');
  const prev = prevMonthKey();
  const ps = getMonthStats(prev);
  if (ps.units === 0 && ps.comm === 0) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '<strong>Last month (' + monthLabel(prev) + '):</strong> ' + ps.units + ' units · £' + ps.comm.toLocaleString() + ' commission' +
    (ps.avgFi > 0 ? ' · avg F&amp;I £' + Math.round(ps.avgFi) : '') +
    (ps.units >= getMonthTarget(prev) ? ' · target hit' : '');
}

async function markDelivered(id) {
  const d = deals.find(x => x.id === id);
  if (!d || d.status !== 'order') return;
  if (!confirm('Mark "' + (d.customer || 'this deal') + '" as delivered? This adds delivery commission.')) return;
  d.status = 'both';
  localStorage.setItem('ps_deals', JSON.stringify(deals));
  refreshAll();
  await cloudSave();
}

function getWeeklyReminderText() {
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  const target = getMonthTarget(nowKey);
  const remaining = Math.max(0, target - stats.units);
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const daysLeft = daysInMonth - today.getDate() + 1;
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  const perWeek = remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  const basicM = (settings.basic || 20000) / 12;
  const th = estimateTakeHome((basicM + stats.comm) * 12) / 12;
  const gap = Math.max(0, (settings._commNeeded || 2093) - stats.comm);

  let text = 'Pentagon weekly check-in (' + monthLabel(nowKey) + '):\n';
  text += '- Units so far: ' + stats.units + ' / ' + target + '\n';
  text += '- Commission: £' + stats.comm.toLocaleString() + '\n';
  text += '- Est. take-home: £' + Math.round(th).toLocaleString() + '\n';
  if (remaining > 0) text += '- Still need: ' + remaining + ' units (~' + perWeek + ' this week, ' + daysLeft + ' days left)\n';
  else text += '- Unit target met. Keep building F&I.\n';
  if (gap > 0) text += '- To hit £3k take-home: ~£' + gap.toLocaleString() + ' more commission\n';
  else text += '- On track for £3k+ take-home this month\n';
  text += '- Awaiting delivery: ' + deals.filter(d => d.status === 'order').length;
  return text;
}

function renderWeeklyReminder() {
  const el = document.getElementById('weeklyReminder');
  if (!el) return;
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  const target = getMonthTarget(nowKey);
  const remaining = Math.max(0, target - stats.units);
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const daysLeft = daysInMonth - today.getDate() + 1;
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  const perWeek = remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  if (remaining <= 0) {
    el.innerHTML = 'Unit target met for this month. Focus on F&amp;I and quality handovers.';
  } else {
    el.innerHTML = 'Need <strong style="color:var(--text)">' + remaining + ' more units</strong> this month. ' +
      'That is about <strong style="color:var(--text)">' + perWeek + ' this week</strong> (' + daysLeft + ' days left).';
  }
}

function copyWeeklyReminder() {
  const text = getWeeklyReminderText();
  navigator.clipboard.writeText(text).then(() => {
    alert('Weekly reminder copied - paste into Notes or Messages.');
  }).catch(() => {
    prompt('Copy this text:', text);
  });
}

function exportPDF() {
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  const target = getMonthTarget(nowKey);
  const basicM = (settings.basic || 20000) / 12;
  const th = estimateTakeHome((basicM + stats.comm) * 12) / 12;
  const monthDeals = deals.filter(d => monthKey(d.date) === nowKey).sort((a,b) => a.date.localeCompare(b.date));
  let rows = monthDeals.map(d => {
    const c = calcDealComm(d);
    const type = d.type === 'used' ? 'Used' : d.type === 'new-motab' ? 'Motab' : 'New';
    return '<tr><td>' + d.date + '</td><td>' + (d.customer||'') + '</td><td>' + type + '</td><td>' + d.status + '</td><td>£' + c.total + '</td></tr>';
  }).join('');
  const w = window.open('', '_blank');
  w.document.write('<!DOCTYPE html><html><head><title>Pentagon ' + monthLabel(nowKey) + '</title>' +
  '<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:800px;margin:0 auto}' +
  'h1{font-size:18px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:20px}' +
  '.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}' +
  '.box{border:1px solid #ddd;border-radius:8px;padding:12px}.box .n{font-size:22px;font-weight:700}.box .l{font-size:11px;color:#666}' +
  'table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}' +
  'th{font-size:10px;text-transform:uppercase;color:#666}footer{margin-top:24px;font-size:10px;color:#999}' +
  '@media print{button{display:none}}</style></head><body>' +
  '<button onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;cursor:pointer">Print / Save as PDF</button>' +
  '<h1>Pentagon Motor Group - Monthly summary</h1>' +
  '<div class="sub">' + monthLabel(nowKey) + ' · Sales Consultant commission record</div>' +
  '<div class="grid">' +
  '<div class="box"><div class="n">' + stats.units + ' / ' + target + '</div><div class="l">Units delivered</div></div>' +
  '<div class="box"><div class="n">£' + stats.comm.toLocaleString() + '</div><div class="l">Commission</div></div>' +
  '<div class="box"><div class="n">£' + Math.round(th).toLocaleString() + '</div><div class="l">Est. take-home</div></div>' +
  '</div>' +
  '<table><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Status</th><th>Comm</th></tr></thead>' +
  '<tbody>' + (rows || '<tr><td colspan="5">No deals this month</td></tr>') + '</tbody></table>' +
  '<footer>Private record · Generated ' + new Date().toLocaleString('en-GB') + ' · Not an official payslip</footer>' +
  '</body></html>');
  w.document.close();
}

function startEdit(id) {
  const d = deals.find(x => x.id === id);
  if (!d) return;
  document.getElementById('editId').value = d.id;
  document.getElementById('dealDate').value = d.date;
  document.getElementById('dealCustomer').value = d.customer || '';
  document.getElementById('dealType').value = d.type;
  document.getElementById('dealStatus').value = d.status;
  document.getElementById('dealCsi').value = d.csi != null ? d.csi : '';
  document.getElementById('dealNotes').value = d.notes || '';
  renderFiChecks(d.fi || []);
  document.getElementById('formTitle').textContent = 'Edit Deal';
  document.getElementById('submitBtn').textContent = 'Save changes';
  document.getElementById('cancelEdit').style.display = 'inline-block';
  document.querySelector('[data-tab="add"]').click();
}
function cancelEdit() {
  document.getElementById('editId').value = '';
  document.getElementById('dealForm').reset();
  document.getElementById('dealDate').valueAsDate = new Date();
  document.getElementById('formTitle').textContent = 'Log a Deal';
  document.getElementById('submitBtn').textContent = 'Add Deal';
  document.getElementById('cancelEdit').style.display = 'none';
  renderFiChecks();
}

async function addDeal(e) {
  e.preventDefault();
  const fi = [...document.querySelectorAll('input[name="fi"]:checked')].map(c => c.value);
  const editId = document.getElementById('editId').value;
  const payload = {
    id: editId || (Date.now().toString(36) + Math.random().toString(36).slice(2,6)),
    date: document.getElementById('dealDate').value,
    customer: document.getElementById('dealCustomer').value.trim(),
    type: document.getElementById('dealType').value,
    status: document.getElementById('dealStatus').value,
    fi,
    csi: document.getElementById('dealCsi').value ? parseFloat(document.getElementById('dealCsi').value) : null,
    notes: document.getElementById('dealNotes').value.trim()
  };
  if (editId) {
    const idx = deals.findIndex(d => d.id === editId);
    if (idx >= 0) deals[idx] = payload;
  } else {
    deals.push(payload);
  }
  localStorage.setItem('ps_deals', JSON.stringify(deals));
  cancelEdit();
  refreshAll();
  document.querySelector('[data-tab="deals"]').click();
  await cloudSave();
}

async function deleteDeal(id) {
  if (!confirm('Delete this deal?')) return;
  deals = deals.filter(d => d.id !== id);
  localStorage.setItem('ps_deals', JSON.stringify(deals));
  refreshAll();
  await cloudSave();
}
async function clearDeals() {
  deals = [];
  localStorage.setItem('ps_deals', '[]');
  refreshAll();
  await cloudSave();
}

function saveMonthTarget() {
  const key = document.getElementById('setTargetMonth').value || currentMonthKey();
  const val = parseInt(document.getElementById('setMonthTarget').value) || 14;
  if (!settings.monthTargets) settings.monthTargets = {};
  settings.monthTargets[key] = val;
  localStorage.setItem('ps_settings', JSON.stringify(settings));
  refreshAll();
  cloudSave();
  alert('Target for ' + key + ' set to ' + val + ' units');
}
function saveSettings() {
  settings.basic = parseFloat(document.getElementById('setBasic').value) || 20000;
  settings.pension = parseFloat(document.getElementById('setPension').value) || 0;
  settings.otherDed = parseFloat(document.getElementById('setOtherDed').value) || 0;
  localStorage.setItem('ps_settings', JSON.stringify(settings));
  refreshAll();
  cloudSave();
  alert('Settings saved');
}
function runModel() {
  const nr = +document.getElementById('mNewRetail').value || 0;
  const nm = +document.getElementById('mNewMotab').value || 0;
  const u  = +document.getElementById('mUsed').value || 0;
  const fiN = +document.getElementById('mFiNew').value || 0;
  const fiU = +document.getElementById('mFiUsed').value || 0;
  const veh = nr * 80 + nm * 60 + u * 60;
  const fi = (nr + nm) * fiN + u * fiU;
  const total = veh + fi;
  document.getElementById('mVehicle').textContent = '£' + veh.toLocaleString();
  document.getElementById('mFi').textContent = '£' + Math.round(fi).toLocaleString();
  document.getElementById('mTotal').textContent = '£' + Math.round(total).toLocaleString();
  const th = estimateTakeHome(((settings.basic||20000)/12 + total) * 12) / 12;
  const el = document.getElementById('mTakeHome');
  el.textContent = '£' + Math.round(th).toLocaleString();
  el.className = 'stat ' + (th >= 3000 ? 'green' : th >= 2500 ? 'yellow' : '');
  document.getElementById('modelResult').style.display = 'block';
}

function exportJSON() {
  const data = { deals, settings, exported: new Date().toISOString(), version: 5 };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pentagon-commission-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
}
function exportCSV() {
  const headers = ['Date','Customer','Type','Status','F&I','Vehicle Comm','F&I Comm','Total Comm','CSI','Notes'];
  const rows = deals.map(d => {
    const c = calcDealComm(d);
    return [d.date, d.customer||'', d.type, d.status, (d.fi||[]).join(';'), c.vehicle, c.fi, c.total, d.csi??'', d.notes||''].map(x => '"'+String(x).replace(/"/g,'""')+'"').join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pentagon-deals-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.deals) deals = data.deals;
      if (data.settings) settings = { ...settings, ...data.settings };
      localStorage.setItem('ps_deals', JSON.stringify(deals));
      localStorage.setItem('ps_settings', JSON.stringify(settings));
      loadSettingsUI(); refreshAll();
      await cloudSave();
      alert('Imported ' + deals.length + ' deals');
    } catch (err) { alert('Invalid JSON'); }
  };
  reader.readAsText(file);
}
function loadSettingsUI() {
  document.getElementById('setBasic').value = settings.basic || 20000;
  document.getElementById('setPension').value = settings.pension || 0;
  document.getElementById('setOtherDed').value = settings.otherDed || 0;
  document.getElementById('setTheme').value = settings.theme || 'dark';
  document.getElementById('setTargetMonth').value = currentMonthKey();
  document.getElementById('setMonthTarget').value = getMonthTarget(currentMonthKey());
  setTheme(settings.theme || 'dark');
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('sec-' + tab.dataset.tab).classList.add('active');
  });
});
document.getElementById('dealType').addEventListener('change', () => renderFiChecks());
document.getElementById('dealForm').addEventListener('submit', addDeal);

document.getElementById('dealDate').valueAsDate = new Date();
renderFiChecks();
loadSettingsUI();
refreshAll();
initSupabase();
