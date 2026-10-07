function renderFiConversion() {
  const el = document.getElementById('fiConversion');
  if (!el) return;
  const nowKey = currentMonthKey();
  const monthDeals = deals.filter(d => monthKey(d.date) === nowKey);
  if (!monthDeals.length) {
    el.innerHTML = '<span style="color:var(--muted)">Log deals this month to track F&amp;I conversion vs 35%.</span>';
    return;
  }
  const products = [
    { key: 'finance', label: 'Finance', types: ['new-retail','new-motab','used'] },
    { key: 'paint', label: 'Paint', types: ['new-retail','new-motab','used'] },
    { key: 'refresh', label: 'Refresh', types: ['new-retail','new-motab','used'] },
    { key: 'warranty', label: 'Warranty', types: ['new-retail','new-motab','used'] },
    { key: 'carepack', label: 'Motab Care Pack', types: ['new-retail','new-motab'] },
    { key: 'assurance', label: 'Assurance Upgrade', types: ['used'] }
  ];
  const target = 35;
  let html = '';
  products.forEach(p => {
    const pool = monthDeals.filter(d => p.types.includes(d.type));
    if (!pool.length) return;
    const sold = pool.filter(d => (d.fi || []).includes(p.key)).length;
    const pct = Math.round((sold / pool.length) * 100);
    const col = pct >= target ? 'var(--green)' : (pct >= 20 ? 'var(--yellow)' : 'var(--red)');
    html += '<div class="fi-row"><div><strong style="color:var(--text)">' + p.label + '</strong> <span style="color:var(--muted);font-size:0.75rem">' + sold + '/' + pool.length + '</span></div><span style="color:' + col + ';font-weight:700">' + pct + '%</span></div><div class="fi-bar"><div class="fi-fill" style="width:' + Math.min(100,pct) + '%;background:' + col + '"></div></div>';
  });
  el.innerHTML = html || '<span style="color:var(--muted)">No eligible deals yet.</span>';
}

function renderFireNote() {
  const el = document.getElementById('fireNote');
  if (!el) return;
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  const target = getMonthTarget(nowKey);
  const surplus = stats.units - target;
  const basicM = (settings.basic || 20000) / 12;
  const th = estimateTakeHome((basicM + stats.comm) * 12) / 12;
  const commNeeded = settings._commNeeded || 2093;
  if (surplus > 0 && th >= 3000) {
    el.innerHTML = '<span class="crush">On fire.</span> Target beaten by ' + surplus + ' unit' + (surplus > 1 ? 's' : '') + ' and on track for £3k+ take-home.';
  } else if (surplus > 0) {
    el.innerHTML = '<span class="fire">Crushing it.</span> ' + surplus + ' over unit target. Keep the F&amp;I going.';
  } else if (th >= 3000) {
    el.innerHTML = '<span class="crush">Money on track.</span> Est. take-home already at £3k+. Nice.';
  } else if (stats.comm >= commNeeded * 0.75 && stats.units > 0) {
    el.innerHTML = '<span class="fire">Heating up.</span> Three-quarters of the way to the commission target.';
  } else if (stats.units === 0) {
    el.innerHTML = 'Fresh month. First deal of the day sets the tone.';
  } else {
    el.innerHTML = '';
  }
}

function renderWeeklyReminder() {
  const el = document.getElementById('weeklyReminder');
  if (!el) return;
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  const target = getMonthTarget(nowKey);
  const remaining = Math.max(0, target - stats.units);
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - today.getDate() + 1;
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  const perWeek = remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  if (remaining <= 0) {
    el.innerHTML = 'Unit target met for this month. Focus on F&amp;I and quality handovers.';
  } else {
    el.innerHTML = 'Need <strong style="color:var(--text)">' + remaining + ' more units</strong> this month — roughly <strong style="color:var(--text)">' + perWeek + ' this week</strong> (' + daysLeft + ' days left). You have got this.';
  }
}

window._exportPDFImpl = function() {
  const nowKey = currentMonthKey();
  const stats = getMonthStats(nowKey);
  const target = getMonthTarget(nowKey);
  const basicM = (settings.basic || 20000) / 12;
  const th = estimateTakeHome((basicM + stats.comm) * 12) / 12;
  const monthDeals = deals.filter(d => monthKey(d.date) === nowKey).sort((a,b) => a.date.localeCompare(b.date));
  const rows = monthDeals.map(d => {
    const c = calcDealComm(d);
    const type = d.type === 'used' ? 'Used' : d.type === 'new-motab' ? 'Motab' : 'New';
    return '<tr><td>' + d.date + '</td><td>' + (d.customer||'') + '</td><td>' + type + '</td><td>' + d.status + '</td><td>£' + c.total + '</td></tr>';
  }).join('');
  const w = window.open('', '_blank');
  w.document.write('<!DOCTYPE html><html><head><title>Pentagon ' + monthLabel(nowKey) + '</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:800px;margin:0 auto}h1{font-size:18px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:20px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}.box{border:1px solid #ddd;border-radius:8px;padding:12px}.box .n{font-size:22px;font-weight:700}.box .l{font-size:11px;color:#666}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}th{font-size:10px;text-transform:uppercase;color:#666}@media print{button{display:none}}</style></head><body><button onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;cursor:pointer">Print / Save as PDF</button><h1>Pentagon Motor Group — Monthly summary</h1><div class="sub">' + monthLabel(nowKey) + ' · Sales Consultant</div><div class="grid"><div class="box"><div class="n">' + stats.units + ' / ' + target + '</div><div class="l">Units</div></div><div class="box"><div class="n">£' + stats.comm.toLocaleString() + '</div><div class="l">Commission</div></div><div class="box"><div class="n">£' + Math.round(th).toLocaleString() + '</div><div class="l">Est. take-home</div></div></div><table><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Status</th><th>Comm</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">No deals</td></tr>') + '</tbody></table></body></html>');
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
