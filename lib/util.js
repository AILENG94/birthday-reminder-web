'use strict';
// Small shared helpers: dates (all handled as 'YYYY-MM-DD' strings in UTC to avoid timezone drift) and CSV.

const pad = (n) => String(n).padStart(2, '0');

function parseDMY(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function toUTC(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDays(isoStr, n) {
  return new Date(toUTC(isoStr) + n * 864e5).toISOString().slice(0, 10);
}

// a - b in whole days
function diffDays(a, b) {
  return Math.round((toUTC(a) - toUTC(b)) / 864e5);
}

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

function nowStamp() {
  const n = new Date();
  return `${todayLocal()} ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// 29 Feb birthdays are celebrated on 28 Feb in non-leap years.
function birthdayInYear(dobIso, year) {
  const [, m, d] = dobIso.split('-').map(Number);
  if (m === 2 && d === 29 && !isLeap(year)) return `${year}-02-28`;
  return `${year}-${pad(m)}-${pad(d)}`;
}

function fmtDate(isoStr, withWeekday = false) {
  if (!isoStr) return '';
  const opts = { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' };
  if (withWeekday) opts.weekday = 'short';
  return new Date(toUTC(isoStr)).toLocaleDateString('en-GB', opts).replace(/,/g, '').replace('Sept', 'Sep');
}

const fmtRM = (n) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function csvParse(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvLine = (arr) => arr.map(csvCell).join(',');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = {
  pad, parseDMY, toUTC, addDays, diffDays, todayLocal, nowStamp, birthdayInYear,
  fmtDate, fmtRM, csvParse, csvLine, esc,
};
