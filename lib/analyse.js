'use strict';
// Turns clean policy records into: birthday queue, policy alerts, premium forecast and data-quality notes.

const { addDays, diffDays, birthdayInYear, fmtDate, fmtRM } = require('./util');
const { matchContact, normPhone, normLanguage, suggestPreferredName } = require('./contacts');

const SEV_ORDER = { High: 0, Medium: 1, Low: 2, Info: 3 };
const AUTO_METHODS = new Set(['Credit Card', 'Debit Card', "Bank's Order", 'GIRO', 'Auto Debit', 'Direct Debit']);

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; }

// Template options as [{label, text, for}], accepting plain strings from older templates.json files.
function templateList(templates, lang, kind) {
  const list = ((templates[lang] || templates.EN) || {})[kind] || [];
  return list.map((v, i) => (typeof v === 'string' ? { label: `Version ${i + 1}`, text: v } : v));
}
const fillTemplate = (text, name, sender) => text.replace(/\{name\}/g, name).replace(/\{sender\}/g, sender);

function mergeRecords(listings) {
  // Same policy in two listings: keep the one from the newest listing.
  const byPolicy = new Map();
  for (const l of listings) for (const r of l.records) {
    const prev = byPolicy.get(r.policyNo);
    if (!prev || (r.asAt || '') > (prev.asAt || '')) byPolicy.set(r.policyNo, r);
  }
  return [...byPolicy.values()];
}

