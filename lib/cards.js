// Birthday picture cards, drawn in the browser (1080 x 1080, WhatsApp-friendly square).
// This file is inlined into the review page. Built-in designs carry the client's name;
// your own pictures (from the pictures folder) are used exactly as they are.
(function () {
  var TEXT = {
    EN: { title: 'Happy Birthday', line: 'Wishing you good health & happiness' },
    ZH: { title: '生日快乐', line: '身体健康 · 万事如意' },
    BM: { title: 'Selamat Hari Jadi', line: 'Semoga sihat & bahagia selalu' }
  };
  var SANS = '"Segoe UI", "Microsoft YaHei", sans-serif';
  var SERIF = 'Georgia, "Times New Roman", "Microsoft YaHei", serif';

  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

  function fit(ctx, text, maxW, size, font) {
    do { ctx.font = font.replace('{s}', size); size -= 4; } while (ctx.measureText(text).width > maxW && size > 20);
  }

  function texts(ctx, o, c) {
    var t = TEXT[o.lang] || TEXT.EN;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save();
    if (c.shadow) { ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3; }
    ctx.fillStyle = c.title; fit(ctx, t.title, 760, o.lang === 'ZH' ? 150 : 118, c.titleFont); ctx.fillText(t.title, 540, 420);
    ctx.fillStyle = c.name; fit(ctx, o.name, 760, 100, '600 {s}px ' + SANS); ctx.fillText(o.name, 540, 560);
    ctx.fillStyle = c.line; fit(ctx, t.line, 760, 52, '{s}px ' + SANS); ctx.fillText(t.line, 540, 665);
    ctx.fillStyle = c.sender; ctx.font = 'italic 50px ' + SERIF; ctx.fillText('— ' + o.sender, 540, 780);
    ctx.restore();
  }

  function flower(ctx, x, y, r, petal, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = petal;
    for (var i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.ellipse(0, r * 0.62, r * 0.36, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#F6C343'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function leaf(ctx, x, y, len, rot, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, -len / 2, len * 0.22, len / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  var DESIGNS = {
    garden: function (ctx, o) {
      ctx.fillStyle = '#FFF8EE'; ctx.fillRect(0, 0, 1080, 1080);
      var R = rng(7), petals = ['#F28AA6', '#F7A072', '#B39DDB', '#F48FB1', '#FFB4A2'];
      [[170, 165], [910, 915]].forEach(function (c, k) {
        for (var i = 0; i < 9; i++) leaf(ctx, c[0] + (R() - .5) * 220, c[1] + (R() - .5) * 180, 100 + R() * 60, R() * 6.3, i % 2 ? '#7BB77B' : '#4E9A6B');
        for (var j = 0; j < 7; j++) flower(ctx, c[0] + (R() - .5) * 240, c[1] + (R() - .5) * 190, 40 + R() * 26, petals[(j + k) % petals.length], R() * 3);
      });
      for (var d = 0; d < 40; d++) { ctx.fillStyle = petals[d % 5]; ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(R() * 1080, 230 + R() * 640, 4 + R() * 6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      texts(ctx, o, { title: '#2E6B4F', name: '#C2185B', line: '#5B6B5F', sender: '#2E6B4F', titleFont: 'italic 700 {s}px ' + SERIF });
    },
    balloons: function (ctx, o) {
      var g = ctx.createLinearGradient(0, 0, 0, 1080); g.addColorStop(0, '#CDEBFF'); g.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1080);
      var R = rng(11), cols = ['#FF6B6B', '#FFC93C', '#6BCB77', '#4D96FF', '#C77DFF', '#FF8FAB'];
      for (var c = 0; c < 70; c++) { ctx.fillStyle = cols[c % 6]; ctx.save(); ctx.translate(R() * 1080, R() * 1080); ctx.rotate(R() * 3); ctx.fillRect(-7, -3, 14, 6); ctx.restore(); }
      [[120, 170], [255, 120], [950, 170], [815, 115], [130, 860], [950, 880]].forEach(function (p, i) {
        ctx.strokeStyle = '#8899AA'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p[0], p[1] + 95);
        ctx.bezierCurveTo(p[0] - 25, p[1] + 140, p[0] + 25, p[1] + 170, p[0], p[1] + 210); ctx.stroke();
        ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(p[0], p[1], 72, 92, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(p[0] - 12, p[1] + 100); ctx.lineTo(p[0] + 12, p[1] + 100); ctx.lineTo(p[0], p[1] + 88); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(p[0] - 24, p[1] - 30, 14, 26, -.5, 0, 7); ctx.fill();
      });
      texts(ctx, o, { title: '#1F3A5F', name: '#E4572E', line: '#4A5A70', sender: '#1F3A5F', titleFont: '800 {s}px ' + SANS });
    },
    sunset: function (ctx, o) {
      var g = ctx.createLinearGradient(0, 0, 0, 1080); g.addColorStop(0, '#FFC48C'); g.addColorStop(.55, '#FF8C7A'); g.addColorStop(1, '#9D5BA8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1080);
      ctx.fillStyle = 'rgba(255,240,180,.75)'; ctx.beginPath(); ctx.arc(540, 200, 115, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(80,40,80,.55)'; ctx.lineWidth = 5;
      [[180, 160], [240, 200], [860, 140], [920, 185]].forEach(function (b) { ctx.beginPath(); ctx.moveTo(b[0] - 26, b[1] - 10); ctx.quadraticCurveTo(b[0] - 10, b[1] - 16, b[0], b[1]); ctx.quadraticCurveTo(b[0] + 10, b[1] - 16, b[0] + 26, b[1] - 10); ctx.stroke(); });
      ctx.fillStyle = '#7A4A8C'; ctx.beginPath(); ctx.moveTo(0, 930); ctx.quadraticCurveTo(270, 840, 560, 920); ctx.quadraticCurveTo(820, 990, 1080, 900); ctx.lineTo(1080, 1080); ctx.lineTo(0, 1080); ctx.fill();
      ctx.fillStyle = '#5B3470'; ctx.beginPath(); ctx.moveTo(0, 1000); ctx.quadraticCurveTo(380, 930, 700, 1000); ctx.quadraticCurveTo(900, 1040, 1080, 990); ctx.lineTo(1080, 1080); ctx.lineTo(0, 1080); ctx.fill();
      texts(ctx, o, { title: '#FFFFFF', name: '#FFF3C4', line: '#FFFFFF', sender: '#FFFFFF', shadow: true, titleFont: 'italic 700 {s}px ' + SERIF });
    },
    // Chinese longevity style: red & gold, plum blossom branches, longevity peaches. Offered by default to Chinese-language seniors.
    longevity: function (ctx, o) {
      var g = ctx.createRadialGradient(540, 500, 100, 540, 540, 780); g.addColorStop(0, '#C62828'); g.addColorStop(1, '#7F1414');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1080);
      var R = rng(3);
      ctx.strokeStyle = 'rgba(255,215,140,.10)'; ctx.lineWidth = 3;
      for (var c = 0; c < 14; c++) { var cx = R() * 1080, cy = R() * 1080; for (var k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, k * 26, Math.PI, Math.PI * 2); ctx.stroke(); } }
      function branch(x0, y0, pts) {
        ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.stroke();
        pts.forEach(function (p, i) { flower(ctx, p[0] + (i % 2 ? 22 : -18), p[1] - 18, 30, i % 2 ? '#F8BBD0' : '#FFFFFF', i); });
      }
      branch(0, 120, [[110, 150], [200, 110], [290, 150], [360, 120]]);
      branch(1080, 260, [[980, 230], [900, 270], [820, 240]]);
      function peach(x, y, r) {
        var pg = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); pg.addColorStop(0, '#FFE0D0'); pg.addColorStop(.6, '#FF9E9E'); pg.addColorStop(1, '#E35D6A');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(x, y - r * 1.15);
        ctx.bezierCurveTo(x + r * 1.2, y - r * .6, x + r * .9, y + r, x, y + r);
        ctx.bezierCurveTo(x - r * .9, y + r, x - r * 1.2, y - r * .6, x, y - r * 1.15); ctx.fill();
        leaf(ctx, x - 14, y + r * .95, 70, -2.2, '#2E7D32'); leaf(ctx, x + 14, y + r * .95, 70, 2.2, '#43A047');
      }
      peach(150, 930, 70); peach(255, 960, 58); peach(930, 935, 70);
      ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 4; ctx.strokeRect(36, 36, 1008, 1008);
      texts(ctx, o, { title: '#FFD54F', name: '#FFFFFF', line: '#FFE9B0', sender: '#FFD54F', shadow: true, titleFont: '700 {s}px ' + (o.lang === 'ZH' ? '"KaiTi", "STKaiti", "Microsoft YaHei", serif' : SERIF) });
    },
    elegant: function (ctx, o) {
      var g = ctx.createRadialGradient(540, 480, 80, 540, 540, 760); g.addColorStop(0, '#24365C'); g.addColorStop(1, '#101A33');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1080);
      var R = rng(5);
      for (var i = 0; i < 90; i++) {
        var y = R() * 1080; if (y > 330 && y < 860 && R() < .8) continue;
        ctx.fillStyle = 'rgba(233,196,106,' + (.35 + R() * .6) + ')'; ctx.beginPath(); ctx.arc(R() * 1080, y, 2 + R() * 7, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = '#E9C46A'; ctx.lineWidth = 3; ctx.strokeRect(48, 48, 984, 984); ctx.lineWidth = 1; ctx.strokeRect(62, 62, 956, 956);
      texts(ctx, o, { title: '#E9C46A', name: '#FFFFFF', line: '#D8DCE6', sender: '#E9C46A', titleFont: 'italic 700 {s}px ' + SERIF });
    }
  };

  // Client's name on your own pictures: a cream ribbon with gold edge, at the top or bottom of the picture.
  var DEAR = { EN: 'Dear {n}', ZH: '亲爱的 {n}', BM: 'Buat {n}' };
  function nameBanner(ctx, W, H, o) {
    if (!o.name || o.namePos === 'off') return;
    var text = (DEAR[o.lang] || DEAR.EN).replace('{n}', o.name);
    var size = Math.round(H * 0.058), font = '600 {s}px Georgia, "Microsoft YaHei", serif';
    fit(ctx, text, W * 0.72, size, font);
    var tw = ctx.measureText(text).width, padX = H * 0.045, bh = H * 0.095, bw = tw + padX * 2;
    var x = (W - bw) / 2, y = o.namePos === 'top' ? H * 0.03 : H - bh - H * 0.035, r = bh / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = H * 0.02; ctx.shadowOffsetY = H * 0.004;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + bw, y, x + bw, y + bh, r); ctx.arcTo(x + bw, y + bh, x, y + bh, r);
    ctx.arcTo(x, y + bh, x, y, r); ctx.arcTo(x, y, x + bw, y, r); ctx.closePath();
    ctx.fillStyle = 'rgba(255,250,240,.93)'; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.lineWidth = Math.max(2, H * 0.003); ctx.strokeStyle = '#C9A24A'; ctx.stroke();
    ctx.fillStyle = '#6B3F12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, y + bh / 2 + H * 0.002);
    ctx.restore();
  }

  // id is "builtin:<design>" or "file:<name>". Calls done() when drawn.
  // Your own pictures are shown whole at their own shape (never cropped); built-in designs are square.
  window.drawBirthdayCard = function (canvas, id, o, done) {
    var ctx = canvas.getContext('2d');
    function square() { canvas.width = canvas.height = 1080; }
    if (id.indexOf('file:') === 0) {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        nameBanner(ctx, canvas.width, canvas.height, o);
        if (done) done(true);
      };
      img.onerror = function () { square(); DESIGNS.garden(ctx, o); if (done) done(false); };
      img.src = 'pictures/' + id.slice(5).split('/').map(encodeURIComponent).join('/');
      return;
    }
    square();
    (DESIGNS[id.slice(8)] || DESIGNS.garden)(ctx, o);
    if (done) done(true);
  };
  window.BUILTIN_DESIGNS = Object.keys(DESIGNS).map(function (k) { return 'builtin:' + k; });
})();
