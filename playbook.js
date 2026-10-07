function renderFiConversion() {
  const el = document.getElementById('fiConversion');
  if (!el) return;
  const nowKey = currentMonthKey();
  const monthDeals = deals.filter(d => monthKey(d.deliveryDate) === nowKey);
  if (!monthDeals.length) {
    el.innerHTML = '<span style="color:var(--muted)">Log delivered deals this month to see F&amp;I conversion.</span>';
    return;
  }
  const products = [
    { key:'finance', label:'Finance', types:['new-retail','new-motab','used'] },
    { key:'paint', label:'Paint', types:['new-retail','new-motab','used'] },
    { key:'refresh', label:'Refresh', types:['new-retail','new-motab','used'] },
    { key:'warranty', label:'Warranty', types:['new-retail','new-motab','used'] },
    { key:'carepack', label:'Motability Care Pack', types:['new-retail','new-motab'] },
    { key:'assurance', label:'Assurance Upgrade', types:['used'] }
  ];
  let html = '';
  products.forEach(p => {
    const pool = monthDeals.filter(d => p.types.includes(d.type));
    if (!pool.length) return;
    const sold = pool.filter(d => (d.fi || []).includes(p.key)).length;
    const pct = Math.round((sold / pool.length) * 100);
    html += '<div class="fi-row"><div><strong style="color:var(--text)">' + p.label + '</strong> <span style="color:var(--muted);font-size:0.75rem">' + sold + '/' + pool.length + '</span></div><span style="font-weight:700">' + pct + '%</span></div><div class="fi-bar"><div class="fi-fill" style="width:' + Math.min(100,pct) + '%"></div></div>';
  });
  el.innerHTML = html || '<span style="color:var(--muted)">No eligible deals yet.</span>';
}

function renderFireNote() {
  const el = document.getElementById('fireNote');
  if (!el) return;
  const key = currentMonthKey();
  const stats = monthStats(key);
  const target = monthTarget(key);
  if (target === null) {
    el.innerHTML = 'Monthly unit target has not been entered.';
    return;
  }
  const delta = stats.units - target;
  el.innerHTML = delta >= 0
    ? '<strong>Target met.</strong> ' + (delta ? delta + ' above the recorded target.' : '')
    : '<strong>' + Math.abs(delta) + ' more unit' + (Math.abs(delta) === 1 ? '' : 's') + '</strong> to reach the recorded monthly target.';
}

function renderWeeklyReminder() {
  const el = document.getElementById('weeklyReminder');
  if (!el) return;
  const key = currentMonthKey();
  const stats = monthStats(key);
  const target = monthTarget(key);
  if (target === null) {
    el.innerHTML = 'Monthly unit target has not been entered.';
    return;
  }
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - today.getDate() + 1;
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  const remaining = Math.max(0, target - stats.units);
  const perWeek = remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  el.innerHTML = remaining === 0
    ? 'Monthly target met. Focus on customer work and clean handovers.'
    : 'Need <strong>' + remaining + ' more unit' + (remaining === 1 ? '' : 's') + '</strong> this month — roughly <strong>' + perWeek + ' this week</strong>.';
}

window._exportPDFImpl = function() {
  const key = currentMonthKey();
  const stats = monthStats(key);
  const target = monthTarget(key);
  const rows = deals
    .filter(d => monthKey(d.deliveryDate) === key || monthKey(d.orderDate) === key)
    .sort((a,b) => (a.orderDate || a.deliveryDate || a.leadDate || '').localeCompare(b.orderDate || b.deliveryDate || b.leadDate || ''))
    .map(d => {
      const commission = eventDefs(d).reduce((sum,e) => sum + eligibleEvent(d,e), 0);
      const type = d.type === 'used' ? 'Used' : d.type === 'new-motab' ? 'New Motability' : 'New Retail';
      const date = d.orderDate || d.deliveryDate || d.leadDate || '';
      return '<tr><td>' + date + '</td><td>' + (d.customer||'') + '</td><td>' + type + '</td><td>' + (STAGE_LABELS[d.stage] || d.stage || '') + '</td><td>£' + Math.round(commission).toLocaleString('en-GB') + '</td></tr>';
    }).join('');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write('<!DOCTYPE html><html><head><title>Pentagon ' + monthLabel(key) + '</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:800px;margin:0 auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}th{font-size:10px;text-transform:uppercase;color:#666}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>Pentagon Motor Group — Monthly summary</h1><p>' + monthLabel(key) + '</p><p><strong>Delivered:</strong> ' + stats.units + (target === null ? '' : ' / ' + target) + ' &nbsp; <strong>Adjusted commission:</strong> £' + Math.round(stats.earned).toLocaleString('en-GB') + '</p><table><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Stage</th><th>Commission</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">No deals</td></tr>') + '</tbody></table></body></html>');
  w.document.close();
};

