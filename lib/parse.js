'use strict';
// Reads a Great Eastern ePartner "Policy Listing" PDF and turns it into clean policy records.
// Anything that cannot be read with confidence is reported as an issue, never guessed.

const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseDMY, diffDays } = require('./util');

const DATE = '\\d{2}/\\d{2}/\\d{4}';
const NOISE = [
  /^\d{1,2}\/\d{1,2}\/\d{2},\s*\d{1,2}:\d{2}\s*(AM|PM)\b/i, // browser print header
  /^https?:\/\//i,                                          // browser print footer
  /^Back to Previous Page$/i,
];
const REC_START = /^(\d{1,4}) ?(\d{10})(?![\d/])/;
const RECORD = new RegExp(`^(\\d{1,4}) ?(\\d{10})\\s*(.+?)\\s*(${DATE})\\s*(.+?)\\s*(${DATE})\\s*(.*)$`);
const MODE = /^(Monthly|Quarterly|Half-\s?Yearly|Yearly|Single(?: Premium)?)\b\s*/i;
const METHOD = /^(Credit Card|Debit Card|BANK'S ORDER|Cash|Cheque|GIRO|Auto Debit|Direct Debit|FPX|Salary Deduction)\b\s*/i;
const PLAN = /^([A-Z]?\d{1,4}[A-Z]?)\s+/i;
const STATUS = /^(Inforce|In Force|Terminated|Lapsed|waiting for validate)\s*(?:\(([^)]*)\))?\s*(.*)$/i;
const NAME_OK = /^[A-Z][A-Z .'@\/-]*[A-Z.]$/i;

const MODE_FREQ = { Monthly: 12, Quarterly: 4, 'Half-Yearly': 2, Yearly: 1, Single: 0 };

function findPdftotext(configured) {
  const candidates = [configured, 'C:\\Program Files\\Git\\ucrt64\\bin\\pdftotext.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe', 'pdftotext'].filter(Boolean);
  for (const c of candidates) {
    try { execFileSync(c, ['-v'], { stdio: 'ignore' }); return c; } catch (e) {
      // pdftotext -v exits non-zero on some builds but still runs
      if (e.code !== 'ENOENT' && e.status != null) return c;
    }
  }
  return null;
}

function pdfToText(pdfPath, exe) {
  return execFileSync(exe, ['-raw', '-enc', 'UTF-8', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function titleStatus(s) {
  const t = s.toLowerCase();
  if (t === 'inforce' || t === 'in force') return 'In Force';
  if (t === 'waiting for validate') return 'Pending';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseListingText(text, sourceFile) {
  const issues = [];
  const meta = {
    sourceFile,
    asAt: parseDMY((text.match(/as at\s+(\d{2}\/\d{2}\/\d{4})/i) || [])[1]),
    expectedRecords: +((text.match(/total of\s+(\d+)\s+records/i) || [])[1] || NaN),
    agentName: ((text.match(/Agent Name:\s*(.+)/i) || [])[1] || '').trim(),
    agentNo: ((text.match(/Agent No:\s*(\S+)/i) || [])[1] || '').trim(),
  };
  if (!meta.asAt) issues.push({ severity: 'High', policyNo: '', msg: `"As at" date not found in ${sourceFile} — overdue checks use the run date instead.` });
  if (Number.isNaN(meta.expectedRecords)) issues.push({ severity: 'Medium', policyNo: '', msg: `Record total not found in ${sourceFile} — cannot confirm every row was read.` });

  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .filter((l) => !NOISE.some((re) => re.test(l)));
  const headerEnd = lines.findIndex((l) => /^No\.\s+Policy No/i.test(l));
  if (headerEnd < 0) {
    issues.push({ severity: 'High', policyNo: '', msg: `${sourceFile} does not look like an ePartner Policy Listing (table header not found). File skipped.` });
    return { meta, records: [], issues };
  }

  const blocks = [];
  for (const l of lines.slice(headerEnd + 1)) {
    if (REC_START.test(l)) blocks.push([l]);
    else if (blocks.length) blocks[blocks.length - 1].push(l);
  }

  const records = [];
  let lastNo = 0;
  for (const b of blocks) {
    const raw = b.join(' ').replace(/\s+/g, ' ').trim();
    const rec = parseRecord(raw, meta, issues);
    if (!rec) continue;
    if (rec.rowNo !== lastNo + 1) {
      for (let n = lastNo + 1; n < rec.rowNo; n++) issues.push({ severity: 'High', policyNo: '', msg: `Row ${n} missing from ${sourceFile} — check the PDF manually.` });
    }
    lastNo = rec.rowNo;
    records.push(rec);
  }
  if (!Number.isNaN(meta.expectedRecords) && records.length !== meta.expectedRecords) {
    issues.push({ severity: 'High', policyNo: '', msg: `${sourceFile} says ${meta.expectedRecords} records but ${records.length} were read cleanly. Rows not read are listed below.` });
  }
  return { meta, records, issues };
}

function parseRecord(raw, meta, issues) {
  const m = RECORD.exec(raw);
  const fail = (why) => {
    issues.push({ severity: 'High', policyNo: (raw.match(/\d{10}/) || [''])[0], msg: `Could not read row: ${why}. Raw text: "${raw.slice(0, 160)}"` });
    return null;
  };
  if (!m) return fail('layout not recognised');

  const [, rowNo, policyNo, holder, dobRaw, la, commRaw, rest0] = m;
  const rec = {
    rowNo: +rowNo, policyNo, holder: holder.trim().toUpperCase(), dob: parseDMY(dobRaw),
    lifeAssured: la.trim().toUpperCase(), commencement: parseDMY(commRaw),
    dueDate: null, lastPaid: null, amount: null, mode: '', method: '', plan: '',
    status: '', statusDetail: '', servicingNote: '', source: meta.sourceFile, asAt: meta.asAt, raw,
  };
  if (!rec.dob) return fail(`date of birth "${dobRaw}" is not a valid date`);
  if (!NAME_OK.test(rec.holder)) return fail(`policy holder name "${rec.holder}" looks wrong`);
  if (!NAME_OK.test(rec.lifeAssured)) return fail(`life assured name "${rec.lifeAssured}" looks wrong`);

  let r = rest0;
  const dates = [];
  let dm;
  while (dates.length < 2 && (dm = new RegExp(`^(${DATE})\\s*`).exec(r))) { dates.push(dm[1]); r = r.slice(dm[0].length); }
  // Two dates = premium due date + last payment date. One date = last payment only (due date blank on the listing).
  if (dates.length === 2) { rec.dueDate = parseDMY(dates[0]); rec.lastPaid = parseDMY(dates[1]); }
  else if (dates.length === 1) rec.lastPaid = parseDMY(dates[0]);

  const am = /^([\d,]+\.\d{2})\s*/.exec(r);
  if (am) { rec.amount = parseFloat(am[1].replace(/,/g, '')); r = r.slice(am[0].length); }
  const mo = MODE.exec(r);
  if (mo) { rec.mode = /half/i.test(mo[1]) ? 'Half-Yearly' : /single/i.test(mo[1]) ? 'Single' : mo[1][0].toUpperCase() + mo[1].slice(1).toLowerCase(); r = r.slice(mo[0].length); }
  const me = METHOD.exec(r);
  if (me) { rec.method = /bank/i.test(me[1]) ? "Bank's Order" : me[1].replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bGiro\b/i, 'GIRO').replace(/\bFpx\b/i, 'FPX'); r = r.slice(me[0].length); }
  const pl = PLAN.exec(r);
  if (pl) { rec.plan = pl[1]; r = r.slice(pl[0].length); }
  const st = STATUS.exec(r);
  if (!st) return fail('policy status not recognised');
  rec.status = titleStatus(st[1]);
  rec.statusDetail = (st[2] || '').trim();
  rec.servicingNote = (st[3] || '').trim(); // name in the "Issuing Agent" column, if any

  const warn = (msg, severity = 'Low') => issues.push({ severity, policyNo, msg });
  if (!rec.commencement) warn(`Commencement date "${commRaw}" not valid.`, 'Medium');
  if (!rec.mode) warn('Payment mode not recognised.');
  if (!rec.method && rec.status === 'In Force') warn('Payment method not recognised.');
  if (!rec.plan) warn('Plan type code not found.');
  if (dates.some((d) => !parseDMY(d))) warn(`Invalid date in due/payment columns: ${dates.join(', ')}.`, 'Medium');
  if (rec.dueDate && rec.commencement && rec.dueDate < rec.commencement) warn('Premium due date is before commencement date.', 'Medium');
  if (rec.lastPaid && meta.asAt && rec.lastPaid > meta.asAt) warn('Last payment date is after the listing date.', 'Medium');
  if (rec.status === 'In Force' && /regular/i.test(rec.statusDetail) && rec.amount == null) warn('In-force regular policy has no premium amount.', 'Medium');
  const ageAtAsAt = Math.floor(diffDays(meta.asAt || rec.dob, rec.dob) / 365.25);
  if (ageAtAsAt < 0 || ageAtAsAt > 110) warn(`Date of birth ${dobRaw} gives an unlikely age (${ageAtAsAt}).`, 'Medium');
  rec.freq = MODE_FREQ[rec.mode] ?? null;
  return rec;
}

function parseListingPdf(pdfPath, exe) {
  const name = require('path').basename(pdfPath);
  const text = pdfToText(pdfPath, exe);
  return parseListingText(text, name);
}

module.exports = { findPdftotext, parseListingPdf, parseListingText };
