'use strict';
// contacts.csv = the one sheet you maintain: phone, preferred name, language, skip.
// The agent adds any new client it finds; it never overwrites what you typed.

const fs = require('fs');
const { csvParse, csvLine, parseDMY } = require('./util');

const HEADERS = ['Client Name', 'DOB', 'Preferred Name', 'Phone', 'Language', 'Skip', 'Notes'];

const CN_SURNAMES = new Set(('TAN LIM LEE NG ONG WONG GOH CHUA CHAN KOH TEO TEOH ANG YEO YEOH OOI KHOO KHOR LOH LOO LOW LAU LAI CHIN CHIA ' +
  "CHONG CHEW CHOO YAP YEW TAI TAY SIM HO HOR GAN GOON LOK TNEK T'NG TNG NGUI YOH FOO FONG LEONG LIEW LIOW SOO TEH TOH QUEK " +
  'PHANG PANG SEOW SIOW KOAY QUAH CHEAH KHAW LAW HENG HUANG ZHANG WANG CHEN LIU YONG CHUAH BEH SAW TEE LING HII TIONG WEE ' +
  'NEOH OH POH CHOW CHOY MAH LAM LOKE KOK KONG KU LEOW LIAW LIM PUA SEE SIA SOH TANG THAM TIEW TING TOK WAN WEI WU YAU YIP')
  .split(/\s+/));
const MALAY_PREFIX = /^(MOHD|MOHAMAD|MOHAMMAD|MOHAMED|MUHAMMAD|MUHAMAD|MD|MUHD|AHMAD)$/;
const PATRONYMIC = /^(BIN|BINTI|BTE|BT|BINTE|A\/L|A\/P|S\/O|D\/O)$/;

const tc = (s) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// Best-effort greeting name. Always shown to you for review; you can override it in contacts.csv.
function suggestPreferredName(full) {
  const w = full.trim().toUpperCase().split(/\s+/);
  const p = w.findIndex((x) => PATRONYMIC.test(x));
  if (p > 0) {
    const given = w.slice(0, p);
    if (given.length > 1 && MALAY_PREFIX.test(given[0])) given.shift();
    return tc(given.join(' '));
  }
  if (w.length >= 2 && CN_SURNAMES.has(w[0])) return tc(w.slice(1).join(' '));
  return tc(w[0]);
}

function normName(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }

function normLanguage(s) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return { lang: 'EN', ok: true, blank: true };
  if (/^(en|eng|english)$/.test(t)) return { lang: 'EN', ok: true };
  if (/^(zh|cn|chi|chinese|mandarin|中文|华文|华语)$/.test(t)) return { lang: 'ZH', ok: true };
  if (/^(bm|ms|my|malay|melayu|bahasa|bahasa melayu)$/.test(t)) return { lang: 'BM', ok: true };
  return { lang: 'EN', ok: false };
}

// Returns { phone: '60123456789' | null, problem: string|null }
function normPhone(s) {
  const raw = String(s || '').trim();
  if (!raw) return { phone: null, problem: 'No phone number in contacts.csv' };
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && !raw.startsWith('+60')) {
    return d.length >= 8 && d.length <= 15 ? { phone: d, problem: null } : { phone: null, problem: `Phone "${raw}" looks wrong` };
  }
  if (d.startsWith('60')) { /* already international */ }
  else if (d.startsWith('0')) d = '6' + d;
  else if (d.startsWith('1') && (d.length === 9 || d.length === 10)) d = '60' + d; // Excel dropped the leading 0
  if (/^601\d{8,9}$/.test(d)) return { phone: d, problem: null };
  return { phone: null, problem: `Phone "${raw}" is not a valid Malaysian mobile number` };
}

function loadContacts(file) {
  if (!fs.existsSync(file)) return { rows: [], exists: false };
  const rows = csvParse(fs.readFileSync(file, 'utf8'));
  if (!rows.length) return { rows: [], exists: true };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name.toLowerCase());
  const out = rows.slice(1).map((r, i) => {
    const get = (n) => (col(n) >= 0 ? (r[col(n)] || '').trim() : '');
    return {
      line: i + 2, name: get('Client Name'), dobRaw: get('DOB'), preferred: get('Preferred Name'),
      phoneRaw: get('Phone'), langRaw: get('Language'), skip: /^(y|yes|x|true|1)$/i.test(get('Skip')), notes: get('Notes'),
    };
  });
  return { rows: out, exists: true };
}

// DOB in the sheet may come back from Excel as 17/10/1951, 17-10-1951 or 1951-10-17.
function sheetDob(s) {
  const t = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return parseDMY(t.replace(/[-.]/g, '/'));
}

function matchContact(contacts, client) {
  const byName = contacts.filter((c) => normName(c.name) === client.holder);
  if (byName.length <= 1) return byName[0] || null;
  return byName.find((c) => sheetDob(c.dobRaw) === client.dob) || null;
}

// Append rows for clients not yet in the sheet. Returns number added, or throws if the file is locked (open in Excel).
function syncContacts(file, existing, clients) {
  const toAdd = clients.filter((c) => !matchContact(existing.rows, c));
  if (!toAdd.length && existing.exists) return 0;
  const lines = toAdd.map((c) => {
    const [yy, mm, dd] = c.dob.split('-');
    return csvLine([c.holder, `${dd}/${mm}/${yy}`, suggestPreferredName(c.holder), '', 'EN', c.skip ? 'Y' : '', c.note || '']);
  });
  if (!existing.exists) {
    fs.writeFileSync(file, '﻿' + [csvLine(HEADERS), ...lines].join('\r\n') + '\r\n', 'utf8');
  } else {
    let cur = fs.readFileSync(file, 'utf8');
    const sep = cur.endsWith('\n') ? '' : '\r\n';
    fs.appendFileSync(file, sep + lines.join('\r\n') + '\r\n', 'utf8');
  }
  return toAdd.length;
}

// Saves a phone number into contacts.csv for one client (matched by name + date of birth), keeping everything else.
// Throws if the number is invalid or the file is open in Excel.
function setPhone(file, holder, dob, phoneRaw) {
  const check = normPhone(phoneRaw);
  if (!check.phone) throw new Error(check.problem);
  const rows = fs.existsSync(file) ? csvParse(fs.readFileSync(file, 'utf8')) : [HEADERS];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const ci = (n) => head.indexOf(n.toLowerCase());
  const [iName, iDob, iPhone] = [ci('Client Name'), ci('DOB'), ci('Phone')];
  if (iName < 0 || iPhone < 0) throw new Error('contacts.csv is missing the Client Name or Phone column.');
  const matches = rows.slice(1).filter((r) => normName(r[iName]) === holder);
  let row = matches.length > 1 ? matches.find((r) => sheetDob(r[iDob]) === dob) : matches[0];
  if (!row) {
    const [yy, mm, dd] = dob.split('-');
    row = HEADERS.map(() => '');
    row[0] = holder; row[1] = `${dd}/${mm}/${yy}`; row[2] = suggestPreferredName(holder); row[4] = 'EN';
    rows.push(row);
  }
  while (row.length <= iPhone) row.push('');
  row[iPhone] = String(phoneRaw).trim();
  fs.writeFileSync(file, '﻿' + rows.map(csvLine).join('\r\n') + '\r\n', 'utf8');
  return check.phone;
}

module.exports = {
  setPhone, loadContacts, syncContacts, matchContact, normPhone, normLanguage, normName, suggestPreferredName };
