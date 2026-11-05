// doppo — движок текстов (subfile приложения, склеивается после index.js).
//
// Источники (параллельно, берётся лучший):
//   1. Musixmatch — синхронизация ПО СЛОВАМ (richsync) или по строкам;
//   2. Spotify    — родной текст (по строкам);
//   3. LRCLIB     — открытая база LRC (по строкам / просто текст).
// Для текста по строкам тайминги слов рассчитываются по длине слов, так что
// караоке-заливка работает всегда, когда есть хоть какая-то синхронизация.
//
// Формат результата:
//   { kind: "word" | "line" | "plain" | "instrumental",
//     source: "Musixmatch" | "Spotify" | "LRCLIB",
//     lines: [{ start, end, text, words: [{ text, start, end }], interlude? }] }

/* ------------------------------------------------------------------ */
/* Часы плеера — плавная позиция для 60 fps                            */
/* ------------------------------------------------------------------ */

const DFClock = (() => {
  let base = 0;
  let at = performance.now();
  let playing = false;
  let timer = null;
  let users = 0;

  function now() {
    return playing ? base + (performance.now() - at) : base;
  }
  function hard(ms) {
    base = ms != null ? ms : Spicetify.Player.getProgress() || 0;
    at = performance.now();
    playing = Spicetify.Player.isPlaying();
  }
  function sample() {
    const p = Spicetify.Player.getProgress() || 0;
    const pl = Spicetify.Player.isPlaying();
    const pred = now();
    if (pl !== playing || Math.abs(p - pred) > 300) {
      base = p;
    } else {
      base = pred + (p - pred) * 0.15; // мягко подтягиваемся, без рывков назад
    }
    at = performance.now();
    playing = pl;
  }
  const onEvent = () => hard();
  function acquire() {
    if (users++ === 0) {
      hard();
      timer = setInterval(sample, 200);
      Spicetify.Player.addEventListener("onplaypause", onEvent);
      Spicetify.Player.addEventListener("songchange", onEvent);
    }
    return release;
  }
  function release() {
    if (--users === 0) {
      clearInterval(timer);
      Spicetify.Player.removeEventListener("onplaypause", onEvent);
      Spicetify.Player.removeEventListener("songchange", onEvent);
    }
  }
  function seek(ms) {
    Spicetify.Player.seek(Math.max(0, Math.round(ms)));
    hard(ms);
  }
  return { now, hard, acquire, seek, isPlaying: () => playing };
})();

/* ------------------------------------------------------------------ */
/* Провайдеры                                                          */
/* ------------------------------------------------------------------ */

