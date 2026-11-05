// doppo-flow — «Мой поток» для Spicetify
// Огромное название трека, обложка в дымке, полоса «артист — трек»,
// лайк, управление и экран синхронизированного текста (LRCLIB / Spotify).

const dfReact = Spicetify.React;
const dfH = dfReact.createElement;
const { useState: dfUseState, useEffect: dfUseEffect, useRef: dfUseRef, useCallback: dfUseCallback } = dfReact;

/* ------------------------------------------------------------------ */
/* Утилиты                                                             */
/* ------------------------------------------------------------------ */

function dfImg(url) {
  if (!url) return "";
  if (url.startsWith("spotify:image:")) return "https://i.scdn.co/image/" + url.slice("spotify:image:".length);
  return url;
}

function dfTime(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function dfReadTrack() {
  const data = Spicetify.Player && Spicetify.Player.data;
  const item = data && (data.item || data.track);
  if (!item) return null;
  const m = item.metadata || {};
  let artists = Array.isArray(item.artists) && item.artists.length ? item.artists.map((a) => a.name) : [];
  if (!artists.length) artists = [m.artist_name, m["artist_name:1"], m["artist_name:2"]].filter(Boolean);
  const albumImages = (item.album && item.album.images) || item.images || [];
  return {
    uri: item.uri || "",
    title: item.name || m.title || "",
    artists,
    album: (item.album && item.album.name) || m.album_title || "",
    cover: dfImg(m.image_xlarge_url || m.image_large_url || m.image_url || (albumImages[0] && albumImages[0].url)),
    duration: Spicetify.Player.getDuration() || Number(m.duration) || (item.duration && item.duration.milliseconds) || 0,
    context:
      (data.context && data.context.metadata && data.context.metadata.context_description) ||
      (data.context_metadata && data.context_metadata.context_description) ||
      "",
  };
}

function dfIsLiked() {
  try {
    return !!Spicetify.Player.getHeart();
  } catch (e) {
    return false;
  }
}

async function dfStartFlow() {
  // «Мой поток»: перемешанные «Мне нравится»
  try {
    let user = Spicetify.Platform && Spicetify.Platform.username;
    if (!user) {
      const res = await Spicetify.CosmosAsync.get("sp://core-session/v1/username");
      user = res && res.username;
    }
    await Spicetify.Player.playUri("spotify:user:" + user + ":collection");
    Spicetify.Player.setShuffle(true);
  } catch (e) {
    Spicetify.Player.play();
  }
}

/* ------------------------------------------------------------------ */
/* Хуки плеера                                                         */
/* ------------------------------------------------------------------ */

function dfUseNowPlaying() {
  const [state, setState] = dfUseState(() => ({
    track: dfReadTrack(),
    playing: Spicetify.Player.isPlaying(),
    liked: dfIsLiked(),
  }));

  dfUseEffect(() => {
    const update = () =>
      setState({ track: dfReadTrack(), playing: Spicetify.Player.isPlaying(), liked: dfIsLiked() });
    Spicetify.Player.addEventListener("songchange", update);
    Spicetify.Player.addEventListener("onplaypause", update);
    // лайк меняется и из других мест — сверяемся раз в секунду
    const id = setInterval(() => {
      setState((s) => {
        const liked = dfIsLiked();
        const playing = Spicetify.Player.isPlaying();
        return s.liked === liked && s.playing === playing ? s : { ...s, liked, playing };
      });
    }, 1000);
    return () => {
      Spicetify.Player.removeEventListener("songchange", update);
      Spicetify.Player.removeEventListener("onplaypause", update);
      clearInterval(id);
    };
  }, []);

  const toggleLike = dfUseCallback(() => {
    try {
      Spicetify.Player.toggleHeart();
      setState((s) => ({ ...s, liked: !s.liked }));
      setTimeout(() => setState((s) => ({ ...s, liked: dfIsLiked() })), 600);
    } catch (e) {
      Spicetify.showNotification("Не удалось сохранить. Попробуй ещё раз", true);
    }
  }, []);

  return { ...state, toggleLike };
}

function dfUseProgress(interval) {
  const [p, setP] = dfUseState(() => Spicetify.Player.getProgress() || 0);
  dfUseEffect(() => {
    const id = setInterval(() => setP(Spicetify.Player.getProgress() || 0), interval);
    return () => clearInterval(id);
  }, [interval]);
  return p;
}

/* ------------------------------------------------------------------ */
/* Дымка вокруг обложки                                                */
/* ------------------------------------------------------------------ */

function DFSmoke({ playing, focusY }) {
  const ref = dfUseRef(null);
  const playingRef = dfUseRef(playing);
  playingRef.current = playing;
  const focusRef = dfUseRef(focusY);
  focusRef.current = focusY;

  dfUseEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let hgt = 0;
    let raf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      hgt = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(hgt * dpr));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const rnd = (a, b) => a + Math.random() * (b - a);
    const wisps = Array.from({ length: 18 }, () => ({
      amp: [rnd(0.03, 0.1), rnd(0.02, 0.08), rnd(0.015, 0.06), rnd(0.01, 0.04)],
      ph: [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)],
      sp: [rnd(-0.6, 0.6), rnd(-0.8, 0.8), rnd(-1, 1), rnd(-1.2, 1.2)],
      alpha: rnd(0.02, 0.085),
      width: rnd(0.8, 6),
      rot: rnd(0, 6.28),
      spin: rnd(-0.06, 0.06),
      scale: rnd(0.78, 1.18),
    }));

    let t = 0;
    let speed = 0.3;
    let last = performance.now();

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      speed += ((playingRef.current ? 1 : 0.2) - speed) * 0.02;
      t += dt * speed;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, hgt);

      const cx = w / 2;
      const cy = hgt * (focusRef.current || 0.5);
      const R = Math.min(w * 0.42, hgt * 0.36);

      const glow = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.6);
      glow.addColorStop(0, "rgba(255,255,255,0.07)");
      glow.addColorStop(0.55, "rgba(255,255,255,0.025)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, hgt);

      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "rgba(255,255,255,0.7)";
      ctx.shadowBlur = 34;
      const steps = 150;
      for (const s of wisps) {
        ctx.beginPath();
        const rot = s.rot + t * s.spin;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          let r = 1;
          for (let k = 0; k < 4; k++) r += s.amp[k] * Math.sin((k + 2) * th + s.ph[k] + t * s.sp[k]);
          r *= R * s.scale;
          const x = cx + Math.cos(th + rot) * r * 1.3;
          const y = cy + Math.sin(th + rot) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(255,255,255," + s.alpha + ")";
        ctx.lineWidth = s.width;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return dfH("canvas", { ref, className: "df-smoke" });
}

/* ------------------------------------------------------------------ */
/* Иконки                                                              */
/* ------------------------------------------------------------------ */

const DF_ICONS = {
  play: "M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z",
  pause: "M7 4.5h3.2v15H7zM13.8 4.5H17v15h-3.2z",
  prev: "M6 5h2.4v14H6zM20 5.6v12.8a.9.9 0 0 1-1.4.75L9.6 12.75a.9.9 0 0 1 0-1.5l9-6.4A.9.9 0 0 1 20 5.6z",
  next: "M15.6 5H18v14h-2.4zM4 5.6v12.8a.9.9 0 0 0 1.4.75l9-6.4a.9.9 0 0 0 0-1.5l-9-6.4A.9.9 0 0 0 4 5.6z",
  heart:
    "M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.8 4 7.3 4c2 0 3.4 1.1 4.7 2.7C13.3 5.1 14.7 4 16.7 4c3.5 0 5.7 3.6 4.5 7.1-1.7 4.8-9.2 9.4-9.2 9.4z",
  lyrics: "M4 6h16M4 10.5h16M4 15h10M4 19.5h7",
  back: "M15 5l-7 7 7 7",
};

function DFIcon({ name, fill, size }) {
  const stroke = name === "lyrics" || name === "back" || (name === "heart" && !fill);
  return dfH(
    "svg",
    { viewBox: "0 0 24 24", width: size || 24, height: size || 24, "aria-hidden": true },
    dfH("path", {
      d: DF_ICONS[name],
      fill: stroke ? "none" : "currentColor",
      stroke: stroke ? "currentColor" : "none",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    })
  );
}

/* ------------------------------------------------------------------ */
/* Элементы управления                                                 */
/* ------------------------------------------------------------------ */

function DFControls({ playing, hasTrack, big }) {
  return dfH(
    "div",
    { className: "df-controls" + (big ? " df-controls--big" : "") },
    dfH("button", { className: "df-ctl", title: "Назад", onClick: () => Spicetify.Player.back() }, dfH(DFIcon, { name: "prev", size: 20 })),
    dfH(
      "button",
      {
        className: "df-ctl df-ctl--play",
        title: playing ? "Пауза" : "Играть",
        onClick: () => (hasTrack ? Spicetify.Player.togglePlay() : dfStartFlow()),
      },
      dfH(DFIcon, { name: playing ? "pause" : "play", size: 24 })
    ),
    dfH("button", { className: "df-ctl", title: "Дальше", onClick: () => Spicetify.Player.next() }, dfH(DFIcon, { name: "next", size: 20 }))
  );
}

function DFHeart({ liked, onClick }) {
  return dfH(
    "button",
    { className: "df-heart" + (liked ? " is-liked" : ""), title: liked ? "Убрать из «Мне нравится»" : "Мне нравится", onClick },
    dfH(DFIcon, { name: "heart", fill: liked, size: 22 })
  );
}

function dfSeekFromEvent(e, duration) {
  const rect = e.currentTarget.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  if (duration) Spicetify.Player.seek(Math.round(frac * duration));
}

/* ------------------------------------------------------------------ */
/* Экран «Мой поток»                                                   */
/* ------------------------------------------------------------------ */

function DFFlowView({ np, progress, onLyrics }) {
  const t = np.track;
  const pct = t && t.duration ? Math.min(100, (progress / t.duration) * 100) : 0;
  const title = t ? t.title : "Мой поток";
  const titleSize = title.length > 26 ? "df-title--s" : title.length > 14 ? "df-title--m" : "";

  return dfH(
    "div",
    { className: "df-flow" },
    dfH("div", { className: "df-badge" }, "Мой поток"),
    dfH("h1", { className: "df-title " + titleSize, title }, title),
    dfH(
      "div",
      { className: "df-cover" + (np.playing ? " is-playing" : "") },
      t && t.cover
        ? dfH("img", { src: t.cover, alt: "", draggable: false })
        : dfH("div", { className: "df-cover__empty" }, dfH(DFIcon, { name: "play", size: 64 }))
    ),
    dfH("div", { className: "df-album" }, t ? t.album : "Включи что-нибудь — и поток подхватит"),
    dfH(
      "div",
      { className: "df-barrow" },
      dfH("button", { className: "df-side", title: "Текст песни", onClick: onLyrics, disabled: !t }, dfH(DFIcon, { name: "lyrics", size: 20 })),
      dfH(
        "div",
        { className: "df-pill", onClick: (e) => t && dfSeekFromEvent(e, t.duration) },
        dfH("div", { className: "df-pill__fill", style: { width: pct + "%" } }),
        dfH("div", { className: "df-pill__text" }, t ? (t.artists.join(", ") || "—") + " — " + t.title : "Нажми ▶ чтобы запустить поток")
      ),
      dfH(DFHeart, { liked: np.liked, onClick: np.toggleLike })
    ),
    dfH(DFControls, { playing: np.playing, hasTrack: !!t, big: true }),
    t && t.context ? dfH("div", { className: "df-context" }, "Играет из: " + t.context) : null
  );
}

/* ------------------------------------------------------------------ */
/* Текст песни                                                         */
/* ------------------------------------------------------------------ */

const dfLyricsCache = new Map();

function dfParseLrc(lrc) {
  const out = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const s of stamps) out.push({ time: (Number(s[1]) * 60 + Number(s[2])) * 1000, text });
  }
  return out.sort((a, b) => a.time - b.time);
}

