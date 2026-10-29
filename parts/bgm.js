/* 가볍고 경쾌한 배경음악: 실로폰 멜로디 + 통통 베이스 + 셰이커 (Web Audio로 직접 만듦) */
(function () {
  var BPM = 126, BEAT = 60 / BPM, STEP = BEAT / 2;           // 8분음표 단위
  var ac = null, out = null, timer = null, next = 0, step = 0, on = false, noiseBuf = null;

  // 음 이름 → 주파수 (C4 = 60)
  function f(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // 코드 진행: C - G - Am - F (2마디씩)
  var CHORDS = [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 69], [41, 60, 65, 69]];
  // 8마디 멜로디 (8분음표 64칸, 0 = 쉼표) — 깡총깡총 뛰는 느낌
  var MEL = [
    72, 0, 76, 79, 76, 0, 72, 0,   74, 0, 76, 74, 72, 0, 0, 0,
    71, 0, 74, 79, 74, 0, 71, 0,   72, 74, 76, 0, 74, 0, 0, 0,
    72, 0, 76, 81, 79, 0, 76, 0,   79, 0, 81, 79, 76, 0, 72, 0,
    77, 0, 76, 74, 72, 0, 74, 0,   72, 0, 0, 79, 84, 0, 0, 0
  ];

  function bell(t, freq, vol) {                 // 실로폰/글로켄 느낌
    [1, 4.0].forEach(function (mul, i) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq * mul;
      var v = i ? vol * 0.18 : vol, d = i ? 0.12 : 0.45;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
    });
  }
  function pluck(t, freq, vol, dur) {            // 통통 튀는 베이스/우쿨렐레
    var o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(400, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function shaker(t, vol) {
    var s = ac.createBufferSource(), g = ac.createGain(), hp = ac.createBiquadFilter();
    s.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(hp); hp.connect(g); g.connect(out); s.start(t); s.stop(t + 0.08);
  }

  function schedule() {
    while (next < ac.currentTime + 0.15) {
      var i = step % 64, ch = CHORDS[Math.floor(i / 16)];
      if (MEL[i]) bell(next, f(MEL[i]), 0.22);
      if (i % 4 === 0) pluck(next, f(ch[0]), 0.32, 0.28);            // 베이스: 1·3박
      if (i % 4 === 2) pluck(next, f(ch[0] + 7), 0.22, 0.2);         // 5도 통통
      if (i % 2 === 1) {                                              // 엇박 우쿨렐레 코드
        for (var k = 1; k < 4; k++) pluck(next + k * 0.012, f(ch[k]), 0.07, 0.18);
      }
      shaker(next, i % 2 ? 0.05 : 0.025);
      next += STEP; step++;
    }
  }

  function start() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      var comp = ac.createDynamicsCompressor(); comp.connect(ac.destination);
      out = ac.createGain(); out.gain.value = 0; out.connect(comp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
    }
    ac.resume();
    if (on) return; on = true;
    next = ac.currentTime + 0.05;
    out.gain.cancelScheduledValues(ac.currentTime);
    out.gain.setTargetAtTime(0.5, ac.currentTime, 0.4);              // 살살 커지기
    clearInterval(timer); timer = setInterval(schedule, 40); schedule();
  }
  function stop() {
    if (!on) return; on = false;
    out.gain.cancelScheduledValues(ac.currentTime);
    out.gain.setTargetAtTime(0, ac.currentTime, 0.15);               // 살살 작아지기
    var t = timer; setTimeout(function () { if (!on) clearInterval(t); }, 600);
  }

  window.BGM = {
    start: start, stop: stop,
    toggle: function () { on ? stop() : start(); return on; },
    get playing() { return on; }
  };
})();