const DFLyrics = (() => {
  const cache = new Map();
  const inflight = new Map();
  const MXM_TOKEN_KEY = "doppo:mxm-token";
  const MXM_HEADERS = {
    authority: "apic-appmobile.musixmatch.com",
    "X-Cookie": "x-mxm-token-guid=",
    "x-mxm-app-version": "10.1.1",
    "X-User-Agent": "Musixmatch/2025120901 CFNetwork/3860.300.31 Darwin/25.2.0",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "application/json",
  };

  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const qs = (o) =>
    Object.keys(o)
      .filter((k) => o[k] !== undefined && o[k] !== null && o[k] !== "")
      .map((k) => k + "=" + encodeURIComponent(o[k]))
      .join("&");

  async function getJson(url, headers) {
    try {
      const r = await fetch(url, headers ? { headers } : undefined);
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch (e) {
      /* CORS/сеть — пробуем через Cosmos */
    }
    try {
      return await Spicetify.CosmosAsync.get(url);
    } catch (e) {
      return null;
    }
  }

  /* ---------- синтез таймингов слов для текста по строкам ---------- */
  function tokenize(text) {
    const parts = String(text || "").split(/(\s+)/);
    const words = [];
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p) && words.length) words[words.length - 1].text += p;
      else words.push({ text: p });
    }
    return words;
  }
  function synthWords(text, start, end) {
    const words = tokenize(text);
    const chars = words.reduce((n, w) => n + w.text.trim().length + 1, 0) || 1;
    // поём обычно не всю паузу до следующей строки
    const singDur = Math.min(end - start, Math.max(700, chars * 85));
    let t = start;
    for (const w of words) {
      const d = ((w.text.trim().length + 1) / chars) * singDur;
      w.start = t;
      w.end = t + d;
      t += d;
    }
    return words;
  }
  function fromLineList(list, source, durationMs) {
    // list: [{ start, text }]
    const clean = list.filter((l) => l.start != null).sort((a, b) => a.start - b.start);
    const lines = clean.map((l, i) => {
      const next = clean[i + 1];
      const end = next ? next.start : Math.min(l.start + 6000, durationMs || l.start + 6000);
      const text = (l.text || "").trim();
      return { start: l.start, end, text, words: text ? synthWords(text, l.start, end) : [] };
    });
    return finalize({ kind: "line", source, lines }, durationMs);
  }
  function plain(text, source) {
    const lines = String(text)
      .split(/\r?\n/)
      .map((t) => ({ start: 0, end: 0, text: t.trim(), words: [] }));
    return { kind: "plain", source, lines };
  }
  function finalize(res, durationMs) {
    // пустые строки (♪) убираем — вместо них будут «дышащие» точки
    const lines = res.lines.filter((l) => l.text && l.text !== "♪");
    const out = [];
    const firstStart = lines.length ? lines[0].start : 0;
    if (firstStart > 3500) out.push({ interlude: true, start: 0, end: firstStart, text: "", words: [] });
    lines.forEach((l, i) => {
      out.push(l);
      const next = lines[i + 1];
      const sungEnd = l.words.length ? l.words[l.words.length - 1].end : l.end;
      if (next && next.start - sungEnd > 4500) {
        out.push({ interlude: true, start: sungEnd + 400, end: next.start, text: "", words: [] });
      }
    });
    res.lines = out;
    return res;
  }

  /* ---------- LRC ---------- */
  function parseLrc(lrc) {
    const out = [];
    for (const raw of String(lrc).split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!stamps.length) continue;
      const text = raw.replace(/\[[^\]]*\]/g, "").trim();
      for (const s of stamps) out.push({ start: (Number(s[1]) * 60 + Number(s[2])) * 1000, text });
    }
    return out;
  }

  /* ---------- Spotify ---------- */
  async function spotify(t) {
    if (!t.uri || !t.uri.startsWith("spotify:track:")) return null;
    const id = t.uri.split(":")[2];
    let body;
    try {
      body = await Spicetify.CosmosAsync.get(
        "https://spclient.wg.spotify.com/color-lyrics/v2/track/" + id + "?format=json&vocalRemoval=false&market=from_token"
      );
    } catch (e) {
      return null;
    }
    const ly = body && body.lyrics;
    if (!ly || !ly.lines || !ly.lines.length) return null;
    if (ly.syncType === "LINE_SYNCED") {
      return fromLineList(
        ly.lines.map((l) => ({ start: Number(l.startTimeMs) || 0, text: l.words })),
        "Spotify",
        t.duration
      );
    }
    return plain(ly.lines.map((l) => l.words).join("\n"), "Spotify");
  }

  /* ---------- LRCLIB ---------- */
  async function lrclib(t) {
    const artist = t.artists[0] || "";
    let j = await getJson(
      "https://lrclib.net/api/get?" +
        qs({ artist_name: artist, track_name: t.title, album_name: t.album, duration: t.duration ? Math.round(t.duration / 1000) : "" })
    );
    if (!j || (!j.syncedLyrics && !j.plainLyrics && !j.instrumental)) {
      const list = await getJson("https://lrclib.net/api/search?" + qs({ track_name: t.title, artist_name: artist }));
      if (Array.isArray(list) && list.length) {
        const dur = t.duration / 1000;
        const near = list.filter((x) => !dur || !x.duration || Math.abs(x.duration - dur) < 4);
        j = near.find((x) => x.syncedLyrics) || list.find((x) => x.syncedLyrics) || near[0] || list[0];
      }
    }
    if (!j) return null;
    if (j.instrumental) return { kind: "instrumental", source: "LRCLIB", lines: [] };
    if (j.syncedLyrics) return fromLineList(parseLrc(j.syncedLyrics), "LRCLIB", t.duration);
    if (j.plainLyrics) return plain(j.plainLyrics, "LRCLIB");
    return null;
  }

  /* ---------- Musixmatch ---------- */
  async function mxmToken(force) {
    let token = !force && localStorage.getItem(MXM_TOKEN_KEY);
    if (token) return token;
    try {
      const res = await Spicetify.CosmosAsync.get(
        "https://apic-appmobile.musixmatch.com/ws/1.1/token.get?app_id=mac-ios-v2.0",
        null,
        MXM_HEADERS
      );
      token = res && res.message && res.message.body && res.message.body.user_token;
      if (token && !/^UpgradeOnly/.test(token)) {
        localStorage.setItem(MXM_TOKEN_KEY, token);
        return token;
      }
    } catch (e) {
      /* нет токена — работаем без Musixmatch */
    }
    return null;
  }
  async function mxm(t, retry) {
    const token = await mxmToken(retry);
    if (!token) return null;
    const dur = t.duration / 1000;
    const url =
      "https://apic-appmobile.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynched&subtitle_format=mxm&app_id=mac-ios-v2.0&" +
      qs({
        q_album: t.album,
        q_artist: t.artists[0] || "",
        q_artists: t.artists.join(", "),
        q_track: t.title,
        track_spotify_id: t.uri,
        q_duration: dur || "",
        f_subtitle_length: dur ? Math.floor(dur) : "",
        usertoken: token,
        optional_calls: "track.richsync",
        richsync_compact_type: "words",
      });
    let body;
    try {
      body = await Spicetify.CosmosAsync.get(url, null, MXM_HEADERS);
    } catch (e) {
      return null;
    }
    const status = body && body.message && body.message.header && body.message.header.status_code;
    if (status === 401 && !retry) {
      localStorage.removeItem(MXM_TOKEN_KEY);
      return mxm(t, true);
    }
    const calls = body && body.message && body.message.body && body.message.body.macro_calls;
    if (!calls) return null;
    const matcher = calls["matcher.track.get"];
    if (!matcher || matcher.message.header.status_code !== 200) return null;
    const track = matcher.message.body && matcher.message.body.track;
    if (!track) return null;
    if (track.instrumental) return { kind: "instrumental", source: "Musixmatch", lines: [] };
    const restricted = calls["track.lyrics.get"] && calls["track.lyrics.get"].message.body && calls["track.lyrics.get"].message.body.lyrics && calls["track.lyrics.get"].message.body.lyrics.restricted;
    if (restricted) return null;

    // 1) по словам
    const rs = calls["track.richsync.get"];
    if (track.has_richsync && rs && rs.message.header.status_code === 200 && rs.message.body && rs.message.body.richsync) {
      try {
        const raw = JSON.parse(rs.message.body.richsync.richsync_body);
        const lines = raw.map((line) => {
          const start = line.ts * 1000;
          const end = line.te * 1000;
          const pieces = line.l || [];
          const words = [];
          pieces.forEach((p, i) => {
            const ws = start + p.o * 1000;
            const we = i + 1 < pieces.length ? start + pieces[i + 1].o * 1000 : end;
            if (/^\s+$/.test(p.c) && words.length) {
              words[words.length - 1].text += p.c;
            } else {
              words.push({ text: p.c, start: ws, end: Math.max(ws + 60, we) });
            }
          });
          return { start, end, text: line.x || words.map((w) => w.text).join(""), words };
        });
        if (lines.length) return finalize({ kind: "word", source: "Musixmatch", lines }, t.duration);
      } catch (e) {
        /* падаем на построчный */
      }
    }
    // 2) по строкам
    const sub = calls["track.subtitles.get"];
    const subtitle = sub && sub.message.body && sub.message.body.subtitle_list && sub.message.body.subtitle_list[0] && sub.message.body.subtitle_list[0].subtitle;
    if (track.has_subtitles && subtitle) {
      try {
        const raw = JSON.parse(subtitle.subtitle_body);
        return fromLineList(
          raw.map((l) => ({ start: l.time.total * 1000, text: l.text })),
          "Musixmatch",
          t.duration
        );
      } catch (e) {
        /* дальше */
      }
    }
    // 3) просто текст
    const ly = calls["track.lyrics.get"] && calls["track.lyrics.get"].message.body && calls["track.lyrics.get"].message.body.lyrics;
    if (ly && ly.lyrics_body) return plain(ly.lyrics_body.replace(/\*{7}[\s\S]*$/, ""), "Musixmatch");
    return null;
  }

  /* ---------- выбор лучшего ---------- */
  const RANK = { word: 4, line: 3, instrumental: 2, plain: 1 };
  async function resolve(t) {
    const tasks = [mxm(t), spotify(t), lrclib(t)].map((p) => withTimeout(p, 9000).catch(() => null));
    // Как только пришёл текст по словам — отвечаем сразу, не ждём остальных.
    const results = [];
    return await new Promise((done) => {
      let left = tasks.length;
      tasks.forEach((p) =>
        p.then((r) => {
          if (r && r.kind === "word") return done(r);
          results.push(r);
          if (--left === 0) {
            const best = results.filter(Boolean).sort((a, b) => RANK[b.kind] - RANK[a.kind])[0] || null;
            done(best);
          }
        })
      );
    });
  }

  function get(t) {
    if (!t || !t.uri) return Promise.resolve(null);
    if (cache.has(t.uri)) return Promise.resolve(cache.get(t.uri));
    if (inflight.has(t.uri)) return inflight.get(t.uri);
    const p = resolve(t)
      .catch(() => null)
      .then((r) => {
        cache.set(t.uri, r);
        inflight.delete(t.uri);
        return r;
      });
    inflight.set(t.uri, p);
    return p;
  }
  function peek(uri) {
    return cache.has(uri) ? cache.get(uri) : undefined;
  }

  return { get, peek, parseLrc };
})();