const PLAY = {
  route: {
    title: 'Full sales route',
    body: '<div class="play-line"><strong>1. Prepare</strong> — Decide the outcome and the next step before you engage.</div><div class="play-line"><strong>2. Welcome</strong> — Energy, acknowledgement, eye contact, useful opening.</div><div class="play-line"><strong>3. Rapport</strong> — Listen more than you talk.</div><div class="play-line"><strong>4. Discover</strong> — Purpose, priorities, trigger, conclusions, flexibility, timeline.</div><div class="play-line"><strong>5. Showcase value</strong> — Feature → benefit → small agreement.</div><div class="play-line"><strong>6. Keep leadership</strong> — Acknowledge → answer → redirect.</div><div class="play-line"><strong>7. Appraise / qualify</strong> — Part exchange and funding.</div><div class="play-line"><strong>8. Create desire</strong> — Test drive / video.</div><div class="play-line"><strong>9. Ask for a decision</strong> — Buying signals, invitation, micro commitments.</div><div class="play-line"><strong>10. Secure next action</strong> — Appointment, order, deposit, finance step.</div><div class="play-line" style="margin-top:0.75rem;color:var(--green)"><strong>Remember:</strong> Do not close out of nowhere. Make each next step clear and easy.</div>'
  },
  discovery: {
    title: 'Discovery — diagnose before you prescribe',
    body: '<div class="play-line"><strong>P</strong> — What is the main Purpose the car will serve?</div><div class="play-line"><strong>I</strong> — What features are most Important?</div><div class="play-line"><strong>T</strong> — What Triggered your interest?</div><div class="play-line"><strong>C</strong> — What Conclusions from your research?</div><div class="play-line"><strong>H</strong> — How important is [feature]?</div><div class="play-line"><strong>Safety net:</strong> "What other aspects have not yet been discussed that I should know about?"</div><div class="play-line" style="margin-top:0.5rem">Separate needs from wants. Test flexibility without compromising the real need.</div>'
  },
  fi: {
    title: 'F&I Buyology',
    body: '<div class="play-line">Place funding talk after appraisal — when you already know their situation.</div><div class="play-line"><strong>Openers:</strong> "Are there any payments outstanding?" · "Have you got a current settlement figure?"</div><div class="play-line"><strong>Mileage bridge:</strong> "What\'s your annual mileage?" → connect to funding structure.</div><div class="play-line"><strong>Products:</strong> "If I could show you a way to [benefit], would you be interested after we have [later stage]?"</div><div class="play-line" style="margin-top:0.5rem;color:var(--yellow)">Your tracker target: <strong>35%+ conversion</strong> on each product.</div>'
  },
  invite: {
    title: 'Invitation to buy',
    body: '<div class="play-line"><strong>Buy question:</strong> "If I can get a price for your car you are happy with and a monthly payment you are happy with, would you like to go ahead?"</div><div class="play-line"><strong>Micro commitment:</strong> "I\'m going to ask [manager] to create a tailor-made offer, OK?"</div><div class="play-line"><strong>Moving forward:</strong> "Whose name would you like on the V5C?"</div><div class="play-line"><strong>Deposit:</strong> "We ask for a reservation to take a vehicle off sale. Debit or credit card?"</div>'
  },
  scripts: {
    title: 'Script library (say it naturally)',
    body: '<div class="play-line"><strong>Just looking:</strong> "No problem… when you see a car you like, look for me. Out of interest, are you looking for a new car?"</div><div class="play-line"><strong>Feature → benefit:</strong> "This model is fitted with [feature], which means [benefit]. That\'s useful, isn\'t it?"</div><div class="play-line"><strong>Appraisal:</strong> "We could be very interested in your car. Would you like me to appraise it while you are here?"</div><div class="play-line"><strong>Flex:</strong> "Would you be open to the idea of…"</div><div class="play-line"><strong>Leadership:</strong> Acknowledge → answer → redirect to the route.</div>'
  },
  phone: {
    title: 'Phone Power',
    body: '<div class="play-line"><strong>Route:</strong> Buyer first → Experience → Discovery → Clarity → Forward step → Appointment/deposit → Confirmation</div><div class="play-line"><strong>Straight line:</strong> Acknowledge → reassure → answer → redirect → forward question.</div><div class="play-line">Confirm time, purpose, arrival experience and the next step specifically.</div>'
  },
  video: {
    title: 'Video — four-phase model',
    body: '<div class="play-line"><strong>1. Plan</strong> — Outcome, trigger, message, next step.</div><div class="play-line"><strong>2. Personalise</strong> — Made for them.</div><div class="play-line"><strong>3. Showcase value</strong> — Not a feature dump.</div><div class="play-line"><strong>4. Call to action</strong> — Clear next step.</div><div class="play-line" style="margin-top:0.5rem">30–90 seconds. Start with the customer, not the camera.</div>'
  },
  check: {
    title: 'Quick checklists',
    body: '<div class="play-line"><strong>Before:</strong> Next action · Trigger known · Vehicle ready · Key questions in mind</div><div class="play-line"><strong>Welcome:</strong> Acknowledge · Eye contact · Useful intro · Low-friction question</div><div class="play-line"><strong>Discovery:</strong> Purpose · Features · Trigger · Conclusions · Needs vs wants · Safety-net</div><div class="play-line"><strong>Presentation:</strong> Feature→benefit · Self-discover · PX natural</div><div class="play-line"><strong>PX / F&amp;I:</strong> Customer involved · Finance explored · Products interest registered</div><div class="play-line"><strong>Invite:</strong> Three positives · Invitation · Concrete next action</div>'
  }
};

function showPlay(key) {
  const p = PLAY[key] || PLAY.route;
  const h = document.querySelector('#playContent h2');
  const b = document.getElementById('playBody');
  if (h) h.textContent = p.title;
  if (b) b.innerHTML = p.body;
}

if (document.getElementById('playBody')) showPlay('route');
refreshAll();