async function dfFetchJson(url) {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.json();
    if (r.status === 404) return null;
  } catch (e) {
    /* CORS/сеть — пробуем через Cosmos */
  }
  try {
    return await Spicetify.CosmosAsync.get(url);
  } catch (e) {
    return null;
  }
}

function dfFromLrclib(j) {
  if (!j) return null;
  if (j.syncedLyrics) return { synced: true, lines: dfParseLrc(j.syncedLyrics), source: "LRCLIB" };
  if (j.plainLyrics) return { synced: false, lines: j.plainLyrics.split(/\r?\n/).map((text) => ({ time: 0, text })), source: "LRCLIB" };
  return null;
}

async function dfGetLyrics(t) {
  if (!t || !t.uri) return null;
  if (dfLyricsCache.has(t.uri)) return dfLyricsCache.get(t.uri);

  let result = null;
  const artist = t.artists[0] || "";

  // 1) LRCLIB — точное совпадение
  const q = new URLSearchParams({ artist_name: artist, track_name: t.title, album_name: t.album, duration: String(Math.round(t.duration / 1000)) });
  result = dfFromLrclib(await dfFetchJson("https://lrclib.net/api/get?" + q));

  // 2) LRCLIB — поиск
  if (!result) {
    const s = new URLSearchParams({ track_name: t.title, artist_name: artist });
    const list = await dfFetchJson("https://lrclib.net/api/search?" + s);
    if (Array.isArray(list) && list.length) result = dfFromLrclib(list.find((x) => x.syncedLyrics) || list[0]);
  }

  // 3) Встроенный текст Spotify
  if (!result && t.uri.startsWith("spotify:track:")) {
    try {
      const id = t.uri.split(":")[2];
      const j = await Spicetify.CosmosAsync.get(
        "https://spclient.wg.spotify.com/color-lyrics/v2/track/" + id + "?format=json&vocalRemoval=false&market=from_token"
      );
      const lines = j && j.lyrics && j.lyrics.lines;
      if (lines && lines.length) {
        result = {
          synced: j.lyrics.syncType === "LINE_SYNCED",
          lines: lines.map((l) => ({ time: Number(l.startTimeMs) || 0, text: l.words === "♪" ? "" : l.words })),
          source: "Spotify",
        };
      }
    } catch (e) {
      /* нет текста */
    }
  }

  if (result) result.lines = result.lines.filter((l, i, arr) => l.text || (i > 0 && arr[i - 1].text));
  dfLyricsCache.set(t.uri, result);
  return result;
}