/* ------------------------------------------------------------------ */
/* Помощники караоке                                                   */
/* ------------------------------------------------------------------ */

const DF_OFFSET_KEY = "doppo:lyrics-offset";
function dfLyricsOffset() {
  return Number(localStorage.getItem(DF_OFFSET_KEY) || 0) || 0;
}

function dfFindActive(lines, t) {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

// пишем --p (0..100%) в слова строки; cache — чтобы не трогать DOM без нужды
function dfFill(line, els, t, cache) {
  if (!line || !els) return;
  if (line.interlude) {
    const p = Math.min(1, Math.max(0, (t - line.start) / Math.max(1, line.end - line.start)));
    for (let k = 0; k < els.length; k++) {
      const v = Math.round(Math.min(1, Math.max(0, p * 3 - k)) * 100);
      if (els[k] && cache[k] !== v) {
        els[k].style.setProperty("--p", v + "%");
        cache[k] = v;
      }
    }
    return;
  }
  const words = line.words;
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const v = Math.round(Math.min(1, Math.max(0, (t - w.start) / Math.max(1, w.end - w.start))) * 1000) / 10;
    if (els[k] && cache[k] !== v) {
      els[k].style.setProperty("--p", v + "%");
      cache[k] = v;
    }
  }
}

function dfUseLyrics(track) {
  const R = Spicetify.React;
  const uri = track && track.uri;
  const [state, setState] = R.useState(() => {
    const c = uri ? DFLyrics.peek(uri) : undefined;
    return c === undefined ? { status: "loading" } : c ? { status: "ok", data: c } : { status: "none" };
  });
  R.useEffect(() => {
    if (!uri) return setState({ status: "none" });
    let alive = true;
    const c = DFLyrics.peek(uri);
    if (c !== undefined) setState(c ? { status: "ok", data: c } : { status: "none" });
    else setState({ status: "loading" });
    DFLyrics.get(track).then((r) => alive && setState(r ? { status: "ok", data: r } : { status: "none" }));
    return () => {
      alive = false;
    };
  }, [uri]);
  return state;
}

