// doppo — кастомное приложение Spicetify «Мой поток»
// Маршруты: /doppo — поток, /doppo/lyrics — текст песни.
// Огромное название трека, обложка в дымке, полоса «артист — трек»,
// лайк, управление и синхронизированный текст (LRCLIB / Spotify).
// Всё управление идёт через штатный плеер Spotify (Spicetify.Player),
// поэтому нижний плеер, очередь, устройства и т.д. продолжают работать.

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

function DFSmoke({ playing, focusY, tint }) {
  const ref = dfUseRef(null);
  const tintRef = dfUseRef(tint);
  tintRef.current = tint || "255,255,255";
  const playingRef = dfUseRef(playing);
  playingRef.current = playing;
  const focusRef = dfUseRef(focusY);
  focusRef.current = focusY;

  dfUseEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    // рисуем в пониженном разрешении: CSS-размытие всё равно смягчает края
    const dpr = 0.6;
    const releaseBeat = window.doppoBeat && window.doppoBeat.acquire ? window.doppoBeat.acquire() : null;
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
      tinted: Math.random() < 0.45,
    }));

    let t = 0;
    let speed = 0.3;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e[0].isIntersecting));
    io.observe(canvas);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      // 30 кадров в секунду и пауза, когда дымку не видно
      if (now - last < 32 || !visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const pulse = (window.doppoBeat && window.doppoBeat.pulse) || 0;
      speed += ((playingRef.current ? 1 : 0.2) - speed) * 0.02;
      t += dt * speed * (1 + pulse * 0.6);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, hgt);

      const cx = w / 2;
      const cy = hgt * (focusRef.current || 0.5);
      const R = Math.min(w * 0.42, hgt * 0.36) * (1 + pulse * 0.035);

      const glow = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.6);
      glow.addColorStop(0, "rgba(" + tintRef.current + ",0.10)");
      glow.addColorStop(0.55, "rgba(" + tintRef.current + ",0.035)");
      glow.addColorStop(1, "rgba(" + tintRef.current + ",0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, hgt);

      ctx.globalCompositeOperation = "lighter";
      const steps = 96;
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
        ctx.strokeStyle = "rgba(" + (s.tinted ? tintRef.current : "255,255,255") + "," + (s.tinted ? s.alpha * 1.6 : s.alpha) * (1 + pulse * 0.9) + ")";
        ctx.lineWidth = s.width;
        ctx.stroke();
        // мягкий ореол вместо дорогого shadowBlur
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = s.width * 5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      if (releaseBeat) releaseBeat();
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
  focus: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  unfocus: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  minus: "M6 12h12",
  plus: "M6 12h12M12 6v12",
  copy: "M9 9h10v11H9zM5 15V4h10",
  shuffle: "M3 7h3.5c2 0 3 1 4.2 2.6l2.6 3.8C14.5 15 15.5 17 17.5 17H21M3 17h3.5c1.6 0 2.5-.7 3.4-1.8M13.6 8.8c.9-1.1 1.9-1.8 3.9-1.8H21M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5",
  search: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5 20 20",
  clock: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 7.5V12l3 2",
};

function DFIcon({ name, fill, size }) {
  const stroke = ["lyrics", "back", "focus", "unfocus", "minus", "plus", "copy", "shuffle", "search", "clock"].includes(name) || (name === "heart" && !fill);
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
  if (duration) DFClock.seek(frac * duration);
}

/* ------------------------------------------------------------------ */
/* Цвета обложки → CSS-переменные                                      */
/* ------------------------------------------------------------------ */

const dfColorCache = new Map();

function dfHexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// осветляем слишком тёмные цвета, чтобы дымка и подсветка были видны
function dfLift(rgb, minL) {
  const [r, g, b] = rgb;
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
  if (l >= minL) return rgb;
  const k = (minL - l) / (1 - l || 1);
  return [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k].map(Math.round);
}