function DFLyricsPane({ track, progress }) {
  const [state, setState] = dfUseState({ status: "loading" });
  const boxRef = dfUseRef(null);
  const uri = track && track.uri;

  dfUseEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    dfGetLyrics(track)
      .then((r) => alive && setState(r && r.lines.length ? { status: "ok", ...r } : { status: "none" }))
      .catch(() => alive && setState({ status: "none" }));
    return () => {
      alive = false;
    };
  }, [uri]);

  let active = -1;
  if (state.status === "ok" && state.synced) {
    for (let i = 0; i < state.lines.length; i++) {
      if (state.lines[i].time <= progress + 250) active = i;
      else break;
    }
  }

  dfUseEffect(() => {
    const box = boxRef.current;
    if (!box || active < 0) return;
    const el = box.children[active];
    if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.32, behavior: "smooth" });
  }, [active]);

  if (state.status === "loading") return dfH("div", { className: "df-lyrics__msg" }, "Ищем текст…");
  if (state.status === "none") return dfH("div", { className: "df-lyrics__msg" }, "Текста для этого трека пока нет");

  return dfH(
    dfReact.Fragment,
    null,
    dfH(
      "div",
      { className: "df-lyrics__lines" + (state.synced ? "" : " is-plain"), ref: boxRef },
      state.lines.map((l, i) =>
        dfH(
          "div",
          {
            key: i,
            className: "df-line" + (i === active ? " is-active" : i < active ? " is-past" : ""),
            onClick: state.synced ? () => Spicetify.Player.seek(Math.max(1, l.time)) : undefined,
          },
          l.text || "♪"
        )
      )
    ),
    dfH("div", { className: "df-lyrics__src" }, "Текст · " + state.source)
  );
}