/* ------------------------------------------------------------------ */
/* Большой караоке-экран                                               */
/* ------------------------------------------------------------------ */

function DFKaraokeView({ data, focus, onSeek }) {
  const R = Spicetify.React;
  const h = R.createElement;
  const lines = data.lines;
  const wrapRef = R.useRef(null);
  const lineEls = R.useRef([]);
  const wordEls = R.useRef([]);
  const fillCache = R.useRef([]);
  const [active, setActive] = R.useState(-1);
  const activeRef = R.useRef(-1);
  const [manual, setManual] = R.useState(0);
  const manualTimer = R.useRef(null);
  const [, bump] = R.useReducer((x) => x + 1, 0);

  // кадр за кадром: активная строка + заливка слов
  R.useEffect(() => {
    const release = DFClock.acquire();
    fillCache.current = lines.map(() => []);
    let raf = 0;
    const loop = () => {
      const t = DFClock.now() + dfLyricsOffset();
      const idx = dfFindActive(lines, t);
      if (idx !== activeRef.current) {
        const prev = activeRef.current;
        activeRef.current = idx;
        setActive(idx);
        if (prev >= 0) dfFill(lines[prev], wordEls.current[prev], Infinity, fillCache.current[prev]);
      }
      if (idx >= 0) dfFill(lines[idx], wordEls.current[idx], t, fillCache.current[idx]);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      release();
    };
  }, [data]);

  // раскладка: все строки едут «волной» к якорю
  R.useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const target = lineEls.current[Math.max(0, active)];
    const anchor = wrap.clientHeight * (focus ? 0.42 : 0.32);
    const y = target ? anchor - (target.offsetTop + target.offsetHeight / 2) : anchor;
    const shift = y - manual;
    lineEls.current.forEach((el, i) => {
      if (!el) return;
      const dist = Math.abs(i - active);
      el.style.transform = "translate3d(0," + shift + "px,0)";
      el.style.transitionDelay = manual ? "0ms" : Math.min(dist, 7) * 38 + "ms";
      el.style.setProperty("--dist", String(Math.min(dist, 8)));
    });
  });

  R.useEffect(() => {
    const onResize = () => bump();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onWheel = (e) => {
    setManual((m) => m + e.deltaY);
    clearTimeout(manualTimer.current);
    manualTimer.current = setTimeout(() => setManual(0), 3500);
  };
  const backToNow = () => {
    clearTimeout(manualTimer.current);
    setManual(0);
  };

  return h(
    "div",
    { className: "dfk" + (focus ? " dfk--focus" : "") + (manual ? " is-manual" : ""), ref: wrapRef, onWheel },
    h(
      "div",
      { className: "dfk-list" },
      lines.map((line, i) => {
        const cls =
          "dfk-line" +
          (line.interlude ? " dfk-line--interlude" : "") +
          (i === active ? " is-active" : i < active ? " is-past" : " is-future");
        const setLine = (el) => (lineEls.current[i] = el);
        const setWord = (k) => (el) => {
          if (!wordEls.current[i]) wordEls.current[i] = [];
          wordEls.current[i][k] = el;
        };
        if (line.interlude) {
          return h(
            "div",
            { key: i, className: cls, ref: setLine },
            h("div", { className: "dfk-dots" }, [0, 1, 2].map((k) => h("i", { key: k, ref: setWord(k) })))
          );
        }
        return h(
          "div",
          {
            key: i,
            className: cls,
            ref: setLine,
            onClick: () => {
              backToNow();
              onSeek(line.start);
            },
          },
          h(
            "div",
            { className: "dfk-text" },
            line.words.length
              ? line.words.map((w, k) => h("span", { key: k, className: "dfk-w", ref: setWord(k) }, w.text))
              : line.text
          )
        );
      })
    ),
    manual ? h("button", { className: "dfk-now", onClick: backToNow }, "↓ К текущей строке") : null
  );
}

/* ------------------------------------------------------------------ */
/* Текст без синхронизации                                             */
/* ------------------------------------------------------------------ */

function DFPlainLyricsView({ data }) {
  const h = Spicetify.React.createElement;
  return h(
    "div",
    { className: "dfk-plain" },
    h("div", { className: "dfk-plain__note" }, "Текст без синхронизации"),
    data.lines.map((l, i) => h("p", { key: i, className: l.text ? "" : "is-gap" }, l.text || " "))
  );
}

/* ------------------------------------------------------------------ */
/* «Живая строка» на экране потока                                     */
/* ------------------------------------------------------------------ */

function DFLiveLineView({ data, onOpen }) {
  const R = Spicetify.React;
  const h = R.createElement;
  const lines = data.lines;
  const [active, setActive] = R.useState(-1);
  const activeRef = R.useRef(-1);
  const wordEls = R.useRef([]);
  const cache = R.useRef([]);

  R.useEffect(() => {
    const release = DFClock.acquire();
    let raf = 0;
    const loop = () => {
      const t = DFClock.now() + dfLyricsOffset();
      const idx = dfFindActive(lines, t);
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        cache.current = [];
        wordEls.current = [];
        setActive(idx);
      }
      if (idx >= 0) dfFill(lines[idx], wordEls.current, t, cache.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      release();
    };
  }, [data]);

  const cur = lines[active];
  const next = lines.slice(active + 1).find((l) => !l.interlude);
  const setWord = (k) => (el) => (wordEls.current[k] = el);

  let body;
  if (!cur) {
    body = h("div", { className: "dfl-cur dfl-cur--idle" }, h("div", { className: "dfk-dots" }, [0, 1, 2].map((k) => h("i", { key: k }))));
  } else if (cur.interlude) {
    body = h("div", { className: "dfl-cur" }, h("div", { className: "dfk-dots" }, [0, 1, 2].map((k) => h("i", { key: k, ref: setWord(k) }))));
  } else {
    body = h(
      "div",
      { className: "dfl-cur", key: "l" + active },
      cur.words.map((w, k) => h("span", { key: k, className: "dfk-w", ref: setWord(k) }, w.text))
    );
  }

  return h(
    "button",
    { className: "dfl", onClick: onOpen, title: "Открыть текст" },
    body,
    h("div", { className: "dfl-next", key: "n" + active }, next ? next.text : " ")
  );
}

/* Перерисовываем караоке только когда сменился текст или режим —
   а не каждый тик прогресса (заливка идёт напрямую в DOM). */
const DFKaraoke = Spicetify.React.memo(DFKaraokeView, (a, b) => a.data === b.data && a.focus === b.focus);
const DFPlainLyrics = Spicetify.React.memo(DFPlainLyricsView, (a, b) => a.data === b.data);
const DFLiveLine = Spicetify.React.memo(DFLiveLineView, (a, b) => a.data === b.data);
