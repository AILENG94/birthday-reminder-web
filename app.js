'use strict';
// Birthday Reminder (web version). Everything runs in the browser; data is kept in this browser's storage only.
(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.prototype.slice.call(el.querySelectorAll(s));
  const STORE = 'birthday-reminder.v1';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const DEFAULTS = {
    senderName: 'Ai Leng', lookAheadDays: 7, lookBackDays: 3, dueSoonDays: 30, longOverdueDays: 31, staleListingDays: 7,
    milestoneAges: [18, 21, 30, 40, 50, 60, 70, 80, 90, 100], nameOnOwnPictures: 'bottom',
    ageGroups: [
      { folder: 'young', label: 'Young (up to 29)', maxAge: 29, designs: ['balloons', 'sunset'] },
      { folder: 'adult', label: 'Adult (30-49)', maxAge: 49, designs: ['garden', 'sunset', 'balloons'] },
      { folder: 'mature', label: 'Mature (50-64)', maxAge: 64, designs: ['garden', 'elegant', 'sunset'] },
      { folder: 'senior', label: 'Senior (65+)', maxAge: 200, designs: ['longevity', 'elegant', 'garden'] },
    ],
  };

  // ---------- shared app logic (same files as the PC app), loaded with a tiny CommonJS shim ----------
  const STUBS = {
    fs: { existsSync: () => false, readFileSync() { throw new Error('not available'); }, writeFileSync() {}, appendFileSync() {} },
    path: { basename: (s) => String(s).split(/[\\/]/).pop(), join: (...a) => a.join('/') },
    child_process: { execFileSync() { throw new Error('not available'); } },
  };
  const MODS = {};
  const req = (n) => STUBS[n] || MODS[n.replace(/^\.\//, '')];
  for (const n of ['util', 'contacts', 'parse', 'analyse']) {
    const src = await (await fetch('lib/' + n + '.js')).text();
    const m = { exports: {} };
    new Function('require', 'module', 'exports', src)(req, m, m.exports);
    MODS[n] = m.exports;
  }
  const U = MODS.util, C = MODS.contacts, PZ = MODS.parse, A = MODS.analyse;
  const templates = await (await fetch('templates.json')).json();
  const PIC = await (await fetch('pictures/pictures.json')).json();

  // ---------- storage ----------
  const blank = () => ({ listings: [], contacts: [], actions: {}, log: [], settings: {} });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(STORE) || 'null') || {}); } catch (e) { S = blank(); }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); return true; }
    catch (e) { toast('Could not save in this browser (' + e.name + '). Private/incognito windows do not keep data.'); return false; }
  }
  const cfg = () => Object.assign({}, DEFAULTS, S.settings);

  let toastT;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200); }
  const esc = U.esc;

  // ---------- loading ePartner PDFs ----------
  $('#pdfIn').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files); e.target.value = '';
    for (const f of files) {
      try {
        toast('Reading ' + f.name + '…');
        const l = PZ.parseListingText(await window.pdfToText(f), f.name);
        if (!l.records.length) { alert(f.name + ': no policy records could be read.\n\n' + l.issues.map((i) => '• ' + i.msg).join('\n')); continue; }
        S.listings = S.listings.filter((x) => x.meta.sourceFile !== f.name);
        S.listings.push({ meta: l.meta, records: l.records.map((r) => Object.assign({}, r, { raw: '' })), issues: l.issues });
        logEvent('listing', `${f.name}: ${l.records.length}/${l.meta.expectedRecords} records, as at ${l.meta.asAt || '?'}`);
        toast(`${f.name}: ${l.records.length} policies read`);
      } catch (err) { alert('Could not read ' + f.name + ': ' + err.message); }
    }
    save(); run();
  });

  function logEvent(action, detail, extra) {
    S.log.push(Object.assign({ at: U.nowStamp(), action, detail }, extra || {}));
    if (S.log.length > 1000) S.log = S.log.slice(-1000);
  }

  // New clients from the listings are added to contacts automatically (never overwriting what you typed).
  function syncContacts(listings) {
    const seen = new Set();
    for (const l of listings) for (const r of l.records) {
      const k = r.holder + '|' + r.dob;
      if (seen.has(k)) continue; seen.add(k);
      const client = { holder: r.holder, dob: r.dob };
      if (C.matchContact(S.contacts, client)) continue;
      const [y, m, d] = r.dob.split('-');
      const dead = l.records.some((p) => p.holder === r.holder && p.dob === r.dob && /death/i.test(p.statusDetail) && p.lifeAssured === p.holder);
      S.contacts.push({ name: r.holder, dobRaw: `${d}/${m}/${y}`, preferred: C.suggestPreferredName(r.holder), phoneRaw: '', langRaw: 'EN', skip: dead, notes: dead ? 'Deceased per policy listing - do not contact' : '' });
    }
  }

  // ---------- daily check ----------
  let R = null;
  function run() {
    const c = cfg();
    const listings = S.listings.filter((l) => l.records.length);
    syncContacts(listings); save();
    if (!listings.length) { renderWelcome(); return; }
    R = A.analyse({ listings, parseIssues: S.listings.flatMap((l) => l.issues || []), contacts: S.contacts,
      actionState: new Map(Object.entries(S.actions)), runDate: U.todayLocal(), cfg: c, templates });
    R.warnings = R.warnings.map((w) => w.replace(/into the input folder/g, 'and add it with "Add ePartner PDF"'));
    const noPhone = R.birthdays.filter((b) => !b.phone && b.delta <= 0).length;
    if (noPhone) R.warnings.push(`${noPhone} birthday(s) due now have no WhatsApp number yet. Type it on the card, or use Contacts.`);
    render(R, c);
  }

  function renderWelcome() {
    $('#meta').innerHTML = `<strong>${esc(U.fmtDate(U.todayLocal(), true))}</strong>`;
    $('#main').innerHTML = `<section class="welcome">
      <h2>Welcome 👋</h2>
      <p>Add your Great Eastern ePartner <strong>Policy Listing</strong> PDF (e.g. this month's birthday listing) to start. The app will:</p>
      <ul><li>list birthdays due today, missed in the last few days, and coming up, each with a ready message and picture;</li>
      <li>flag overdue premiums, lapsed policies and other unusual items;</li>
      <li>show premiums falling due in the next 30 days.</li></ul>
      <p>🔒 The PDF is read <strong>on this device</strong> and nothing is uploaded. Data is kept in this browser only.</p>
      <label class="btn primary">＋ Add ePartner PDF<input type="file" accept=".pdf,application/pdf" multiple hidden onchange="document.getElementById('pdfIn').files=this.files;document.getElementById('pdfIn').dispatchEvent(new Event('change'))"></label>
    </section>`;
  }

  // ---------- rendering ----------
  const SEV = { High: 'sev-high', Medium: 'sev-med', Low: 'sev-low', Info: 'sev-info' };
  const LANG_LABEL = { EN: 'English', ZH: '中文', BM: 'Bahasa Melayu' };
  function when(b) {
    if (b.category === 'today') return 'Today';
    if (b.category === 'belated') return `${-b.delta} day${b.delta === -1 ? '' : 's'} ago — belated`;
    return b.delta === 1 ? 'Tomorrow' : `In ${b.delta} days`;
  }
  function card(b) {
    const tag = b.category === 'today' ? 'tag-today' : b.category === 'belated' ? 'tag-late' : 'tag-soon';
    return `<article class="card bday" data-key="${esc(b.key)}" data-year="${b.year}" data-holder="${esc(b.holder)}" data-phone="${esc(b.phone || '')}"
      data-preferred="${esc(b.preferred)}" data-lang="${esc(b.lang)}" data-age="${b.turning}" data-kind="${b.category === 'belated' ? 'belated' : 'today'}"
      data-sendable="${b.delta <= 0 ? '1' : '0'}" data-senddate="${esc(U.fmtDate(b.birthday))}" data-state="${esc(b.state)}">
      <header class="card-head"><div><h3>${esc(b.holder)}</h3>
        <div class="sub">${esc(U.fmtDate(b.birthday, true))} · turning ${b.turning}${b.milestone ? ' <span class="star">★ milestone</span>' : ''}</div></div>
        <span class="tag ${tag}">${esc(when(b))}</span></header>
      <dl class="facts">
        <div><dt>Greeting name</dt><dd>${esc(b.preferred)}</dd></div>
        <div><dt>Language</dt><dd>${esc(LANG_LABEL[b.lang])}</dd></div>
        <div><dt>WhatsApp</dt><dd class="fact-phone">${b.phone ? '+' + esc(b.phone) : '<span class="warn-text">not added</span>'}</dd></div>
        <div><dt>Policies</dt><dd>${b.inforceCount} in force / ${b.policyCount} total</dd></div>
      </dl>
      ${b.notes.filter((n) => !/contacts\.csv|was guessed/.test(n)).length ? `<ul class="notes">${b.notes.filter((n) => !/contacts\.csv|was guessed/.test(n)).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="pic"><canvas width="1080" height="1080" aria-label="Birthday picture for ${esc(b.holder)}"></canvas>
        <div class="pic-btns">
          <button class="btn ghost" data-act="nextpic">Change picture</button>
          <button class="btn ghost" data-act="savepic">Download</button>
          <label class="small namepos-wrap">Name <select class="namepos"><option value="bottom">Bottom</option><option value="top">Top</option><option value="off">Off</option></select></label>
          <span class="pic-name"></span>
        </div></div>
      <label class="small wording">Wording <select class="variant"></select></label>
      <textarea class="msg" rows="6" aria-label="Message to ${esc(b.holder)}">${esc(b.message)}</textarea>
      <div class="phone-entry" hidden><input type="tel" class="phone-in" placeholder="WhatsApp number, e.g. 012-345 6789"><button class="btn" data-act="savephone">Save number</button></div>
      <div class="actions">
        <span class="status-pill"></span>
        <button class="btn wa" data-act="send">Send via WhatsApp</button>
        <button class="btn" data-act="chat">Open chat</button>
        <button class="btn primary" data-act="approve">Approve now</button>
        <button class="btn" data-act="sent">Mark as sent</button>
        <button class="btn ghost" data-act="copy">Copy text</button>
        <button class="btn ghost" data-act="skip">Skip</button>
        <button class="btn ghost" data-act="undo">Undo</button>
      </div></article>`;
  }
  const alertRows = (list) => list.map((a) => `<tr><td><span class="sev ${SEV[a.severity]}">${a.severity}</span></td><td><strong>${esc(a.type)}</strong></td>
    <td>${esc(a.holder)}</td><td class="mono">${esc(a.policyNo)}</td><td>${esc(a.detail)}</td><td>${esc(a.action)}</td></tr>`).join('');
  const alertHead = '<tr><th>Priority</th><th>Issue</th><th>Client</th><th>Policy</th><th>Details</th><th>Suggested next step</th></tr>';

  function render(r, c) {
    const now = r.birthdays.filter((b) => b.delta <= 0), soon = r.birthdays.filter((b) => b.delta > 0);
    const main = r.alerts.filter((a) => a.severity === 'High' || a.severity === 'Medium'), minor = r.alerts.filter((a) => a.severity === 'Low' || a.severity === 'Info');
    const f = r.forecast, high = r.alerts.filter((a) => a.severity === 'High').length;
    $('#meta').innerHTML = `<strong>${esc(U.fmtDate(r.runDate, true))}</strong><br>Listing data as at ${esc(U.fmtDate(r.ref))}`;
    $('#main').innerHTML = `
      ${r.warnings.length ? `<div class="banner"><strong>Please check:</strong><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <section class="kpis">
        <div class="kpi"><div class="n">${now.filter((b) => b.category === 'today').length}</div><div class="l">Birthdays today</div></div>
        <div class="kpi ${now.some((b) => b.category === 'belated') ? 'alert' : ''}"><div class="n">${now.filter((b) => b.category === 'belated').length}</div><div class="l">Missed (last ${c.lookBackDays} days)</div></div>
        <div class="kpi"><div class="n">${soon.length}</div><div class="l">Coming up (next ${c.lookAheadDays} days)</div></div>
        <div class="kpi ${high ? 'alert' : ''}"><div class="n">${high}</div><div class="l">High-priority policy alerts</div></div>
        <div class="kpi"><div class="n">${esc(U.fmtRM(f.dueTotal))}</div><div class="l">Premiums due by ${esc(U.fmtDate(f.windowEnd))}</div></div>
      </section>
      <h2>1 · Birthday messages</h2>
      <p class="lead">${isMobile ? 'Tap <strong>Send via WhatsApp</strong>, choose <strong>WhatsApp</strong> and the client: the picture and message go together. Press Send, then come back and tap <strong>Mark as sent</strong>.'
        : 'Click <strong>Send via WhatsApp</strong>: the picture downloads and the client\'s chat opens with the message typed. Attach the picture (📎), press Send, then click <strong>Mark as sent</strong>.'}</p>
      ${now.length ? `<div class="grid">${now.map(card).join('')}</div>` : '<div class="empty">No birthdays to send today.</div>'}
      <h2>2 · Coming up</h2>
      <p class="lead">Check these in advance. On the day, the Send button appears.</p>
      ${soon.length ? `<div class="grid">${soon.map(card).join('')}</div>` : '<div class="empty">No birthdays in the next few days from the loaded listings.</div>'}
      ${r.excluded.length ? `<details><summary>Not messaged (${r.excluded.length})</summary><div class="table-scroll"><table><tr><th>Client</th><th>Birthday</th><th>Reason</th></tr>${r.excluded.map((e) => `<tr><td>${esc(e.holder)}</td><td>${esc(U.fmtDate(e.birthday))}</td><td>${esc(e.reason.replace('contacts.csv', 'Contacts'))}</td></tr>`).join('')}</table></div></details>` : ''}
      <h2>3 · Policy alerts</h2>
      <p class="lead">Most urgent first. Overdue counts use the listing date (${esc(U.fmtDate(r.ref))}); check ePartner for later payments.</p>
      ${main.length ? `<div class="table-scroll"><table>${alertHead}${alertRows(main)}</table></div>` : '<div class="empty">No high or medium alerts.</div>'}
      ${minor.length ? `<details><summary>For information (${minor.length})</summary><div class="table-scroll"><table>${alertHead}${alertRows(minor)}</table></div></details>` : ''}
      <h2>4 · Premium forecast</h2>
      <p class="lead">Only clients in the loaded listing(s).</p>
      <div class="two"><div class="table-scroll"><table>
        <tr><th>Measure</th><th class="num">Amount</th></tr>
        <tr><td>Premiums due ${esc(U.fmtDate(f.ref))} – ${esc(U.fmtDate(f.windowEnd))}</td><td class="num">${esc(U.fmtRM(f.dueTotal))}</td></tr>
        <tr><td>· auto-debit</td><td class="num">${esc(U.fmtRM(f.dueAuto))}</td></tr>
        <tr><td>· manual (cash / cheque)</td><td class="num">${esc(U.fmtRM(f.dueManual))}</td></tr>
        <tr><td>Annualised premium in force (${f.inforcePolicies})</td><td class="num">${esc(U.fmtRM(f.inforceAP))}</td></tr>
        <tr><td>Annualised premium, overdue (${f.overdueCount})</td><td class="num">${esc(U.fmtRM(f.overdueAP))}</td></tr>
        <tr><td>Annualised premium, lapsed (${f.lapsedCount})</td><td class="num">${esc(U.fmtRM(f.lapsedAP))}</td></tr></table></div>
        <div class="table-scroll"><table><tr><th>Due</th><th>Client</th><th>Policy</th><th>Mode</th><th class="num">Premium</th></tr>
        ${f.dueNext.map((d) => `<tr><td>${esc(U.fmtDate(d.due))}</td><td>${esc(d.holder)}</td><td class="mono">${esc(d.policyNo)}</td><td>${esc(d.mode)} · ${esc(d.method)}${d.auto ? '' : ' <span class="sev sev-med">manual</span>'}</td><td class="num">${esc(U.fmtRM(d.amount))}</td></tr>`).join('') || '<tr><td colspan="5">Nothing due.</td></tr>'}
        </table></div></div>
      <h2>5 · Data check</h2>
      <p class="lead">Read ${r.stats.policies} policies for ${r.stats.clients} clients from ${r.stats.listings} listing(s). Rows that could not be read with confidence are listed here and left out.</p>
      ${r.issues.length ? `<div class="table-scroll"><table><tr><th>Priority</th><th>Policy</th><th>Issue</th></tr>${r.issues.map((i) => `<tr><td><span class="sev ${SEV[i.severity]}">${i.severity}</span></td><td class="mono">${esc(i.policyNo)}</td><td>${esc(i.msg)}</td></tr>`).join('')}</table></div>` : '<div class="empty">✓ All rows read cleanly. Record count matches the listing.</div>'}`;
    $$('.card.bday').forEach(initCard);
  }

  // ---------- pictures ----------
  const GROUPS = DEFAULTS.ageGroups;
  const asFile = (f) => 'file:' + f;
  const ALL_OWN = GROUPS.reduce((a, g) => a.concat(PIC[g.folder] || []), (PIC.any || []).slice()).map(asFile);
  const BUILTIN = window.BUILTIN_DESIGNS;
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  const groupFor = (age) => GROUPS.find((g) => age <= g.maxAge) || GROUPS[GROUPS.length - 1];
  function suitsLang(f, lang) { const m = /\.([a-z]{2}(?:-[a-z]{2})*)\.[a-z0-9]+$/i.exec(f); return !m || m[1].toUpperCase().split('-').indexOf(lang) >= 0; }
  function picsFor(el) {
    const g = groupFor(+el.dataset.age), lang = el.dataset.lang, fits = (f) => suitsLang(f, lang);
    const mine = (PIC[g.folder] || []).filter(fits).map(asFile), any = (PIC.any || []).filter(fits).map(asFile);
    const built = g.designs.filter((d) => d !== 'longevity' || lang === 'ZH').map((d) => 'builtin:' + d);
    const pool = mine.length ? mine : any.length ? any : built;
    return { group: g, pool, all: pool.concat(ALL_OWN.concat(BUILTIN).filter((x) => pool.indexOf(x) < 0)) };
  }
  function drawPic(el) {
    const id = el.dataset.pic, own = id.indexOf('file:') === 0;
    el.querySelector('.pic-name').textContent = (own ? 'Picture: ' + id.slice(5).split('/').pop().split('.')[0] : 'Design: ' + id.slice(8)) + ' · ' + el._pics.group.label;
    el.querySelector('.namepos-wrap').hidden = !own;
    el._blob = null;
    const cv = el.querySelector('canvas');
    window.drawBirthdayCard(cv, id, { name: el.dataset.preferred, lang: el.dataset.lang, sender: cfg().senderName, namePos: el.dataset.namepos },
      () => cv.toBlob((b) => { el._blob = b; }, 'image/png'));
  }
  const picRecord = (el) => el.dataset.pic + (el.dataset.pic.indexOf('file:') === 0 ? '#' + el.dataset.namepos : '');

  // ---------- wording ----------
  const fill = (text, el) => text.replace(/\{name\}/g, el.dataset.preferred).replace(/\{sender\}/g, cfg().senderName);
  const tmplList = (l, k) => A.templateList(templates, l, k);
  function buildWording(el) {
    const sel = el.querySelector('.variant'), kind = el.dataset.kind;
    const langs = [el.dataset.lang].concat(['EN', 'ZH', 'BM'].filter((l) => l !== el.dataset.lang));
    let html = '';
    for (const l of langs) {
      html += `<optgroup label="${LANG_LABEL[l]}">`;
      for (const k of kind === 'belated' ? ['belated', 'today'] : ['today']) tmplList(l, k).forEach((v, i) => { html += `<option value="${l}|${k}|${i}">${esc(v.label)}</option>`; });
      html += '</optgroup>';
    }
    sel.innerHTML = html + '<option value="custom">Your own edited text</option>';
    syncWording(el);
  }
  const variantText = (el, val) => { const p = val.split('|'); return fill(tmplList(p[0], p[1])[+p[2]].text, el); };
  function syncWording(el) {
    const sel = el.querySelector('.variant'), msg = el.querySelector('textarea').value;
    const hit = Array.from(sel.options).find((o) => o.value !== 'custom' && variantText(el, o.value) === msg);
    sel.value = hit ? hit.value : 'custom';
  }

  // ---------- card state & actions ----------
  function pill(el) {
    const s = el.dataset.state, d = el.dataset.senddate;
    if (s === 'sent') return 'Sent ✓';
    if (s === 'skipped') return 'Skipped';
    if (s === 'opened') return 'Opened in WhatsApp — press Send there';
    if (el.dataset.sendable !== '1') return s === 'approved' ? 'Approved — send on ' + d : 'Due ' + d;
    return el.dataset.phone || isMobile ? 'Ready to send' : 'Add a WhatsApp number to send';
  }
  function paint(el) {
    const s = el.dataset.state, sendable = el.dataset.sendable === '1', phone = el.dataset.phone, done = s === 'sent' || s === 'skipped';
    const q = (a) => el.querySelector(`[data-act="${a}"]`);
    el.querySelector('.status-pill').textContent = pill(el);
    q('send').hidden = done || !sendable || (!phone && !isMobile);
    q('send').textContent = s === 'opened' ? 'Send again' : 'Send via WhatsApp';
    q('chat').hidden = done || !sendable || !phone || !isMobile;
    q('approve').hidden = done || sendable || s === 'approved';
    q('sent').hidden = done || !sendable;
    q('skip').hidden = done;
    q('undo').hidden = !done;
    el.querySelector('.phone-entry').hidden = done || !!phone;
    el.querySelector('textarea').readOnly = done;
  }
  function setState(el, action) {
    const k = el.dataset.key + '|' + el.dataset.year, msg = el.querySelector('textarea').value;
    el.dataset.state = action === 'reopened' ? 'new' : action;
    S.actions[k] = { action, message: msg, picture: picRecord(el), at: U.nowStamp() };
    logEvent(action, el.dataset.holder, { year: el.dataset.year, phone: el.dataset.phone, picture: picRecord(el), message: msg });
    save(); paint(el);
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const picName = (el) => 'Birthday - ' + el.dataset.preferred + '.png';
  const chatUrl = (el, msg) => 'https://wa.me/' + el.dataset.phone + (msg ? '?text=' + encodeURIComponent(msg) : '');

  async function send(el) {
    const msg = el.querySelector('textarea').value;
    if (!msg.trim()) { toast('Message is empty'); return; }
    const blob = el._blob;
    if (isMobile && blob && navigator.canShare) {
      const file = new File([blob], picName(el), { type: 'image/png' });
      if (navigator.canShare({ files: [file], text: msg })) {
        try {
          setState(el, 'approved');
          await navigator.share({ files: [file], text: msg });
          setState(el, 'opened'); toast('Done? Tap "Mark as sent".');
        } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed: ' + e.message); }
        return;
      }
    }
    if (!el.dataset.phone) { toast('Add the WhatsApp number first'); return; }
    setState(el, 'approved');
    if (blob) download(blob, picName(el));
    window.open(chatUrl(el, msg), '_blank');
    setState(el, 'opened');
    toast('Picture downloaded — attach it in WhatsApp (📎), then press Send');
  }

  function initCard(el) {
    el._pics = picsFor(el);
    const st = S.actions[el.dataset.key + '|' + el.dataset.year];
    const saved = st && st.picture ? st.picture.split('#') : [];
    el.dataset.pic = saved[0] && el._pics.all.indexOf(saved[0]) >= 0 ? saved[0] : el._pics.pool[hash(el.dataset.key + '|' + el.dataset.year) % el._pics.pool.length];
    el.dataset.namepos = saved[1] || cfg().nameOnOwnPictures;
    el.querySelector('.namepos').value = el.dataset.namepos;
    drawPic(el); buildWording(el); paint(el);
    const unapprove = () => { if (el.dataset.state === 'approved' || el.dataset.state === 'opened') { el.dataset.state = 'new'; paint(el); } };
    el.querySelector('textarea').addEventListener('input', () => { unapprove(); syncWording(el); });
    el.querySelector('.variant').addEventListener('change', function () {
      if (this.value === 'custom' || el.dataset.state === 'sent' || el.dataset.state === 'skipped') { syncWording(el); return; }
      el.querySelector('textarea').value = variantText(el, this.value); unapprove();
    });
    el.querySelector('.namepos').addEventListener('change', function () { el.dataset.namepos = this.value; drawPic(el); unapprove(); });
    el.querySelector('.phone-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('[data-act="savephone"]').click(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.act, msg = el.querySelector('textarea').value;
      if (a === 'nextpic' && el.dataset.state !== 'sent') { const all = el._pics.all; el.dataset.pic = all[(all.indexOf(el.dataset.pic) + 1) % all.length]; drawPic(el); unapprove(); }
      if (a === 'savepic') { if (el._blob) download(el._blob, picName(el)); }
      if (a === 'send') send(el);
      if (a === 'chat') { window.open(chatUrl(el, ''), '_blank'); }
      if (a === 'approve') { setState(el, 'approved'); toast('Approved — ready on ' + el.dataset.senddate); }
      if (a === 'sent') setState(el, 'sent');
      if (a === 'skip' && confirm('Skip ' + el.dataset.holder + "'s birthday message?")) setState(el, 'skipped');
      if (a === 'undo') setState(el, 'reopened');
      if (a === 'copy') navigator.clipboard.writeText(msg).then(() => toast('Copied'), () => toast('Copy failed — select the text manually'));
      if (a === 'savephone') {
        const raw = el.querySelector('.phone-in').value.trim(), chk = C.normPhone(raw);
        if (!chk.phone) { toast(chk.problem); return; }
        const [holder, dob] = [el.dataset.key.slice(0, el.dataset.key.lastIndexOf('|')), el.dataset.key.slice(el.dataset.key.lastIndexOf('|') + 1)];
        const row = C.matchContact(S.contacts, { holder, dob });
        if (row) row.phoneRaw = raw;
        save(); el.dataset.phone = chk.phone; el.querySelector('.fact-phone').textContent = '+' + chk.phone; paint(el); toast('Number saved');
      }
    });
  }

  // ---------- contacts dialog ----------
  const dlgC = $('#dlgContacts');
  function contactsTable(filter) {
    const f = (filter || '').toUpperCase();
    const rows = S.contacts.map((c, i) => [c, i]).filter(([c]) => !f || c.name.toUpperCase().includes(f)).sort((a, b) => a[0].name.localeCompare(b[0].name));
    $('#cTable').innerHTML = '<tr><th>Client</th><th>DOB</th><th>Greeting name</th><th>WhatsApp number</th><th>Language</th><th>Skip</th></tr>' +
      rows.map(([c, i]) => `<tr data-i="${i}"><td>${esc(c.name)}</td><td class="mono">${esc(c.dobRaw)}</td>
        <td><input data-f="preferred" value="${esc(c.preferred)}"></td><td><input data-f="phoneRaw" type="tel" value="${esc(c.phoneRaw)}" placeholder="012-345 6789"></td>
        <td><select data-f="langRaw">${['EN', 'ZH', 'BM'].map((l) => `<option ${C.normLanguage(c.langRaw).lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><input data-f="skip" type="checkbox" ${c.skip ? 'checked' : ''}></td></tr>`).join('');
  }
  $('#btnContacts').addEventListener('click', () => { $('#cSearch').value = ''; contactsTable(''); dlgC.showModal(); });
  $('#cSearch').addEventListener('input', (e) => { collectContacts(); contactsTable(e.target.value); });
  function collectContacts() {
    $$('#cTable tr[data-i]').forEach((tr) => {
      const c = S.contacts[+tr.dataset.i];
      tr.querySelectorAll('[data-f]').forEach((inp) => { c[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value.trim(); });
    });
  }
  $('#cSave').addEventListener('click', () => {
    collectContacts();
    const bad = S.contacts.filter((c) => c.phoneRaw && !C.normPhone(c.phoneRaw).phone);
    if (bad.length && !confirm(`${bad.length} number(s) don't look like Malaysian mobiles (e.g. ${bad[0].name}: ${bad[0].phoneRaw}). Save anyway?`)) return;
    save(); dlgC.close(); run(); toast('Contacts saved');
  });
  $('#cExport').addEventListener('click', () => {
    collectContacts();
    const lines = [U.csvLine(['Client Name', 'DOB', 'Preferred Name', 'Phone', 'Language', 'Skip', 'Notes'])]
      .concat(S.contacts.map((c) => U.csvLine([c.name, c.dobRaw, c.preferred, c.phoneRaw, c.langRaw, c.skip ? 'Y' : '', c.notes])));
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }), 'contacts.csv');
  });
  // Import the PC app's contacts.csv: fills in matching clients, adds the rest.
  $('#cImport').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const rows = U.csvParse(await file.text());
    const head = (rows[0] || []).map((h) => h.trim().toLowerCase()), col = (n) => head.indexOf(n.toLowerCase());
    if (col('client name') < 0) { alert('This file has no "Client Name" column.'); return; }
    let n = 0;
    for (const r of rows.slice(1)) {
      const get = (k) => (col(k) >= 0 ? (r[col(k)] || '').trim() : '');
      const row = { name: C.normName(get('Client Name')), dobRaw: get('DOB'), preferred: get('Preferred Name'), phoneRaw: get('Phone'), langRaw: get('Language') || 'EN', skip: /^(y|yes|x|true|1)$/i.test(get('Skip')), notes: get('Notes') };
      if (!row.name) continue;
      const i = S.contacts.findIndex((c) => C.normName(c.name) === row.name && (!row.dobRaw || c.dobRaw === row.dobRaw));
      if (i >= 0) S.contacts[i] = Object.assign(S.contacts[i], row); else S.contacts.push(row);
      n++;
    }
    save(); contactsTable($('#cSearch').value); toast(n + ' contacts imported');
  });

  // ---------- settings dialog ----------
  const dlgS = $('#dlgSettings');
  function listingsInfo() {
    $('#sListings').innerHTML = S.listings.length ? '<table><tr><th>File</th><th>As at</th><th>Policies</th><th></th></tr>' + S.listings.map((l, i) =>
      `<tr><td>${esc(l.meta.sourceFile)}</td><td>${esc(U.fmtDate(l.meta.asAt))}</td><td>${l.records.length}</td><td><button class="btn ghost" data-rm="${i}">Remove</button></td></tr>`).join('') + '</table>'
      : '<p class="lead">No listings loaded yet.</p>';
  }
  $('#btnSettings').addEventListener('click', () => {
    const c = cfg();
    $('#sSender').value = c.senderName; $('#sAhead').value = c.lookAheadDays; $('#sBack').value = c.lookBackDays; $('#sNamePos').value = c.nameOnOwnPictures;
    listingsInfo(); dlgS.showModal();
  });
  $('#sListings').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    if (!confirm('Remove ' + S.listings[+b.dataset.rm].meta.sourceFile + ' from this browser?')) return;
    S.listings.splice(+b.dataset.rm, 1); save(); listingsInfo(); run();
  });
  $('#sSave').addEventListener('click', () => {
    const n = (v, lo, hi, d) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    S.settings = { senderName: $('#sSender').value.trim() || DEFAULTS.senderName, lookAheadDays: n($('#sAhead').value, 1, 31, 7),
      lookBackDays: n($('#sBack').value, 0, 14, 3), nameOnOwnPictures: $('#sNamePos').value };
    save(); dlgS.close(); run(); toast('Settings saved');
  });
  $('#sBackup').addEventListener('click', () => download(new Blob([JSON.stringify(S)], { type: 'application/json' }), `birthday-reminder-backup-${U.todayLocal()}.json`));
  $('#sRestore').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.listings) || !Array.isArray(data.contacts)) throw new Error('not a Birthday Reminder backup');
      if (!confirm('Replace the data in this browser with this backup?')) return;
      S = Object.assign(blank(), data); save(); dlgS.close(); run(); toast('Backup restored');
    } catch (err) { alert('Could not restore: ' + err.message); }
  });
  $('#sLog').addEventListener('click', () => {
    const lines = [U.csvLine(['Time', 'Action', 'Client / detail', 'Birthday Year', 'Phone', 'Picture', 'Message'])]
      .concat(S.log.map((l) => U.csvLine([l.at, l.action, l.detail, l.year, l.phone, l.picture, l.message])));
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }), 'send-log.csv');
  });
  $('#sClear').addEventListener('click', () => {
    if (!confirm('Delete ALL listings, contacts and history from this browser? Download a backup first if you need it.')) return;
    S = blank(); save(); dlgS.close(); run(); toast('All data deleted from this browser');
  });

  run();
})().catch((e) => { document.getElementById('main').innerHTML = '<div class="empty">Could not start: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>'; });