function DFLyricsView({ np, progress, onBack }) {
  const t = np.track;
  if (!t) return dfH(DFFlowView, { np, progress, onLyrics: onBack });
  const pct = t.duration ? Math.min(100, (progress / t.duration) * 100) : 0;

  return dfH(
    "div",
    { className: "df-lyrics" },
    dfH(
      "div",
      { className: "df-lyrics__left" },
      dfH("button", { className: "df-back", onClick: onBack }, dfH(DFIcon, { name: "back", size: 18 }), "Мой поток"),
      dfH("div", { className: "df-lcover" }, t.cover ? dfH("img", { src: t.cover, alt: "", draggable: false }) : null),
      dfH(
        "div",
        { className: "df-lmeta" },
        dfH("div", { className: "df-lmeta__text" }, dfH("div", { className: "df-ltitle" }, t.title), dfH("div", { className: "df-lartist" }, t.artists.join(", "))),
        dfH(DFHeart, { liked: np.liked, onClick: np.toggleLike })
      ),
      dfH(
        "div",
        { className: "df-line-progress", onClick: (e) => dfSeekFromEvent(e, t.duration) },
        dfH("div", { className: "df-line-progress__fill", style: { width: pct + "%" } }),
        dfH("div", { className: "df-line-progress__knob", style: { left: pct + "%" } })
      ),
      dfH("div", { className: "df-times" }, dfH("span", null, dfTime(progress)), dfH("span", null, dfTime(t.duration))),
      dfH(DFControls, { playing: np.playing, hasTrack: true })
    ),
    dfH(
      "div",
      { className: "df-lyrics__right" },
      t.context ? dfH("div", { className: "df-lyrics__ctx" }, dfH("small", null, "Играет из"), dfH("b", null, t.context)) : null,
      dfH(DFLyricsPane, { track: t, progress })
    )
  );
}

