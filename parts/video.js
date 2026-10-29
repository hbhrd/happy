/* TrailFilm — 30초 오프닝 영상 (Canvas + Web Audio, 의존성 없음) */
(function () {
  'use strict';
  var W = 1280, H = 720, DUR = 30;
  var FONT_T = "'Nanum Myeongjo', serif", FONT_L = "'Noto Sans KR', sans-serif";
  var C = { paper: '#F7F5EF', ink: '#15233A', forest: '#0F6B4A', teal: '#0E8C9A', seaC: '#1767C7', sunset: '#F2643A',
    gold: '#E8A21C', indigo: '#3B3BB3', magenta: '#D6336C',
    sky: '#1767C7', mint: '#0E8C9A', grass: '#0F6B4A', cream: '#F7F5EF', coral: '#F2643A',
    sun: '#E8A21C', lav: '#3B3BB3', skin: '#E2AE88', red: '#B5361C', white: '#FFFFFF',
    navy: '#1F2E4D', khaki: '#B49E72', pack: '#2F4F3A', pole: '#9AA3AE', boot: '#3A2A20' };

  var canvas = null, g = null, dpr = 1;
  var actx = null, master = null, comp = null, bus = null, noiseBuf = null;
  var startAt = 0, nextStep = 0, started = false, ended = false, playing = false;
  var rafId = 0, schedTimer = 0, fbClock = null;

  /* ---------------- helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function prog(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutSoft(t) { var c1 = 0.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function hash(i, j) { var s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
  function shade(hex, amt) {
    var hx = hex.slice(1); if (hx.length === 3) hx = hx.replace(/./g, '$&$&');
    var n = parseInt(hx, 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    var tgt = amt > 0 ? 255 : 0, a = Math.abs(amt);
    r = Math.round(lerp(r, tgt, a)); gg = Math.round(lerp(gg, tgt, a)); b = Math.round(lerp(b, tgt, a));
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // flat card: soft shadow + subtle vertical shading
  function clay(x, y, w, h, r, col, soft) {
    g.save();
    if (soft) { g.shadowColor = 'rgba(21,35,58,0.22)'; g.shadowBlur = 18; g.shadowOffsetY = 6; }
    else { g.fillStyle = 'rgba(21,35,58,0.12)'; rr(x + 1, y + 3, w, h, r); g.fill(); }
    var gr = g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, shade(col, 0.06)); gr.addColorStop(1, shade(col, -0.06));
    g.fillStyle = gr; rr(x, y, w, h, r); g.fill();
    g.restore();
  }
  function ball(x, y, r, col) {
    var gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, shade(col, 0.12)); gr.addColorStop(1, shade(col, -0.08));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // kind: 't' = serif title (800), otherwise sans label (700)
  function text(s, x, y, size, col, outline, align, kind) {
    g.font = (kind === 't' ? '800 ' : '700 ') + size + 'px ' + (kind === 't' ? FONT_T : FONT_L);
    g.textAlign = align || 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (outline !== false) {
      g.save(); g.shadowColor = 'rgba(21,35,58,0.35)'; g.shadowBlur = 14; g.shadowOffsetY = 3;
      if (outline) { g.strokeStyle = outline; g.lineWidth = size * 0.1; g.strokeText(s, x, y); }
      g.fillStyle = col; g.fillText(s, x, y); g.restore();
    }
    g.fillStyle = col; g.fillText(s, x, y);
  }
  function measure(s, size, kind) {
    g.font = (kind === 't' ? '800 ' : '700 ') + size + 'px ' + (kind === 't' ? FONT_T : FONT_L);
    return g.measureText(s).width;
  }
  function pop(t, a, d) { var p = prog(t, a, a + (d || 0.6)); return p <= 0 ? 0 : easeOut(p); }
  function popPin(t, a, d) { var p = prog(t, a, a + (d || 0.6)); return p <= 0 ? 0 : easeOutSoft(p); }
  // gentle reveal: fade + rise (call after translate)
  function rev(a) { g.globalAlpha *= a; g.translate(0, (1 - a) * 26); var s = 0.97 + 0.03 * a; g.scale(s, s); }

  /* ---------------- backgrounds ---------------- */
  function sky(top, bot, mid) {
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, top); if (mid) gr.addColorStop(0.55, mid); gr.addColorStop(1, bot);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  function sunDisc(x, y, r) {
    var gl = g.createRadialGradient(x, y, r * 0.6, x, y, r * 2.4);
    gl.addColorStop(0, 'rgba(255,214,140,0.55)'); gl.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 2.4, 0, 7); g.fill();
    g.fillStyle = '#FFE2A0'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  function cloud(x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s); g.globalAlpha *= 0.85;
    g.fillStyle = '#FFFFFF';
    rr(-70, -10, 140, 30, 15); g.fill();
    g.beginPath(); g.arc(-25, -12, 24, 0, 7); g.arc(15, -18, 30, 0, 7); g.fill();
    g.restore();
  }
  function ridgeY(x, base, amp, freq, off, seed, sharp) {
    var u = (x + off) * freq + seed;
    var v = 0.6 * Math.sin(u) + 0.4 * Math.sin(u * 2.3 + seed);
    if (sharp) v = 1.4 * (1 - Math.abs(Math.sin(u * 0.8))) + 0.3 * Math.sin(u * 3.1) - 0.6;
    return base - amp * v;
  }
  function ridge(base, amp, freq, off, col, seed, sharp) {
    g.beginPath(); g.moveTo(0, H);
    for (var x = 0; x <= W + 20; x += 16) g.lineTo(x, ridgeY(x, base, amp, freq, off, seed, sharp));
    g.lineTo(W, H); g.closePath();
    var gr = g.createLinearGradient(0, base - amp * 1.4, 0, H);
    gr.addColorStop(0, shade(col, 0.08)); gr.addColorStop(1, shade(col, -0.18));
    g.fillStyle = gr; g.fill();
  }
  function hills(scroll, sunY) {
    sky('#1F6FCC', '#E4EEF0', '#7DB4E6');
    sunDisc(980, sunY, 54);
    var cx = (scroll * 25) % (W + 400);
    cloud(((200 + cx) % (W + 400)) - 200, 130, 1);
    cloud(((760 + cx * 0.7) % (W + 400)) - 200, 90, 0.75);
    cloud(((1150 + cx * 1.2) % (W + 400)) - 200, 200, 0.6);
    ridge(380, 70, 0.004, scroll * 20, '#4A55B5', 1, true);
    ridge(450, 60, 0.006, scroll * 45, C.teal, 3);
    ridge(540, 45, 0.008, scroll * 80, C.forest, 5);
    g.fillStyle = shade(C.forest, -0.2); g.fillRect(0, 600, W, 120);
    g.fillStyle = 'rgba(247,245,239,0.85)'; rr(-20, 610, W + 40, 30, 15); g.fill();
  }

  /* ---------------- characters ---------------- */
  // limb: two segments from (x,y); angles from vertical-down, + = forward(right)
  function limb(x, y, a1, l1, a2, l2, w, col) {
    var kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
    var ex = kx + Math.sin(a2) * l2, ey = ky + Math.cos(a2) * l2;
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(kx, ky); g.lineTo(ex, ey); g.stroke();
    return [ex, ey];
  }
  function ease2(s) { return Math.sin(s) * (1 - 0.18 * Math.sin(s) * Math.sin(s)); }
  // generic hiker, side profile facing right. o: {kid, jacket, pants, hat, pack, sil, wave, poles}
  function hiker(x, y, s, ph, o) {
    var kid = o.kid, R = kid ? 15 : 16, T = kid ? 50 : 80, L = kid ? 33 : 52, AW = kid ? 9 : 11;
    var sil = o.sil, J = sil || o.jacket, P = sil || o.pants, SK = sil || C.skin, HT = sil || o.hat,
      PK = sil || o.pack, BT = sil || C.boot, PL = sil || C.pole;
    var walk = o.still ? 0 : 1;
    g.save(); g.translate(x, y); g.scale(s, s);
    if (!sil) { g.fillStyle = 'rgba(21,35,58,0.16)'; g.beginPath(); g.ellipse(0, 0, kid ? 26 : 38, 6, 0, 0, 7); g.fill(); }
    var bob = walk * (1 - Math.cos(2 * ph)) * (kid ? 1.4 : 2);
    var hipY = -2 * L + 4 + bob * 0.4, shY = hipY - T + 8;
    g.translate(0, -bob * 0.6);
    var legA = [], armA = [];
    for (var k = 0; k < 2; k++) {
      var sw = ease2(ph + k * Math.PI) * walk;
      var bend = Math.max(0, Math.cos(ph + k * Math.PI)) * 0.55 * walk;
      legA.push([sw * 0.42, sw * 0.42 - bend]);
      armA.push(-sw * 0.5);
    }
    function leg(k, col) {
      var e = limb(0, hipY, legA[k][0], L, legA[k][1], L - 4, kid ? 11 : 15, col);
      g.fillStyle = BT; rr(e[0] - 6, e[1] - 4, kid ? 16 : 22, kid ? 8 : 10, 4); g.fill();
    }
    function arm(k, col, front) {
      var a1 = armA[k], a2 = a1 + 0.45, hand;
      if (front && o.wave) { a1 = Math.PI - 0.5 + Math.sin(o.wave * 8) * 0.22; a2 = a1 + 0.35; }
      hand = limb(2, shY + 4, a1, kid ? 24 : 34, a2, kid ? 22 : 30, AW, col);
      if (!sil) { g.fillStyle = SK; g.beginPath(); g.arc(hand[0], hand[1], AW * 0.5, 0, 7); g.fill(); }
      if (o.poles && !(front && o.wave)) {
        g.strokeStyle = PL; g.lineWidth = 3; g.lineCap = 'round';
        var tipX = hand[0] + 14 + Math.sin(a1) * 10, tipY = bob * 0.6;
        g.beginPath(); g.moveTo(hand[0], hand[1] - 8); g.lineTo(tipX, tipY); g.stroke();
        g.strokeStyle = sil || C.ink; g.lineWidth = 6; g.beginPath(); g.moveTo(hand[0], hand[1] - 10); g.lineTo(hand[0] + 1, hand[1] + 4); g.stroke();
      }
    }
    var backJ = sil || shade(J, -0.22), backP = sil || shade(P, -0.25);
    arm(1, backJ, false);
    leg(1, backP);
    // rucksack (behind, on back = left)
    var pw = kid ? 22 : 30, ph2 = kid ? 40 : 62;
    g.fillStyle = PK; rr(-pw - (kid ? 6 : 8), shY - 4, pw, ph2, 7); g.fill();
    if (!sil) { g.fillStyle = shade(PK, -0.2); rr(-pw - (kid ? 6 : 8), shY + ph2 * 0.55, pw, ph2 * 0.3, 5); g.fill(); }
    if (!kid) { // rolled mat on top
      g.fillStyle = sil || C.gold; rr(-pw - 14, shY - 18, pw + 12, 15, 7.5); g.fill();
      if (!sil) { g.strokeStyle = shade(C.gold, -0.25); g.lineWidth = 2; g.beginPath(); g.moveTo(-pw + 2, shY - 18); g.lineTo(-pw + 2, shY - 3); g.stroke(); }
    }
    // torso / jacket
    g.fillStyle = J;
    g.beginPath(); g.moveTo(-12, shY - 2); g.quadraticCurveTo(14, shY - 6, 16, shY + 8);
    g.lineTo(14, hipY + 6); g.lineTo(-13, hipY + 6); g.closePath(); g.fill();
    if (!sil) {
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(-12, shY - 2); g.lineTo(-3, shY); g.lineTo(-4, hipY + 6); g.lineTo(-13, hipY + 6); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(10, shY + 6); g.lineTo(9, hipY + 4); g.stroke();
      g.fillStyle = shade(PK, -0.3); rr(-6, shY + 2, 4, T - 18, 2); g.fill(); // strap
    }
    leg(0, P);
    // neck + head (profile)
    g.fillStyle = SK; rr(-3, shY - 10, 8, 12, 3); g.fill();
    var hy = shY - 10 - R + 2;
    g.beginPath(); g.ellipse(2, hy, R * 0.9, R, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(2 + R * 0.85, hy - 2); g.lineTo(2 + R * 0.85 + 4, hy + 3); g.lineTo(2 + R * 0.8, hy + 5); g.fill();
    if (!sil) {
      g.fillStyle = C.ink; g.beginPath(); g.arc(2 + R * 0.45, hy - 1, 1.8, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.beginPath(); g.ellipse(-2, hy + 2, R * 0.45, R * 0.7, 0, 0, 7); g.fill();
    }
    // hat
    if (o.cap) {
      g.fillStyle = HT; g.beginPath(); g.ellipse(2, hy - R * 0.45, R * 0.95, R * 0.7, 0, Math.PI, 0); g.fill();
      rr(2, hy - R * 0.55, R * 1.4, 4, 2); g.fill();
    } else {
      g.fillStyle = sil || shade(HT, -0.12); g.beginPath(); g.ellipse(2, hy - R * 0.5, R * 1.9, R * 0.28, -0.04, 0, 7); g.fill();
      g.fillStyle = HT; rr(2 - R * 0.85, hy - R * 1.35, R * 1.7, R * 0.95, R * 0.4); g.fill();
      if (!sil) { g.fillStyle = shade(HT, -0.35); g.fillRect(2 - R * 0.85, hy - R * 0.68, R * 1.7, 3); }
    }
    arm(0, J, true);
    g.restore();
  }
  function captain(x, y, s, ph, wave, sil) {
    hiker(x, y, s, ph, { jacket: C.red, pants: C.navy, hat: C.khaki, pack: C.pack, poles: true, wave: wave, sil: sil, still: ph === 0 });
  }
  function kid(x, y, s, ph, col, wave) {
    hiker(x, y, s, ph, { kid: true, jacket: col, pants: '#2A3550', hat: shade(col, -0.25), pack: '#E9DFC8', cap: true, wave: wave, still: ph === 0 && !wave });
  }
  var KIDS = [C.teal, C.gold, C.seaC, C.magenta];
  function bubble(x, y, s, msg, tailX) {
    if (s <= 0) return;
    var w = measure(msg, 40) + 64;
    x = clamp(x, 24, W - 24 - w);
    g.save(); g.globalAlpha *= s; g.translate(0, (1 - s) * 16);
    g.save(); g.shadowColor = 'rgba(21,35,58,0.22)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
    g.fillStyle = '#fff'; rr(x, y - 46, w, 92, 22); g.fill();
    var tx = clamp(tailX == null ? x + 60 : tailX, x + 30, x + w - 60);
    g.beginPath(); g.moveTo(tx - 4, y + 44); g.lineTo(tx - 10, y + 84); g.lineTo(tx + 34, y + 44); g.fill(); g.restore();
    text(msg, x + w / 2, y + 1, 40, C.ink, false);
    g.restore();
  }

  /* ---------------- scenes ---------------- */
  function scene1(t) {
    var sunY = lerp(560, 200, easeOut(prog(t, 0, 4)));
    sky('#5DB6F0', '#FFE3A8', '#FFB8A0');
    g.save(); g.globalAlpha = 0.45 * easeInOut(prog(t, 0, 4)); sky('#7CC8F5', '#FFF0C4', '#FFC9A8'); g.restore();
    sunDisc(980, sunY, 58);
    g.save(); g.globalAlpha = 0.5; cloud(150 + t * 30, 140, 1); cloud(700 + t * 18, 95, 0.7); cloud(1100 - t * 12, 210, 0.55); g.restore();
    var ent = easeOut(prog(t, 0, 2.2));
    var b1 = 390 + (1 - ent) * 150;
    ridge(b1, 80, 0.004, t * 20, '#6F86D6', 1, true);
    var sy = ridgeY(980, b1, 80, 0.004, t * 20, 1, true);
    captain(980, sy + 4, 0.62, 0, 0, '#1A1740');
    ridge(470 + (1 - ent) * 220, 60, 0.006, t * 45, '#3FA27A', 3);
    ridge(560 + (1 - ent) * 300, 45, 0.008, t * 80, C.forest, 5);
    g.fillStyle = shade(C.forest, -0.3); g.fillRect(0, 610 + (1 - ent) * 200, W, 150);
    var a = pop(t, 1.0, 0.9), b = pop(t, 1.5, 1.0);
    if (a > 0) { g.save(); g.translate(640, 220); rev(a); g.shadowColor = 'rgba(255,255,255,.8)'; g.shadowBlur = 12; text('엄홍길 대장님과 함께 걷는', 0, 0, 42, C.ink, false, 'center', 't'); g.shadowBlur = 0; g.shadowColor = 'transparent'; g.restore(); }
    if (b > 0) {
      g.save(); g.translate(640, 310); rev(b);
      text('전국 둘레길 백과사전', 0, 0, 88, C.ink, '#FFFFFF', 'center', 't');
      g.fillStyle = C.gold; g.fillRect(-60 * b, 62, 120 * b, 4);
      g.restore();
    }
  }
  function scene2(t) {
    hills(5 + t * 0.6, 190);
    var walkIn = easeOut(prog(t, 0, 2.6));
    var cx = lerp(-160, 470, walkIn), ph = t * 6.5;
    for (var k = 0; k < 3; k++) {
      var kx = lerp(-400 - k * 120, 300 - k * 120, easeOut(prog(t, 0.4 + k * 0.2, 3.2 + k * 0.2)));
      kid(kx, 628, 1, ph + k * 0.7, KIDS[k], 0);
    }
    captain(cx, 630, 1.15, ph, 0);
    bubble(cx - 60, 220, pop(t, 2.4, 0.7), '얘들아, 둘레길은 산을 빙~ 둘러 걷는 길이야!', cx);
  }
  var KR = [[0.36, 0], [0.56, 0.03], [0.74, 0.08], [0.9, 0.04], [0.95, 0.14], [0.82, 0.24], [0.73, 0.33], [0.78, 0.46],
    [0.83, 0.6], [0.8, 0.74], [0.7, 0.85], [0.52, 0.88], [0.34, 0.86], [0.25, 0.76], [0.3, 0.64], [0.22, 0.52],
    [0.29, 0.43], [0.2, 0.36], [0.1, 0.3], [0.17, 0.2], [0.25, 0.1]];
  var PINS = [['서울둘레길', 0.36, 0.5, -1, 30], ['북한산둘레길', 0.41, 0.45, 1, -18], ['강화나들길', 0.25, 0.46, -1, -22],
    ['해파랑길', 0.8, 0.6, 1, 0], ['소백산자락길', 0.6, 0.6, -1, -30], ['지리산둘레길', 0.5, 0.77, 1, 0],
    ['변산마실길', 0.3, 0.72, -1, 0], ['남파랑길', 0.65, 0.86, 1, 10], ['제주올레길', 0.4, 0.98, 1, 0]];
  function mp(u, v) { return [440 + u * 400 - (v - 0.5) * 60, 70 + v * 580]; }
  function korea(dy, col) {
    g.beginPath();
    var n = KR.length;
    for (var i = 0; i <= n; i++) {
      var a = mp(KR[i % n][0], KR[i % n][1]), b = mp(KR[(i + 1) % n][0], KR[(i + 1) % n][1]);
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + dy;
      if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(a[0], a[1] + dy, mx, my);
    }
    g.closePath(); g.fillStyle = col; g.fill();
    var j = mp(0.4, 0.98); g.beginPath(); g.ellipse(j[0], j[1] + dy, 34, 15, 0, 0, 7); g.fill();
  }
  function scene3(t) {
    sky('#1767C7', '#6FA9E3', '#2F7FD6');
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
    for (var w = 0; w < 6; w++) {
      g.beginPath();
      for (var x = 0; x <= W; x += 30) g.lineTo(x, 120 + w * 110 + Math.sin(x * 0.02 + t * 2 + w) * 6);
      g.stroke();
    }
    var s = easeOut(prog(t, 0, 0.9));
    g.save(); g.globalAlpha *= s; g.translate(640, 380); g.scale(0.94 + 0.06 * s, 0.94 + 0.06 * s); g.translate(-640, -380);
    korea(14, shade(C.forest, -0.35));
    g.save(); g.shadowColor = 'rgba(21,35,58,0.3)'; g.shadowBlur = 24; g.shadowOffsetY = 10;
    korea(0, C.forest); g.restore();
    g.save(); g.globalAlpha *= 0.25; g.translate(-10, -8); korea(0, C.teal); g.restore();
    korea(4, C.forest);
    // dotted paths
    g.setLineDash([4, 12]); g.lineCap = 'round'; g.strokeStyle = C.gold; g.lineWidth = 5;
    for (var i = 1; i < PINS.length; i++) {
      var p = prog(t, 1.0 + i * 0.6, 1.5 + i * 0.6); if (p <= 0) continue;
      var a = mp(PINS[i - 1][1], PINS[i - 1][2]), b = mp(PINS[i][1], PINS[i][2]);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(lerp(a[0], b[0], p), lerp(a[1], b[1], p)); g.stroke();
    }
    g.setLineDash([]);
    for (i = 0; i < PINS.length; i++) {
      var k = popPin(t, 0.8 + i * 0.6, 0.5); if (k <= 0) continue;
      var q = mp(PINS[i][1], PINS[i][2]), side = PINS[i][3];
      g.save(); g.translate(q[0], q[1]); g.scale(k, k);
      g.fillStyle = 'rgba(21,35,58,0.25)'; g.beginPath(); g.ellipse(0, 2, 10, 4, 0, 0, 7); g.fill();
      g.fillStyle = C.sunset; g.beginPath(); g.moveTo(0, 0); g.lineTo(-11, -22); g.lineTo(11, -22); g.fill();
      ball(0, -28, 14, C.sunset); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -28, 5, 0, 7); g.fill();
      var lw = measure(PINS[i][0], 34) + 30;
      var lx = side > 0 ? 22 : -22 - lw, ly = -54 + PINS[i][4];
      clay(lx, ly, lw, 54, 14, '#FFFFFF', true);
      text(PINS[i][0], lx + lw / 2, ly + 28, 34, C.ink, false);
      g.restore();
    }
    g.restore();
    var h = pop(t, 0.3, 0.8);
    if (h > 0) {
      g.save(); g.translate(210, 90); rev(h);
      clay(-170, -44, 340, 88, 16, C.paper, true);
      g.fillStyle = C.sunset; g.fillRect(-150, 26, 46, 4);
      text('전국 둘레길 지도', 0, 0, 42, C.ink, false, 'center', 't'); g.restore();
    }
  }
  /* isometric walk */
  var TW = 50, TH = 25;
  function pathI(j) { return 2.2 * Math.sin(j * 0.3); }
  function block(sx, sy, h, top) {
    var l = shade(top, -0.18), r = shade(top, -0.32);
    g.fillStyle = l; g.beginPath(); g.moveTo(sx - TW, sy); g.lineTo(sx, sy + TH); g.lineTo(sx, sy + TH + h); g.lineTo(sx - TW, sy + h); g.fill();
    g.fillStyle = r; g.beginPath(); g.moveTo(sx + TW, sy); g.lineTo(sx, sy + TH); g.lineTo(sx, sy + TH + h); g.lineTo(sx + TW, sy + h); g.fill();
    g.fillStyle = top; g.beginPath(); g.moveTo(sx, sy - TH); g.lineTo(sx + TW, sy); g.lineTo(sx, sy + TH); g.lineTo(sx - TW, sy); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(sx, sy - TH); g.lineTo(sx + TW * 0.5, sy - TH * 0.5); g.lineTo(sx, sy); g.lineTo(sx - TW * 0.5, sy - TH * 0.5); g.fill();
  }
  function scene4(t) {
    sky('#1D6DCB', '#D5E7F3', '#6EA8E0');
    cloud(200 - t * 20, 110, 0.8); cloud(900 - t * 30, 80, 0.6);
    var cj = lerp(2, 34, easeInOut(prog(t, 0, 7))), ci = pathI(cj);
    var ox = 640, oy = 430, j0 = Math.floor(cj) - 11, j1 = Math.floor(cj) + 12, i0 = Math.floor(ci) - 11, i1 = Math.floor(ci) + 12;
    var charD = ci + cj, charDrawn = false;
    for (var d = i0 + j0; d <= i1 + j1; d++) {
      if (!charDrawn && d > charD + 0.5) { captain(ox, oy - 10, 0.62, t * 7, 0); kid(ox - 70, oy - 45, 0.62, t * 7 + 1, C.teal, 0); charDrawn = true; }
      for (var i = i0; i <= i1; i++) {
        var j = d - i; if (j < j0 || j > j1) continue;
        var sx = ox + ((j - cj) - (i - ci)) * TW, sy = oy + ((j - cj) + (i - ci)) * TH;
        if (sx < -80 || sx > W + 80 || sy < -60 || sy > H + 80) continue;
        var pi = pathI(j), onPath = Math.abs(i - pi) < 0.75 || Math.abs(i - pathI(j - 0.5)) < 0.75;
        var zone = j < 13 ? 0 : j < 24 ? 1 : 2, hs = hash(i, j), top = '#2F8A5C', h = 18, sea = false;
        if (zone === 1 && !onPath) {
          if (i < pi - 0.7) { sea = true; top = C.seaC; h = 8 + Math.sin(t * 4 + i + j) * 4; }
          else top = '#E6D3A3';
        }
        if (onPath) top = '#EDE6D6';
        block(sx, sy - (sea ? -6 : 0), h, top);
        if (sea && hs < 0.3) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2.5; g.beginPath(); g.arc(sx, sy + 6 + Math.sin(t * 4 + j) * 3, 10, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
        if (onPath) continue;
        if (zone === 0 && hs < 0.45) {
          g.fillStyle = '#5B3A26'; rr(sx - 3, sy - 30, 6, 26, 3); g.fill();
          var tc = hs < 0.2 ? shade(C.forest, -0.15) : C.forest;
          g.fillStyle = tc; g.beginPath(); g.moveTo(sx, sy - 82 - hs * 20); g.lineTo(sx + 20 + hs * 8, sy - 22); g.lineTo(sx - 20 - hs * 8, sy - 22); g.closePath(); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.moveTo(sx, sy - 82 - hs * 20); g.lineTo(sx + 20 + hs * 8, sy - 22); g.lineTo(sx, sy - 22); g.closePath(); g.fill();
        } else if (zone === 2) {
          if (Math.abs(i - pi - 1.6) < 0.5) { clay(sx - 30, sy - 22, 60, 24, 8, '#8E8A9C'); g.strokeStyle = 'rgba(21,35,58,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy - 22); g.lineTo(sx, sy + 2); g.stroke(); }
          else if (hs < 0.22 && i < pi) {
            clay(sx - 28, sy - 44, 56, 40, 4, C.paper);
            g.fillStyle = C.sunset; g.beginPath(); g.moveTo(sx - 40, sy - 40); g.lineTo(sx, sy - 74); g.lineTo(sx + 40, sy - 40); g.closePath(); g.fill();
            g.fillStyle = C.seaC; rr(sx - 8, sy - 32, 16, 16, 2); g.fill();
          }
        } else if (zone === 1 && hs < 0.12 && !sea) { ball(sx, sy - 10, 8, C.magenta); }
      }
    }
    if (!charDrawn) captain(ox, oy - 10, 0.62, t * 7, 0);
    var caps = [['🌲 숲길', 0.2, C.forest], ['🌊 바닷길', 2.6, C.seaC], ['🏘️ 마을길', 4.8, C.sunset]];
    for (var c = 0; c < 3; c++) {
      var k = pop(t, caps[c][1], 0.7), out = prog(t, caps[c][1] + 2.2, caps[c][1] + 2.6);
      if (c === 2) out = 0;
      if (k <= 0 || out >= 1) continue;
      g.save(); g.globalAlpha = 1 - out; g.translate(250 + c * 390, 110 + Math.sin(t * 1.5 + c) * 4); rev(k);
      clay(-130, -44, 260, 88, 16, '#FFFFFF', true);
      g.fillStyle = caps[c][2]; rr(-130, -44, 10, 88, 5); g.fill();
      text(caps[c][0], 6, 2, 42, C.ink, false); g.restore();
    }
  }
  var CONF = []; (function () { for (var i = 0; i < 70; i++) CONF.push([hash(i, 1) * W, hash(i, 2) * 800, 60 + hash(i, 3) * 120, hash(i, 4), [C.sunset, C.gold, C.teal, C.indigo, C.magenta, C.forest][i % 6]]); })();
  function scene5(t) {
    hills(9 + Math.min(t, 6) * 0.2, 190);
    var ph = 0, wv = t + 1;
    kid(380, 628, 1, ph, KIDS[0], wv); kid(500, 632, 1, ph, KIDS[1], wv + 0.3);
    kid(790, 632, 1, ph, KIDS[2], wv + 0.6); kid(910, 628, 1, ph, KIDS[3], wv + 0.9);
    captain(645, 636, 1.15, ph, wv);
    for (var i = 0; i < CONF.length; i++) {
      var c = CONF[i], y = ((c[1] + t * c[2]) % 800) - 60, x = c[0] + Math.sin(t * 2 + i) * 20;
      g.save(); g.globalAlpha = clamp(t * 2, 0, 1) * 0.85; g.translate(x, y); g.rotate(t * 3 * (c[3] - 0.5) + i);
      g.fillStyle = c[4];
      if (i % 3 === 0) { g.beginPath(); g.ellipse(0, 0, 8, 4, 0, 0, 7); g.fill(); } else { g.fillRect(-5, -3, 10, 6); }
      g.restore();
    }
    var a = pop(t, 0.3, 0.9), b = pop(t, 2.4, 0.9);
    if (a > 0) { g.save(); g.translate(640, 140); rev(a); text('자, 함께 출발해 볼까?', 0, 0, 76, '#FFFFFF', null, 'center', 't'); g.restore(); }
    if (b > 0) {
      g.save(); g.translate(640, 255 + Math.sin(t * 2.5) * 3); rev(b);
      clay(-330, -40, 660, 80, 40, C.ink, true);
      text('▼ 아래로 내려가 둘레길 여행 시작!', 0, 1, 36, C.gold, false); g.restore();
    }
  }
  var SC = [[0, scene1], [5, scene2], [10, scene3], [17, scene4], [24, scene5], [DUR + 1, null]];
  function drawScene(t) {
    for (var i = 0; i < 5; i++) {
      if (t < SC[i + 1][0]) {
        SC[i][1](t - SC[i][0]);
        var nb = SC[i + 1][0];
        if (i < 4 && t > nb - 0.5) {
          g.save(); g.globalAlpha = easeInOut((t - (nb - 0.5)) / 0.5); SC[i + 1][1](0); g.restore();
        }
        return;
      }
    }
    scene5(DUR - 24);
  }
  function progress(t) {
    g.fillStyle = 'rgba(21,35,58,0.2)'; rr(16, H - 12, W - 32, 5, 2.5); g.fill();
    g.fillStyle = C.sunset; rr(16, H - 12, Math.max(5, (W - 32) * t / DUR), 5, 2.5); g.fill();
  }
  function playHint(big) {
    g.save(); g.fillStyle = 'rgba(21,35,58,' + (big ? 0.16 : 0.18) + ')'; g.fillRect(0, 0, W, H);
    var r = big ? 52 : 46, cx = 640, cy = big ? 500 : 360;
    g.shadowColor = 'rgba(21,35,58,0.35)'; g.shadowBlur = 22; g.shadowOffsetY = 6;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.shadowColor = 'transparent';
    g.fillStyle = C.ink; g.beginPath();
    g.moveTo(cx - r * 0.28, cy - r * 0.42); g.lineTo(cx + r * 0.46, cy); g.lineTo(cx - r * 0.28, cy + r * 0.42); g.closePath(); g.fill();
    if (big) {
      text('영상 보기', cx, cy + r + 34, 28, '#FFFFFF', C.ink);
      // duration badge
      g.fillStyle = 'rgba(21,35,58,0.72)'; rr(W - 118, 26, 92, 44, 22); g.fill();
      text('0:30', W - 72, 49, 24, '#FFFFFF', false);
    }
    g.restore();
  }
  function render(t) {
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    if (!started) { scene1(3.6); playHint(true); return; }
    drawScene(t); progress(t);
    if (!playing && !ended) playHint(false);
  }

  /* ---------------- music ---------------- */
  var BPM = 112, S16 = 60 / BPM / 4, STEPS = Math.floor(DUR / S16);
  var MEL = [72, 0, 76, 79, 76, 72, 74, 76, 77, 0, 77, 81, 79, 77, 76, 74, 74, 0, 79, 74, 76, 77, 79, 0, 76, 74, 72, 76, 72, 0, 67, 0];
  var ROOT = [48, 41, 43, 48];
  var BELLS = [5, 10, 17, 24].map(function (s) { return Math.round(s / S16); });
  var END = Math.round(28 / S16);
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function env(node, t, peak, att, dec) {
    node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + att);
    node.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  function tone(type, f, t, peak, dec, dest) {
    var o = actx.createOscillator(), a = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.connect(a); a.connect(dest || bus);
    env(a, t, peak, 0.005, dec); o.start(t); o.stop(t + dec + 0.05);
    return o;
  }
  function kick(t) {
    var o = actx.createOscillator(), a = actx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(a); a.connect(bus); env(a, t, 0.55, 0.003, 0.18); o.start(t); o.stop(t + 0.25);
  }
  function hat(t, v) {
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), a = actx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    s.connect(f); f.connect(a); a.connect(bus); env(a, t, v, 0.002, 0.05); s.start(t); s.stop(t + 0.08);
  }
  function marimba(m, t, v) { tone('sine', hz(m), t, v, 0.38); tone('sine', hz(m) * 4, t, v * 0.18, 0.08); tone('triangle', hz(m), t, v * 0.3, 0.15); }
  function bell(t) { [84, 88, 91, 96].forEach(function (m, k) { tone('sine', hz(m), t + k * 0.06, 0.12, 1.1); tone('sine', hz(m) * 2.76, t + k * 0.06, 0.03, 0.4); }); }
  function schedule(n) {
    var t = startAt + n * S16, bar = Math.floor(n / 16) % 4, inBar = n % 16;
    if (BELLS.indexOf(n) >= 0) bell(t);
    if (n === 0) bell(t + 0.02);
    if (n >= END) {
      if (n === END) {
        [48, 60, 64, 67, 72, 76, 79].forEach(function (m, k) { tone(k ? 'triangle' : 'sine', hz(m), t + k * 0.03, k ? 0.07 : 0.2, 2.2); });
        kick(t); bell(t + 0.2);
      }
      return;
    }
    var intro = n < 16;
    if (inBar % 4 === 0) kick(t);
    if (!intro && inBar % 2 === 0) hat(t + (inBar % 4 === 2 ? 0 : 0.002), inBar % 4 === 2 ? 0.09 : 0.04);
    if (inBar % 2 === 0) {
      var r = ROOT[bar], b = (inBar % 4 === 0) ? r : r + ((inBar % 8 === 6) ? 7 : 12);
      var bo = actx.createOscillator(), ba = actx.createGain(), lp = actx.createBiquadFilter();
      bo.type = 'triangle'; bo.frequency.setValueAtTime(hz(b), t); lp.type = 'lowpass'; lp.frequency.value = 900;
      bo.connect(lp); lp.connect(ba); ba.connect(bus); env(ba, t, 0.28, 0.01, 0.22); bo.start(t); bo.stop(t + 0.3);
      var m = MEL[(Math.floor(n / 2)) % 32];
      if (m && !intro) {
        marimba(m, t, 0.22);
        if (Math.floor(n / 64) % 2 === 1) marimba(m + 12, t + 0.004, 0.06);
      } else if (intro && inBar % 4 === 0) marimba([60, 64, 67, 72][inBar / 4], t, 0.15);
    }
  }
  function pump() {
    if (!actx || !playing) return;
    while (nextStep <= END && startAt + nextStep * S16 < actx.currentTime + 0.15) schedule(nextStep++);
  }
  function ensureAudio() {
    if (actx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    actx = new AC();
    comp = actx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master = actx.createGain(); master.gain.value = 0.35;
    master.connect(comp); comp.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.2, actx.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function newBus() {
    if (bus) { var old = bus; try { old.gain.cancelScheduledValues(0); old.gain.setValueAtTime(0, actx.currentTime); } catch (e) {} setTimeout(function () { try { old.disconnect(); } catch (e) {} }, 300); }
    bus = actx.createGain(); bus.connect(master);
    bus.gain.setValueAtTime(1, startAt + 28.2); bus.gain.linearRampToValueAtTime(0.0001, startAt + DUR);
  }

  /* ---------------- clock & loop ---------------- */
  function now() { return actx ? actx.currentTime : (fbClock ? fbClock.acc + (playing ? (performance.now() - fbClock.t0) / 1000 : 0) : 0); }
  function curTime() { if (!started) return 0; if (ended) return DUR; return clamp(now() - startAt, 0, DUR); }
  function frame() {
    rafId = 0; if (!playing) return;
    pump();
    var t = curTime();
    if (t >= DUR) { finish(); return; }
    render(t);
    if (typeof api.onTime === 'function') api.onTime(t, DUR);
    rafId = requestAnimationFrame(frame);
  }
  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(frame);
    if (!schedTimer) schedTimer = setInterval(pump, 25);
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId); rafId = 0;
    if (schedTimer) clearInterval(schedTimer); schedTimer = 0;
  }
  function finish() {
    playing = false; ended = true; stopLoop(); render(DUR);
    if (typeof api.onTime === 'function') api.onTime(DUR, DUR);
    if (actx) setTimeout(function () { if (!playing && actx) actx.suspend(); }, 400);
  }

  var api = {
    onTime: null,
    mount: function (cv) {
      canvas = cv; g = cv.getContext('2d');
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = W * dpr; cv.height = H * dpr;
      render(0);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!playing) render(curTime()); });
      return api;
    },
    play: function () {
      if (playing) return;
      if (!started || ended) { api.restart(); return; }
      playing = true;
      if (actx) actx.resume(); else if (fbClock) fbClock.t0 = performance.now();
      startLoop();
    },
    pause: function () {
      if (!playing) return;
      playing = false; stopLoop();
      if (actx) actx.suspend(); else if (fbClock) fbClock.acc += (performance.now() - fbClock.t0) / 1000;
      render(curTime());
    },
    toggle: function () { if (playing) api.pause(); else api.play(); },
    restart: function () {
      stopLoop();
      if (ensureAudio()) {
        actx.resume();
        startAt = actx.currentTime + 0.08; newBus();
      } else { fbClock = { acc: 0, t0: performance.now() }; startAt = 0; }
      nextStep = 0; started = true; ended = false; playing = true;
      startLoop();
    },
    get playing() { return playing; },
    get time() { return curTime(); }
  };
  window.TrailFilm = api;
})();
