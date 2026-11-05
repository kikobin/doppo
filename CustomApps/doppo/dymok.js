// doppo — «Дымок», маскот doppo (расширение из комплекта приложения).
//
// Облачко дыма, которое живёт в нижнем плеере и на экране «Мой поток»:
//  • подпрыгивает ровно в бит трека (Spicetify.getAudioData → beats);
//  • «поёт» — рот открывается по громкости музыки (segments.loudness_max);
//  • засыпает на паузе, удивляется смене трека, выпускает сердечки на лайк;
//  • по клику рассказывает темп и тональность трека.
// Ещё публикует window.doppoBeat — по нему дымка в «Моём потоке» пульсирует в такт.
//
// Ничего в Spotify не заменяет: просто маленький элемент рядом с кнопками плеера.

(function doppoDymok() {
  if (!window.Spicetify || !Spicetify.Player || !Spicetify.Platform || !Spicetify.CosmosAsync) {
    setTimeout(doppoDymok, 250);
    return;
  }

  const KEY = "doppo:settings";
  const settings = () => {
    try {
      return Object.assign({ dymok: false }, JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      return { dymok: false };
    }
  };

  /* =================================================================
     Ритм трека
     ================================================================= */
  const KEYS = ["до", "до♯", "ре", "ре♯", "ми", "фа", "фа♯", "соль", "соль♯", "ля", "ля♯", "си"];
  const beat = { pulse: 0, loud: 0, tempo: 0, key: -1, mode: 1, hasData: false, playing: false, beatCount: 0 };
  window.doppoBeat = beat;

  let analysisUri = null;
  let beats = [];
  let segs = [];

  async function loadAnalysis() {
    const item = Spicetify.Player.data && (Spicetify.Player.data.item || Spicetify.Player.data.track);
    const uri = item && item.uri;
    if (!uri || uri === analysisUri) return;
    analysisUri = uri;
    beats = [];
    segs = [];
    beat.hasData = false;
    beat.tempo = 0;
    beat.key = -1;
    if (!uri.startsWith("spotify:track:") || !Spicetify.getAudioData) return;
    try {
      const a = await Spicetify.getAudioData(uri);
      if (analysisUri !== uri || !a) return;
      beats = (a.beats || []).map((b) => ({ start: b.start * 1000, dur: b.duration * 1000, conf: b.confidence }));
      segs = (a.segments || []).map((s) => ({ start: s.start * 1000, loud: s.loudness_max }));
      beat.tempo = (a.track && a.track.tempo) || 0;
      beat.key = a.track ? a.track.key : -1;
      beat.mode = a.track ? a.track.mode : 1;
      beat.hasData = beats.length > 0;
    } catch (e) {
      /* анализа нет — Дымок просто покачивается */
    }
  }

  // плавные часы плеера
  let base = 0;
  let at = performance.now();
  function clock() {
    return beat.playing ? base + (performance.now() - at) : base;
  }
  function syncClock(hard) {
    const p = Spicetify.Player.getProgress() || 0;
    const pl = Spicetify.Player.isPlaying();
    const pred = clock();
    base = hard || pl !== beat.playing || Math.abs(p - pred) > 300 ? p : pred + (p - pred) * 0.2;
    at = performance.now();
    beat.playing = pl;
  }
  setInterval(() => syncClock(false), 250);
  Spicetify.Player.addEventListener("onplaypause", () => syncClock(true));
  Spicetify.Player.addEventListener("songchange", () => {
    syncClock(true);
    loadAnalysis();
    mascots.forEach((m) => m.surprise());
  });
  syncClock(true);
  loadAnalysis();

  function find(list, t) {
    let lo = 0;
    let hi = list.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].start <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  let lastBeatIdx = -1;
  function updateBeat() {
    const t = clock();
    let target = 0;
    let loud = 0;
    if (beat.playing && beat.hasData) {
      const i = find(beats, t);
      if (i >= 0) {
        const b = beats[i];
        const phase = Math.min(1, (t - b.start) / Math.max(1, b.dur));
        target = Math.pow(1 - phase, 2.4) * (0.55 + 0.45 * b.conf);
        if (i !== lastBeatIdx) {
          lastBeatIdx = i;
          beat.beatCount++;
        }
      }
      const s = find(segs, t);
      if (s >= 0) loud = Math.min(1, Math.max(0, (segs[s].loud + 32) / 30));
    } else if (beat.playing) {
      // без анализа — мягкое покачивание ~96 BPM
      const phase = (t / 625) % 1;
      target = Math.pow(1 - phase, 2.4) * 0.45;
      loud = 0.35 + 0.25 * Math.sin(t / 180);
    }
    beat.pulse = target;
    beat.loud += (loud - beat.loud) * 0.35;
  }

  /* =================================================================
     Стили
     ================================================================= */
  const css = document.createElement("style");
  css.id = "doppo-dymok-style";
  css.textContent = `
.dymok { --s: 44px; --tint: 255,255,255; position: relative; width: var(--s); height: var(--s); flex-shrink: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent; user-select: none; }
.dymok svg { width: 100%; height: 100%; overflow: visible; display: block; filter: drop-shadow(0 4px 10px rgba(0,0,0,.35)) drop-shadow(0 0 14px rgba(var(--tint), .28)); }
.dymok .dy-lid, .dymok .dy-zz { opacity: 0; transition: opacity .4s ease; }
.dymok.is-sleep .dy-eye { opacity: 0; }
.dymok.is-sleep .dy-lid { opacity: 1; }
.dymok.is-sleep .dy-zz { opacity: 1; }
.dymok .dy-z { font: 800 13px/1 "Onest", system-ui, sans-serif; fill: #fff; animation: dy-z 2.6s ease-in-out infinite; }
.dymok .dy-z:nth-of-type(2) { animation-delay: 1.3s; font-size: 10px; }
@keyframes dy-z { 0% { transform: translate(0,0); opacity: 0; } 30% { opacity: .9; } 100% { transform: translate(10px,-22px); opacity: 0; } }
.dymok-say { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%) translateY(6px) scale(.9); transform-origin: bottom center;
  padding: 8px 12px; border-radius: 14px; white-space: nowrap; pointer-events: none; z-index: 30;
  background: #fff; color: #0c0c0e; font: 800 13px/1.2 "Onest", system-ui, sans-serif; letter-spacing: -.01em;
  box-shadow: 0 10px 30px rgba(0,0,0,.45); opacity: 0; transition: opacity .25s ease, transform .35s cubic-bezier(.22,1,.36,1); }
.dymok-say::after { content: ""; position: absolute; left: 50%; top: 100%; margin-left: -6px; border: 6px solid transparent; border-top-color: #fff; }
.dymok-say.is-on { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
.dymok-heart { position: absolute; left: 50%; top: 20%; width: 14px; height: 14px; pointer-events: none; color: #ff5c8a;
  animation: dy-heart 1.4s cubic-bezier(.22,1,.36,1) forwards; }
@keyframes dy-heart { from { transform: translate(-50%, 0) scale(.4); opacity: 0; } 20% { opacity: 1; }
  to { transform: translate(calc(-50% + var(--dx)), -46px) scale(1.1) rotate(var(--rot)); opacity: 0; } }
.doppo-dymok-slot { display: flex; align-items: center; margin-right: 6px; }
`;
  document.head.appendChild(css);

  /* =================================================================
     Маскот
     ================================================================= */
  const PHRASES = ["кайф", "ещё раз?", "громче!", "я Дымок, привет", "это в «Мне нравится»?", "качает", "мурашки", "на репит"];
  const HEART = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.8 4 7.3 4c2 0 3.4 1.1 4.7 2.7C13.3 5.1 14.7 4 16.7 4c3.5 0 5.7 3.6 4.5 7.1-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>';
  let uid = 0;
  const mascots = new Set();

  class Dymok {
    constructor(size) {
      const id = "dy" + ++uid;
      this.el = document.createElement("div");
      this.el.className = "dymok";
      this.el.style.setProperty("--s", size + "px");
      this.el.setAttribute("role", "img");
      this.el.setAttribute("aria-label", "Дымок");
      this.el.innerHTML =
        '<svg viewBox="0 0 100 100" aria-hidden="true">' +
        "<defs>" +
        '<radialGradient id="' + id + 'g" cx="42%" cy="35%" r="75%">' +
        '<stop offset="0" stop-color="#ffffff"/>' +
        '<stop offset=".62" style="stop-color: rgb(var(--tint))" stop-opacity=".92"/>' +
        '<stop offset="1" style="stop-color: rgb(var(--tint))" stop-opacity=".55"/>' +
        "</radialGradient>" +
        "</defs>" +
        '<g class="dy-body">' +
        '<path class="dy-curl" d="M52 25c-7-6-2-15 6-13 7 2 6 10 1 11" fill="none" stroke="url(#' + id + 'g)" stroke-width="6" stroke-linecap="round"/>' +
        '<path class="dy-puff" fill="url(#' + id + 'g)" d="M24 76c-13 0-17-17-6-23-3-14 12-23 23-16 4-13 25-14 30 0 12-4 23 7 18 18 12 4 9 21-4 21z"/>' +
        '<g class="dy-face">' +
        '<ellipse class="dy-eye" cx="40" cy="54" rx="4.3" ry="6.2" fill="#121214"/>' +
        '<ellipse class="dy-eye" cx="62" cy="54" rx="4.3" ry="6.2" fill="#121214"/>' +
        '<circle class="dy-eye" cx="41.6" cy="51.6" r="1.5" fill="#fff"/>' +
        '<circle class="dy-eye" cx="63.6" cy="51.6" r="1.5" fill="#fff"/>' +
        '<path class="dy-lid" d="M35 55q5 4 10 0M57 55q5 4 10 0" fill="none" stroke="#121214" stroke-width="2.6" stroke-linecap="round"/>' +
        '<ellipse cx="31" cy="64" rx="5" ry="3" fill="#ff7aa2" opacity=".55"/>' +
        '<ellipse cx="71" cy="64" rx="5" ry="3" fill="#ff7aa2" opacity=".55"/>' +
        '<ellipse class="dy-mouth" cx="51" cy="66" rx="4.6" ry="1.6" fill="#121214"/>' +
        "</g>" +
        "</g>" +
        '<g class="dy-zz"><text class="dy-z" x="78" y="32">z</text><text class="dy-z" x="84" y="24">z</text></g>' +
        "</svg>" +
        '<div class="dymok-say"></div>';
      this.body = this.el.querySelector(".dy-body");
      this.eyes = [...this.el.querySelectorAll(".dy-eye")];
      this.mouth = this.el.querySelector(".dy-mouth");
      this.say = this.el.querySelector(".dymok-say");
      this.nextBlink = performance.now() + 2000 + Math.random() * 3000;
      this.blinkUntil = 0;
      this.surpriseUntil = 0;
      this.pausedSince = 0;
      this.sayTimer = null;
      this.el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.talk();
      });
    }
    tint(rgb) {
      this.el.style.setProperty("--tint", rgb || "255,255,255");
    }
    surprise() {
      this.surpriseUntil = performance.now() + 700;
    }
    hearts() {
      for (let i = 0; i < 5; i++) {
        const h = document.createElement("div");
        h.className = "dymok-heart";
        h.innerHTML = HEART;
        h.style.setProperty("--dx", (Math.random() * 44 - 22).toFixed(0) + "px");
        h.style.setProperty("--rot", (Math.random() * 50 - 25).toFixed(0) + "deg");
        h.style.animationDelay = i * 90 + "ms";
        this.el.appendChild(h);
        setTimeout(() => h.remove(), 1700 + i * 90);
      }
    }
    talk(text) {
      let msg = text;
      if (!msg) {
        if (!beat.playing) msg = "тсс… я сплю";
        else if (beat.tempo && Math.random() < 0.6) {
          msg = Math.round(beat.tempo) + " BPM";
          if (beat.key >= 0) msg += " · " + KEYS[beat.key] + " " + (beat.mode ? "мажор" : "минор");
        } else msg = PHRASES[Math.floor(Math.random() * PHRASES.length)];
      }
      this.say.textContent = msg;
      this.say.classList.add("is-on");
      clearTimeout(this.sayTimer);
      this.sayTimer = setTimeout(() => this.say.classList.remove("is-on"), 2600);
      this.surpriseUntil = performance.now() + 400;
    }
    frame(now) {
      const playing = beat.playing;
      if (playing) this.pausedSince = 0;
      else if (!this.pausedSince) this.pausedSince = now;
      const sleeping = !playing && now - this.pausedSince > 1800;
      this.el.classList.toggle("is-sleep", sleeping);

      const p = beat.pulse;
      const surprised = now < this.surpriseUntil;
      const sway = playing ? Math.sin(now / 520) * 4 : 0;
      const breathe = sleeping ? Math.sin(now / 900) * 0.025 : 0;
      const jump = surprised ? 5 : p * 7;
      const sx = 1 + p * 0.07 - breathe;
      const sy = 1 - p * 0.09 + breathe;
      this.body.setAttribute(
        "transform",
        "translate(50 78) rotate(" + sway.toFixed(2) + ") scale(" + sx.toFixed(3) + " " + sy.toFixed(3) + ") translate(-50 -78) translate(0 " + (-jump).toFixed(2) + ")"
      );

      // моргание
      if (now > this.nextBlink) {
        this.blinkUntil = now + 130;
        this.nextBlink = now + 2500 + Math.random() * 3500;
      }
      const eyeScale = surprised ? 1.25 : now < this.blinkUntil ? 0.12 : 1;
      this.eyes.forEach((e, i) => {
        if (i < 2) e.setAttribute("ry", (6.2 * eyeScale).toFixed(2));
      });

      // рот: поёт по громкости
      const open = playing ? 1.4 + beat.loud * 6.5 : surprised ? 4 : 1.4;
      this.mouth.setAttribute("ry", open.toFixed(2));
      this.mouth.setAttribute("rx", (playing ? 4.2 + beat.loud * 1.2 : 4.6).toFixed(2));
    }
  }

  /* =================================================================
     Один цикл анимации на всех
     ================================================================= */
  let liked = null;
  let likeCheck = 0;
  function loop(now) {
    updateBeat();
    if (now - likeCheck > 400) {
      likeCheck = now;
      let h = false;
      try {
        h = !!Spicetify.Player.getHeart();
      } catch (e) {
        h = false;
      }
      if (liked === false && h) mascots.forEach((m) => m.hearts());
      liked = h;
    }
    mascots.forEach((m) => m.frame(now));
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // цвет Дымка = свет обложки
  async function retint() {
    const item = Spicetify.Player.data && (Spicetify.Player.data.item || Spicetify.Player.data.track);
    if (!item || !Spicetify.colorExtractor) return;
    try {
      const c = await Spicetify.colorExtractor(item.uri);
      const hex = (c.LIGHT_VIBRANT || c.VIBRANT || "").replace("#", "");
      if (!/^[0-9a-f]{6}$/i.test(hex)) return;
      const n = parseInt(hex, 16);
      let rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      rgb = rgb.map((v) => Math.round(v + (255 - v) * 0.35)); // светлее — Дымок же
      mascots.forEach((m) => m.tint(rgb.join(",")));
      tintNow = rgb.join(",");
    } catch (e) {
      /* оставляем белым */
    }
  }
  let tintNow = "255,255,255";
  Spicetify.Player.addEventListener("songchange", retint);
  retint();

  /* =================================================================
     Публичное API для приложения: window.doppoDymok.mount(host, size)
     ================================================================= */
  function mount(host, size) {
    const m = new Dymok(size || 44);
    m.tint(tintNow);
    host.appendChild(m.el);
    mascots.add(m);
    return {
      el: m.el,
      say: (t) => m.talk(t),
      unmount() {
        mascots.delete(m);
        m.el.remove();
      },
    };
  }
  window.doppoDymok = { mount, beat };

  /* =================================================================
     Дымок в нижнем плеере
     ================================================================= */
  let bar = null;
  const slot = document.createElement("div");
  slot.className = "doppo-dymok-slot";
  function placeInPlaybar() {
    const on = settings().dymok;
    if (!on) {
      if (bar) {
        bar.unmount();
        bar = null;
      }
      slot.remove();
      return;
    }
    const host =
      document.querySelector(".main-nowPlayingBar-right > div") ||
      document.querySelector(".main-nowPlayingBar-right") ||
      document.querySelector("[data-testid='now-playing-bar'] [class*='nowPlayingBar-right']");
    if (!host) return;
    if (!slot.isConnected) host.prepend(slot);
    if (!bar) bar = mount(slot, 40);
  }
  placeInPlaybar();
  setInterval(placeInPlaybar, 1500);
  window.addEventListener("doppo:settings", placeInPlaybar);
})();