/* ------------------------------------------------------------------ */
/* Корень                                                              */
/* ------------------------------------------------------------------ */

function DoppoFlow() {
  const np = dfUseNowPlaying();
  const [mode, setMode] = dfUseState(() => localStorage.getItem("doppo-flow:mode") || "flow");
  const progress = dfUseProgress(mode === "lyrics" ? 120 : 400);

  const go = (m) => {
    setMode(m);
    localStorage.setItem("doppo-flow:mode", m);
  };

  dfEnsureStyle();

  return dfH(
    "div",
    { className: "df-root df-root--" + mode },
    dfH(DFSmoke, { playing: np.playing, focusY: mode === "lyrics" ? 0.45 : 0.5 }),
    mode === "lyrics" && np.track
      ? dfH(DFLyricsView, { np, progress, onBack: () => go("flow") })
      : dfH(DFFlowView, { np, progress, onLyrics: () => go("lyrics") })
  );
}

function render() {
  return dfH(DoppoFlow, null);
}

/* ------------------------------------------------------------------ */
/* Стили                                                               */
/* ------------------------------------------------------------------ */

function dfEnsureStyle() {
  if (document.getElementById("doppo-flow-style")) return;
  const el = document.createElement("style");
  el.id = "doppo-flow-style";
  el.textContent = DF_CSS;
  document.head.appendChild(el);
}