function groupClients(records, issues) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.holder}|${r.dob}`;
    if (!map.has(key)) map.set(key, { key, holder: r.holder, dob: r.dob, policies: [] });
    map.get(key).policies.push(r);
  }
  const clients = [...map.values()];
  const names = new Map();
  for (const c of clients) names.set(c.holder, (names.get(c.holder) || 0) + 1);
  for (const [n, k] of names) if (k > 1) issues.push({ severity: 'Medium', policyNo: '', msg: `${n} appears with ${k} different dates of birth — treated as separate clients. Check which is correct.` });
  return clients;
}

function analyse({ listings, parseIssues, contacts, actionState, runDate, cfg, templates }) {
  const issues = [...parseIssues];
  const warnings = [];
  const records = mergeRecords(listings);
  const clients = groupClients(records, issues);
  const asAts = listings.map((l) => l.meta.asAt).filter(Boolean).sort();
  const ref = asAts[asAts.length - 1] || runDate; // "as at" date of the newest listing
  const Y = +runDate.slice(0, 4);

  if (!listings.length) warnings.push('No ePartner listing PDF found in the input folder. Download this month\'s listing and save it into the input folder.');
  for (const l of listings) {
    if (l.meta.asAt && diffDays(runDate, l.meta.asAt) > cfg.staleListingDays) {
      warnings.push(`${l.meta.sourceFile} is dated ${fmtDate(l.meta.asAt)} (${diffDays(runDate, l.meta.asAt)} days old). Premium and status flags may be out of date — download a fresh listing.`);
    }
  }

  // Which birth months do the loaded listings cover?
  const coveredMonths = new Set(records.map((r) => r.dob.slice(5, 7)));
  const missingMonths = new Set();
  for (let d = -cfg.lookBackDays; d <= cfg.lookAheadDays; d++) {
    const mm = addDays(runDate, d).slice(5, 7);
    if (!coveredMonths.has(mm)) missingMonths.add(mm);
  }
  for (const mm of missingMonths) {
    const name = new Date(Date.UTC(2000, +mm - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
    warnings.push(`The next few days include ${name} birthdays, but no ${name} listing is loaded. Download the ${name} birthday listing from ePartner into the input folder so nobody is missed.`);
  }

  // ---------- Birthdays ----------
  const gi = cfg.ageGroups.findIndex((g) => g.folder === 'senior');
  const seniorAge = gi > 0 ? cfg.ageGroups[gi - 1].maxAge + 1 : 65;
  const birthdays = [];
  const excluded = [];
  for (const c of clients) {
    const contact = matchContact(contacts, c);
    const deathSelf = c.policies.find((p) => /death/i.test(p.statusDetail) && p.lifeAssured === c.holder);
    const deathOther = c.policies.filter((p) => /death/i.test(p.statusDetail) && p.lifeAssured !== c.holder);

    for (const y of [Y - 1, Y, Y + 1]) {
      const bday = birthdayInYear(c.dob, y);
      const delta = diffDays(bday, runDate);
      if (delta < -cfg.lookBackDays || delta > cfg.lookAheadDays) continue;
      const turning = y - +c.dob.slice(0, 4);
      if (deathSelf) { excluded.push({ holder: c.holder, birthday: bday, reason: `Policy ${deathSelf.policyNo} shows "Terminated (Death)" for this client. No message drafted.` }); continue; }
      if (contact && contact.skip) { excluded.push({ holder: c.holder, birthday: bday, reason: 'Marked Skip in contacts.csv.' }); continue; }

      const state = actionState.get(`${c.key}|${y}`) || null;
      const category = delta === 0 ? 'today' : delta > 0 ? 'upcoming' : 'belated';
      if (category === 'belated' && state && (state.action === 'sent' || state.action === 'skipped')) continue;

      const lang = normLanguage(contact && contact.langRaw);
      const phone = normPhone(contact && contact.phoneRaw);
      const preferred = (contact && contact.preferred) || suggestPreferredName(c.holder);
      const notes = [];
      if (!contact) notes.push('Not yet in contacts.csv (added automatically — please fill in the phone number).');
      if (contact && !lang.ok) notes.push(`Language "${contact.langRaw}" not recognised — using English. Use EN, ZH or BM.`);
      if (!(contact && contact.preferred)) notes.push(`Greeting name "${preferred}" was guessed from the full name — please check.`);
      if (phone.problem) notes.push(phone.problem + '.');
      for (const p of deathOther) notes.push(`Sensitive: policy ${p.policyNo} records a death claim for ${p.lifeAssured}. Review the tone before sending.`);
      const inforce = c.policies.filter((p) => p.status === 'In Force');
      if (!inforce.length) notes.push('No in-force policy with you — a good chance to reconnect.');
      if (cfg.milestoneAges.includes(turning)) notes.push(`Milestone: turning ${turning}. Consider a call or a small gift.`);

      const kind = category === 'belated' ? 'belated' : 'today';
      const variants = templateList(templates, lang.lang, kind);
      // Seniors get the respectful version; everyone else gets one of the general versions (rotates by client).
      let variant = turning >= seniorAge ? variants.findIndex((v) => v.for === 'senior') : -1;
      if (variant < 0) {
        const pool = variants.map((v, i) => i).filter((i) => variants[i].for !== 'senior');
        variant = pool[hash(`${c.key}|${y}`) % pool.length];
      }
      const draft = fillTemplate(variants[variant].text, preferred, cfg.senderName);
      birthdays.push({
        key: c.key, year: y, holder: c.holder, preferred, dob: c.dob, birthday: bday, delta, category, turning,
        milestone: cfg.milestoneAges.includes(turning), lang: lang.lang, phone: phone.phone, phoneProblem: phone.problem,
        inforceCount: inforce.length, policyCount: c.policies.length, notes,
        message: state && state.message ? state.message : draft, state: state ? state.action : 'new',
      });
    }
  }
  birthdays.sort((a, b) => a.delta - b.delta || a.holder.localeCompare(b.holder));

  // ---------- Policy alerts ----------
  const alerts = [];
  const add = (severity, type, p, detail, action) => alerts.push({ severity, type, holder: p.holder, policyNo: p.policyNo, detail, action });
  const dueSoonEnd = addDays(runDate, cfg.dueSoonDays);
  for (const p of records) {
    const prem = p.amount != null ? `${fmtRM(p.amount)} ${p.mode.toLowerCase()}` : 'premium n/a';
    const regularInforce = p.status === 'In Force' && /regular/i.test(p.statusDetail);
    if (regularInforce && p.dueDate && p.dueDate < ref) {
      const d = diffDays(ref, p.dueDate);
      const paidNote = p.lastPaid ? ` Last payment ${fmtDate(p.lastPaid)}.` : '';
      const oddNote = p.lastPaid && p.lastPaid > p.dueDate ? ' Last payment is after the due date, so the listing may be out of sync.' : '';
      if (d <= cfg.longOverdueDays) {
        add('Medium', 'Premium past due', p, `Due ${fmtDate(p.dueDate)} (${d} days before listing date). ${prem} via ${p.method || 'unknown method'}.${paidNote}`,
          AUTO_METHODS.has(p.method) ? 'Check whether the auto-debit failed (expired card, bank order issue) and help the client update it.' : 'Remind the client to pay.');
      } else {
        add('High', 'Long overdue, still In Force', p, `Premium due date ${fmtDate(p.dueDate)}, ${d} days before listing date. ${prem} via ${p.method || 'unknown method'}.${paidNote}${oddNote}`,
          'Open the policy in ePartner to see what is funding it (e.g. fund/cash value or premium loan), then speak to the client before the cover is affected.');
      }
    }
    if (regularInforce && p.dueDate && p.dueDate >= ref && p.dueDate <= dueSoonEnd && (!AUTO_METHODS.has(p.method) || (p.freq != null && p.freq <= 4))) {
      add('Info', 'Renewal coming up', p, `${prem} due ${fmtDate(p.dueDate)} via ${p.method || 'unknown method'}.`,
        AUTO_METHODS.has(p.method) ? 'Large non-monthly deduction — give the client a heads-up so the card/account has funds.' : 'Send a payment reminder (manual payer).');
    }
    if (p.status === 'Lapsed') {
      add('High', 'Policy lapsed', p, `${p.statusDetail || 'Lapsed'}. Life assured: ${p.lifeAssured}. Unpaid premium due ${fmtDate(p.dueDate)} (${prem}).`,
        'Discuss reinstatement or replacement cover. Confirm reinstatement terms with Great Eastern before advising.');
    }
    if (p.status === 'Pending' && /postpon/i.test(p.statusDetail)) {
      add('Medium', 'Proposal postponed', p, `Proposal dated ${fmtDate(p.commencement)} is postponed (waiting for validate).`,
        'Check whether the postponement period has ended and the client can re-apply.');
    }
    if (p.status === 'Pending' && /withdrawn/i.test(p.statusDetail)) {
      add('Low', 'Proposal withdrawn', p, `Proposal dated ${fmtDate(p.commencement)} was withdrawn.`, 'Possible re-approach if needs have changed.');
    }
  }
  for (const c of clients) {
    const dead = c.policies.some((p) => /death/i.test(p.statusDetail) && p.lifeAssured === c.holder);
    if (dead || c.policies.some((p) => p.status === 'In Force')) continue;
    const summary = c.policies.map((p) => `${p.policyNo} ${p.status}${p.statusDetail ? ` (${p.statusDetail})` : ''}`).join('; ');
    alerts.push({ severity: 'Medium', type: 'No active policy', holder: c.holder, policyNo: '', detail: summary,
      action: 'Re-engagement opportunity. Use the birthday greeting to reconnect, then review protection needs.' });
  }
  alerts.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.type.localeCompare(b.type) || a.holder.localeCompare(b.holder));

  // ---------- Premium forecast ----------
  const inforceRegular = records.filter((p) => p.status === 'In Force' && /regular/i.test(p.statusDetail) && p.amount != null);
  const dueNext = inforceRegular.filter((p) => p.dueDate && p.dueDate >= ref && p.dueDate <= dueSoonEnd)
    .map((p) => ({ policyNo: p.policyNo, holder: p.holder, due: p.dueDate, amount: p.amount, mode: p.mode, method: p.method, auto: AUTO_METHODS.has(p.method) }))
    .sort((a, b) => a.due.localeCompare(b.due));
  const overdue = inforceRegular.filter((p) => p.dueDate && p.dueDate < ref);
  const ap = (list) => list.reduce((s, p) => s + p.amount * (p.freq || 0), 0);
  const sum = (list) => list.reduce((s, p) => s + p.amount, 0);
  const forecast = {
    windowEnd: dueSoonEnd, ref,
    dueNext, dueTotal: sum(dueNext), dueAuto: sum(dueNext.filter((d) => d.auto)), dueManual: sum(dueNext.filter((d) => !d.auto)),
    inforceAP: ap(inforceRegular), inforcePolicies: inforceRegular.length,
    overdueCount: overdue.length, overdueAP: ap(overdue),
    lapsedAP: ap(records.filter((p) => p.status === 'Lapsed' && p.amount != null)),
    lapsedCount: records.filter((p) => p.status === 'Lapsed').length,
  };

  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return {
    runDate, ref, warnings, birthdays, excluded, alerts, forecast, issues,
    stats: { policies: records.length, clients: clients.length, listings: listings.length },
  };
}

module.exports = { analyse, templateList };
