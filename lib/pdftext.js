// Turns a PDF into plain text in the browser (pdf.js), in the same reading order as "pdftotext -raw",
// so the ePartner listing parser (lib/parse.js) works unchanged. The file never leaves the browser.
window.pdfToText = async function (file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let line = '', lastX = null, lastY = null;
    const flush = () => { if (line.trim()) lines.push(line.trim()); line = ''; lastX = null; lastY = null; };
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const x = it.transform[4], y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) flush();
      else if (lastX !== null && line && it.str && x > lastX + 1 && !/\s$/.test(line) && !/^\s/.test(it.str)) line += ' ';
      line += it.str;
      lastX = x + it.width; lastY = y;
      if (it.hasEOL) flush();
    }
    flush();
  }
  return lines.join('\n');
};