const DF_CSS = `
.df-root {
  --df-font: "Onest", "Inter", "Segoe UI", system-ui, sans-serif;
  --df-accent: #ffd60a;
  --df-heart: #ff5c8a;
  position: relative;
  min-height: calc(100vh - 160px);
  height: 100%;
  overflow: hidden;
  font-family: var(--df-font);
  color: #fff;
  background:
    radial-gradient(120% 80% at 50% 45%, #2a2a2e 0%, #1b1b1e 45%, #121214 100%);
  isolation: isolate;
}
.df-smoke {
  position: absolute; inset: 0; width: 100%; height: 100%;
  z-index: 0; pointer-events: none; filter: blur(3px); opacity: 1;
}
.df-root button { font-family: inherit; }

/* ---------- поток ---------- */
.df-flow {
  position: relative; z-index: 1;
  min-height: inherit;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 32px 40px; gap: 0;
  text-align: center;
}
.df-badge {
  padding: 6px 16px; border-radius: 999px;
  background: rgba(255, 214, 10, .88); color: #241c00;
  border: 1.5px solid #ffe45c;
  font-weight: 800; font-size: 15px; letter-spacing: -.01em;
  box-shadow: 0 0 24px rgba(255, 214, 10, .25);
}
.df-title {
  margin: 14px 0 26px; max-width: min(92%, 1100px);
  font-size: clamp(48px, 7.4vw, 112px); line-height: .98;
  font-weight: 800; letter-spacing: -.045em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: #f4f4f2;
  text-shadow: 0 6px 40px rgba(0,0,0,.35);
}
.df-title--m { font-size: clamp(40px, 5.6vw, 86px); }
.df-title--s { font-size: clamp(30px, 4vw, 60px); white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.df-cover {
  width: clamp(200px, 30vh, 380px); aspect-ratio: 1; border-radius: 22px; overflow: hidden;
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06);
  transform: scale(.97); transition: transform .6s cubic-bezier(.2,.8,.2,1);
  background: #222226;
}
.df-cover.is-playing { transform: scale(1); }
.df-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.df-cover__empty { width: 100%; height: 100%; display: grid; place-items: center; color: rgba(255,255,255,.25); }
.df-album {
  margin: 22px 0 18px; font-size: 22px; font-weight: 800; letter-spacing: -.03em;
  color: rgba(255,255,255,.92); max-width: 80%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.df-barrow {
  display: flex; align-items: center; gap: 14px;
  width: min(760px, 92%);
}
.df-pill {
  position: relative; flex: 1; height: 58px; border-radius: 999px; overflow: hidden; cursor: pointer;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.14);
  backdrop-filter: blur(14px);
}
.df-pill__fill {
  position: absolute; inset: 0 auto 0 0;
  background: linear-gradient(90deg, rgba(255,255,255,.10), rgba(255,255,255,.16));
  border-right: 1px solid rgba(255,255,255,.18);
  transition: width .35s linear;
}
.df-pill__text {
  position: relative; height: 100%; display: flex; align-items: center; justify-content: center;
  padding: 0 28px; font-weight: 700; font-size: 15px; color: rgba(255,255,255,.9);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.df-pill:hover { border-color: rgba(255,255,255,.24); }
.df-side, .df-heart {
  width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
  display: grid; place-items: center; cursor: pointer;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.75); transition: all .15s ease;
}
.df-side:hover, .df-heart:hover { color: #fff; background: rgba(255,255,255,.1); }
.df-side:disabled { opacity: .35; cursor: default; }
.df-heart.is-liked { color: var(--df-heart); }
.df-heart:active { transform: scale(.9); }

.df-controls { display: flex; align-items: center; justify-content: center; gap: 22px; margin-top: 22px; }
.df-ctl {
  width: 46px; height: 46px; border-radius: 50%; border: 0; cursor: pointer;
  display: grid; place-items: center; color: rgba(255,255,255,.85); background: transparent;
  transition: transform .12s ease, color .15s ease, background .15s ease;
}
.df-ctl:hover { color: #fff; background: rgba(255,255,255,.06); }
.df-ctl:active { transform: scale(.92); }
.df-ctl--play {
  width: 58px; height: 58px; background: #fff; color: #000;
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
}
.df-ctl--play:hover { background: #fff; color: #000; transform: scale(1.05); }
.df-controls--big .df-ctl--play { width: 64px; height: 64px; }
.df-context { margin-top: 18px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,.45); }

/* ---------- текст ---------- */
.df-lyrics {
  position: relative; z-index: 1; min-height: inherit; height: calc(100vh - 160px);
  display: grid; grid-template-columns: minmax(280px, 420px) 1fr; gap: clamp(32px, 5vw, 80px);
  padding: 40px clamp(28px, 5vw, 72px);
}
.df-lyrics__left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.df-back {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  margin-bottom: 22px; padding: 7px 14px 7px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.8); font-weight: 700; font-size: 13px;
}
.df-back:hover { color: #fff; background: rgba(255,255,255,.1); }
.df-lcover { width: 100%; aspect-ratio: 1; border-radius: 18px; overflow: hidden; background: #222226;
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06); }
.df-lcover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.df-lmeta { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 22px 0 14px; }
.df-lmeta__text { min-width: 0; }
.df-lmeta .df-heart { background: transparent; border-color: transparent; }
.df-ltitle { font-size: 22px; font-weight: 800; letter-spacing: -.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.df-lartist { margin-top: 2px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; color: rgba(255,255,255,.55); }
.df-line-progress { position: relative; height: 18px; cursor: pointer; }
.df-line-progress::before { content: ""; position: absolute; left: 0; right: 0; top: 7px; height: 4px; border-radius: 4px; background: rgba(255,255,255,.18); }
.df-line-progress__fill { position: absolute; left: 0; top: 7px; height: 4px; border-radius: 4px; background: #fff; }
.df-line-progress__knob { position: absolute; top: 3px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: #fff; box-shadow: 0 0 10px rgba(255,255,255,.5); }
.df-times { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: rgba(255,255,255,.55); margin-top: 2px; }
.df-lyrics .df-controls { margin-top: 10px; }

.df-lyrics__right { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.df-lyrics__ctx { display: flex; flex-direction: column; gap: 2px; padding-top: 6px; margin-bottom: 10px; }
.df-lyrics__ctx small { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.5); }
.df-lyrics__ctx b { font-size: 26px; font-weight: 800; letter-spacing: -.03em; color: rgba(255,255,255,.28); }
.df-lyrics__lines {
  flex: 1; overflow-y: auto; scrollbar-width: none; padding: 30vh 0 40vh;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 18%, #000 70%, transparent 100%);
          mask-image: linear-gradient(180deg, transparent 0%, #000 18%, #000 70%, transparent 100%);
}
.df-lyrics__lines::-webkit-scrollbar { display: none; }
.df-lyrics__lines.is-plain { padding: 4vh 0 10vh; }
.df-line {
  font-size: clamp(28px, 3.4vw, 54px); line-height: 1.1; font-weight: 800; letter-spacing: -.035em;
  color: rgba(255,255,255,.3); margin: 0 0 .45em; cursor: pointer;
  transform-origin: left center; transition: color .35s ease, transform .35s ease, filter .35s ease;
  filter: blur(.4px);
}
.df-line.is-past { color: rgba(255,255,255,.42); }
.df-line.is-active { color: #fff; transform: scale(1.04); filter: none; text-shadow: 0 0 30px rgba(255,255,255,.18); }
.df-line:hover { color: rgba(255,255,255,.75); }
.df-lyrics__lines.is-plain .df-line { color: rgba(255,255,255,.85); cursor: default; filter: none; font-size: clamp(22px, 2.4vw, 36px); }
.df-lyrics__src { padding-top: 8px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,.4); }
.df-lyrics__msg { margin: auto 0; font-size: 28px; font-weight: 800; letter-spacing: -.03em; color: rgba(255,255,255,.35); }

@media (max-width: 900px) {
  .df-lyrics { grid-template-columns: 1fr; height: auto; }
  .df-lyrics__lines { max-height: 60vh; padding: 10vh 0 20vh; }
}
`;