function dfUseCoverColors(uri) {
  const [colors, setColors] = dfUseState(() => dfColorCache.get(uri) || null);
  dfUseEffect(() => {
    if (!uri || !Spicetify.colorExtractor) return;
    if (dfColorCache.has(uri)) return setColors(dfColorCache.get(uri));
    let alive = true;
    Spicetify.colorExtractor(uri)
      .then((c) => {
        const glow = dfHexToRgb(c.LIGHT_VIBRANT) || dfHexToRgb(c.VIBRANT) || dfHexToRgb(c.PROMINENT);
        const deep = dfHexToRgb(c.DARK_VIBRANT) || dfHexToRgb(c.DESATURATED) || dfHexToRgb(c.PROMINENT);
        if (!glow || !deep) return;
        const res = { glow: dfLift(glow, 0.62).join(","), deep: deep.join(",") };
        dfColorCache.set(uri, res);
        if (alive) setColors(res);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uri]);
  return colors;
}

/* ------------------------------------------------------------------ */
/* Фон: размытая обложка + дымка                                        */
/* ------------------------------------------------------------------ */

async function dfFetchCanvas(uri) {
  const GQL = Spicetify.GraphQL;
  const def = GQL && GQL.Definitions && GQL.Definitions.canvas;
  if (!def || !uri || !uri.startsWith("spotify:track:")) return null;
  try {
    const res = await GQL.Request(def, { uri });
    const c = res && res.data && res.data.trackUnion && res.data.trackUnion.canvas;
    return c && c.url && /\.mp4(\?|$)/.test(c.url) ? c.url : null;
  } catch (e) {
    return null;
  }
}

const dfCanvasCache = new Map();
function dfUseCanvas(uri, enabled) {
  const [url, setUrl] = dfUseState(null);
  dfUseEffect(() => {
    setUrl(null);
    if (!enabled || !uri) return;
    if (dfCanvasCache.has(uri)) return setUrl(dfCanvasCache.get(uri));
    let alive = true;
    dfFetchCanvas(uri).then((u) => {
      dfCanvasCache.set(uri, u);
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [uri, enabled]);
  return url;
}

function DFBackdrop({ track, playing, colors, mode, smoke, canvas }) {
  return dfH(
    "div",
    { className: "df-backdrop" + (canvas ? " has-canvas" : "") },
    track && track.cover ? dfH("div", { className: "df-backdrop__art", key: track.cover, style: { backgroundImage: "url(" + track.cover + ")" } }) : null,
    canvas ? dfH("video", { className: "df-backdrop__canvas", key: canvas, src: canvas, autoPlay: true, muted: true, loop: true, playsInline: true }) : null,
    dfH("div", { className: "df-backdrop__shade" }),
    smoke ? dfH(DFSmoke, { playing, focusY: mode === "lyrics" ? 0.5 : 0.47, tint: colors ? colors.glow : null }) : null,
    dfH("div", { className: "df-backdrop__grain" })
  );
}

/* ------------------------------------------------------------------ */
/* «Дальше в очереди»                                                  */
/* ------------------------------------------------------------------ */

function dfReadUpNext() {
  try {
    const q = Spicetify.Queue && Spicetify.Queue.nextTracks;
    const next = q && q.find((x) => {
      const ct = x && (x.contextTrack || x);
      return ct && ct.uri && ct.uri.startsWith("spotify:track:") && x.provider !== "ad";
    });
    if (!next) return null;
    const ct = next.contextTrack || next;
    const m = ct.metadata || {};
    if (!m.title) return null;
    return {
      uri: ct.uri,
      title: m.title,
      artist: [m.artist_name, m["artist_name:1"]].filter(Boolean).join(", "),
      cover: dfImg(m.image_url || m.image_large_url || m.image_small_url),
    };
  } catch (e) {
    return null;
  }
}

function dfUseUpNext(uri) {
  const [next, setNext] = dfUseState(dfReadUpNext);
  dfUseEffect(() => {
    const read = () => setNext((cur) => {
      const n = dfReadUpNext();
      return cur && n && cur.uri === n.uri ? cur : n;
    });
    read();
    const id = setInterval(read, 2500);
    return () => clearInterval(id);
  }, [uri]);
  return next;
}

function DFUpNext({ next }) {
  if (!next) return null;
  return dfH(
    "button",
    { className: "df-upnext", key: next.uri, onClick: () => Spicetify.Player.next(), title: "Включить следующий" },
    next.cover ? dfH("img", { src: next.cover, alt: "" }) : null,
    dfH(
      "div",
      { className: "df-upnext__text" },
      dfH("small", null, "Дальше"),
      dfH("b", null, next.title),
      dfH("span", null, next.artist)
    )
  );
}

/* ------------------------------------------------------------------ */
/* Экран «Мой поток»                                                   */
/* ------------------------------------------------------------------ */

function DFFlowView({ np, progress, lyrics, onLyrics }) {
  const t = np.track;
  const pct = t && t.duration ? Math.min(100, (progress / t.duration) * 100) : 0;
  const title = t ? t.title : "Мой поток";
  const titleSize = title.length > 26 ? "df-title--s" : title.length > 14 ? "df-title--m" : "";
  const live = lyrics.status === "ok" && (lyrics.data.kind === "word" || lyrics.data.kind === "line");

  return dfH(
    "div",
    { className: "df-flow" + (live ? " df-flow--live" : "") },
    dfH("div", { className: "df-badge" }, "Мой поток"),
    dfH("h1", { className: "df-title " + titleSize, title }, title),
    dfH(
      "div",
      { className: "df-cover" + (np.playing ? " is-playing" : ""), onClick: t ? onLyrics : undefined, title: t ? "Открыть текст" : "" },
      t && t.cover
        ? dfH("img", { src: t.cover, alt: "", draggable: false, key: t.cover })
        : dfH("div", { className: "df-cover__empty" }, dfH(DFIcon, { name: "play", size: 64 }))
    ),
    dfH("div", { className: "df-album" }, t ? t.album : "Включи что-нибудь — и поток подхватит"),
    dfH(
      "div",
      { className: "df-barrow" },
      dfH(
        "button",
        { className: "df-side" + (lyrics.status === "ok" ? " has-lyrics" : ""), title: "Текст песни", onClick: onLyrics, disabled: !t },
        dfH(DFIcon, { name: "lyrics", size: 20 })
      ),
      dfH(
        "div",
        { className: "df-pill", onClick: (e) => t && dfSeekFromEvent(e, t.duration) },
        dfH("div", { className: "df-pill__fill", style: { width: pct + "%" } }),
        dfH("div", { className: "df-pill__text" }, t ? (t.artists.join(", ") || "—") + " — " + t.title : "Нажми ▶ чтобы запустить поток")
      ),
      dfH(DFHeart, { liked: np.liked, onClick: np.toggleLike })
    ),
    live ? dfH(DFLiveLine, { data: lyrics.data, onOpen: onLyrics, key: t.uri }) : null,
    dfH(DFControls, { playing: np.playing, hasTrack: !!t, big: true }),
    t && t.context ? dfH("div", { className: "df-context" }, "Играет из: " + t.context) : null
  );
}

/* ------------------------------------------------------------------ */
/* Экран текста                                                        */
/* ------------------------------------------------------------------ */

function DFLyricsPanel({ track, lyrics, focus }) {
  if (lyrics.status === "loading") {
    return dfH(
      "div",
      { className: "dfk-skeleton" },
      [92, 70, 84, 56, 76].map((w, i) => dfH("i", { key: i, style: { width: w + "%", animationDelay: i * 0.12 + "s" } }))
    );
  }
  if (lyrics.status === "none") {
    return dfH(
      "div",
      { className: "dfk-empty" },
      dfH("b", null, "Тут без слов"),
      dfH("span", null, "Ни Musixmatch, ни Spotify, ни LRCLIB не знают текст этого трека")
    );
  }
  const data = lyrics.data;
  if (data.kind === "instrumental") {
    return dfH("div", { className: "dfk-empty" }, dfH("b", null, "♪ Инструментал"), dfH("span", null, "Просто слушай"));
  }
  if (data.kind === "plain") return dfH(DFPlainLyrics, { data, key: track.uri });
  return dfH(DFKaraoke, { data, focus, key: track.uri, onSeek: (ms) => DFClock.seek(ms) });
}

function DFLyricsView({ np, progress, lyrics, focus, onBack, onFocus }) {
  const t = np.track;
  const pct = t.duration ? Math.min(100, (progress / t.duration) * 100) : 0;
  const [offset, setOffset] = dfUseState(dfLyricsOffset);
  const bumpOffset = (d) => {
    const v = Math.round((dfLyricsOffset() + d) * 10) / 10;
    localStorage.setItem(DF_OFFSET_KEY, String(v));
    setOffset(v);
  };
  dfUseEffect(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === "[") bumpOffset(-100);
      if (e.key === "]") bumpOffset(100);
      if ((e.key === "c" || e.key === "с") && !e.metaKey && !e.ctrlKey) copyRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const source = lyrics.status === "ok" ? lyrics.data.source : null;
  const copyLine = () => {
    if (lyrics.status !== "ok") return;
    const lines = lyrics.data.lines.filter((l) => !l.interlude);
    let line = null;
    if (lyrics.data.kind === "word" || lyrics.data.kind === "line") {
      const t0 = DFClock.now() + dfLyricsOffset();
      const all = lyrics.data.lines;
      const i = dfFindActive(all, t0);
      line = all.slice(0, i + 1).reverse().find((l) => !l.interlude) || lines[0];
    }
    const text = line ? line.text : lines.map((l) => l.text).join("\n");
    const id = (t.uri || "").split(":")[2];
    const payload = "«" + text.trim() + "»\n— " + t.artists.join(", ") + ", " + t.title + (id ? "\nhttps://open.spotify.com/track/" + id : "");
    const done = () => Spicetify.showNotification(line ? "Строка скопирована" : "Текст скопирован");
    const fallback = () => {
      try {
        Spicetify.Platform.ClipboardAPI.copy(payload);
        done();
      } catch (e) {
        Spicetify.showNotification("Не получилось скопировать", true);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(payload).then(done, fallback);
    else fallback();
  };
  const copyRef = dfUseRef(copyLine);
  copyRef.current = copyLine;
  const kindLabel =
    lyrics.status === "ok" ? { word: "по словам", line: "по строкам", plain: "без синхронизации", instrumental: "" }[lyrics.data.kind] : "";

  return dfH(
    "div",
    { className: "df-lyrics" + (focus ? " df-lyrics--focus" : "") },
    dfH(
      "div",
      { className: "df-lyrics__left" },
      dfH("button", { className: "df-back", onClick: onBack }, dfH(DFIcon, { name: "back", size: 18 }), "Мой поток"),
      dfH("div", { className: "df-lcover" }, t.cover ? dfH("img", { src: t.cover, alt: "", draggable: false, key: t.cover }) : null),
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
      dfH(
        "div",
        { className: "df-lyrics__head" },
        focus
          ? dfH("div", { className: "df-lyrics__ctx" }, dfH("small", null, t.artists.join(", ")), dfH("b", null, t.title))
          : t.context
          ? dfH("div", { className: "df-lyrics__ctx" }, dfH("small", null, "Играет из"), dfH("b", null, t.context))
          : dfH("div"),
        dfH(
          "div",
          { className: "df-lyrics__tools" },
          lyrics.status === "ok" && lyrics.data.kind !== "plain" && lyrics.data.kind !== "instrumental"
            ? dfH(
                "div",
                { className: "df-offset", title: "Сдвиг текста — клавиши [ и ]" },
                dfH("button", { onClick: () => bumpOffset(-100) }, dfH(DFIcon, { name: "minus", size: 14 })),
                dfH("span", null, (offset > 0 ? "+" : "") + (offset / 1000).toFixed(1) + " с"),
                dfH("button", { onClick: () => bumpOffset(100) }, dfH(DFIcon, { name: "plus", size: 14 }))
              )
            : null,
          lyrics.status === "ok" && lyrics.data.kind !== "instrumental"
            ? dfH("button", { className: "df-tool", onClick: copyLine, title: "Скопировать текущую строку со ссылкой на трек (C)" }, dfH(DFIcon, { name: "copy", size: 15 }), "Строка")
            : null,
          dfH(
            "button",
            { className: "df-tool" + (focus ? " is-on" : ""), onClick: onFocus, title: "Сцена — только текст (F)" },
            dfH(DFIcon, { name: focus ? "unfocus" : "focus", size: 16 }),
            focus ? "Обычный вид" : "Сцена"
          )
        )
      ),
      dfH("div", { className: "df-lyrics__body" }, dfH(DFLyricsPanel, { track: t, lyrics, focus })),
      source ? dfH("div", { className: "df-lyrics__src" }, "Текст · " + source + (kindLabel ? " · " + kindLabel : "")) : null
    )
  );
}

/* ------------------------------------------------------------------ */
/* Корень                                                              */
/* ------------------------------------------------------------------ */

const DF_ROUTE = "/doppo";
const DF_SETTINGS_KEY = "doppo:settings";
const DF_FOCUS_KEY = "doppo:lyrics-focus";

function dfSettings() {
  try {
    return Object.assign({ smoke: true }, JSON.parse(localStorage.getItem(DF_SETTINGS_KEY) || "{}"));
  } catch (e) {
    return { smoke: true };
  }
}

function dfUseRoute() {
  const History = Spicetify.Platform.History;
  const [path, setPath] = dfUseState(() => History.location.pathname);
  dfUseEffect(() => History.listen((loc) => setPath((loc && loc.pathname) || History.location.pathname)), []);
  return path;
}

// заранее грузим текст следующего трека в очереди
function dfPrefetchNext() {
  try {
    const next = Spicetify.Queue && Spicetify.Queue.nextTracks && Spicetify.Queue.nextTracks[0];
    const ct = next && (next.contextTrack || next);
    const m = (ct && ct.metadata) || {};
    if (!ct || !ct.uri || !ct.uri.startsWith("spotify:track:")) return;
    DFLyrics.get({
      uri: ct.uri,
      title: m.title || "",
      artists: [m.artist_name, m["artist_name:1"]].filter(Boolean),
      album: m.album_title || "",
      duration: Number(m.duration) || 0,
    });
  } catch (e) {
    /* очередь недоступна — не страшно */
  }
}

function DoppoFlow() {
  const np = dfUseNowPlaying();
  const path = dfUseRoute();
  const mode = path.startsWith(DF_ROUTE + "/lyrics")
    ? "lyrics"
    : path.startsWith(DF_ROUTE + "/collection")
    ? "collection"
    : path.startsWith(DF_ROUTE + "/liked")
    ? "liked"
    : "flow";
  const isPage = mode === "collection" || mode === "liked";
  const progress = dfUseProgress(mode === "lyrics" ? 250 : 400);
  const [settings, setSettings] = dfUseState(dfSettings);
  const [focus, setFocus] = dfUseState(() => localStorage.getItem(DF_FOCUS_KEY) === "1");
  const focusRef = dfUseRef(focus);
  focusRef.current = focus;
  const lyrics = dfUseLyrics(isPage ? null : np.track);
  const colors = dfUseCoverColors(np.track && np.track.uri);
  const upNext = dfUseUpNext(np.track && np.track.uri);
  const canvas = dfUseCanvas(np.track && np.track.uri, settings.canvas !== false && !isPage);

  dfUseEffect(() => {
    const onChange = () => setSettings(dfSettings());
    window.addEventListener("doppo:settings", onChange);
    return () => window.removeEventListener("doppo:settings", onChange);
  }, []);

  dfUseEffect(() => {
    const id = setTimeout(dfPrefetchNext, 4000);
    return () => clearTimeout(id);
  }, [np.track && np.track.uri]);

  const toggleFocus = () =>
    setFocus((f) => {
      localStorage.setItem(DF_FOCUS_KEY, f ? "0" : "1");
      return !f;
    });

  dfUseEffect(() => {
    if (mode !== "lyrics") return;
    const onKey = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") toggleFocus();
      if (e.key === "Escape") {
        if (focusRef.current) {
          localStorage.setItem(DF_FOCUS_KEY, "0");
          setFocus(false);
        } else toFlowRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const History = Spicetify.Platform.History;
  const toLyrics = () => History.push(DF_ROUTE + "/lyrics", { doppoFrom: DF_ROUTE });
  // «назад» из текста: туда, откуда пришли (поток, другая вкладка), иначе — в поток
  const toFlow = () => {
    const st = History.location && History.location.state;
    if (st && st.doppoFrom && History.goBack) History.goBack();
    else History.push(DF_ROUTE);
  };
  const toFlowRef = dfUseRef(toFlow);
  toFlowRef.current = toFlow;

  const style = colors ? { "--df-glow": colors.glow, "--df-deep": colors.deep } : undefined;

  if (isPage) {
    return dfH(
      "div",
      { className: "df-root df-root--page df-root--" + mode, style },
      mode === "collection" ? dfH(DFCollectionPage, { np }) : dfH(DFLikedPage, { np })
    );
  }

  return dfH(
    "div",
    { className: "df-root df-root--" + mode + (focus && mode === "lyrics" ? " df-root--focus" : ""), style },
    dfH(DFBackdrop, { track: np.track, playing: np.playing, colors, mode, smoke: settings.smoke, canvas }),
    mode === "lyrics" && np.track
      ? dfH(DFLyricsView, { np, progress, lyrics, focus, onBack: toFlow, onFocus: toggleFocus })
      : dfH(DFFlowView, { np, progress, lyrics, onLyrics: toLyrics }),
    mode === "flow" ? dfH(DFUpNext, { next: upNext }) : null
  );
}

function render() {
  return dfH(DoppoFlow, null);
}
