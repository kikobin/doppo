// doppo — движок «Моего потока» (расширение из комплекта приложения).
//
// Как «Моя волна»: бесконечный поток под твой вкус.
//   • Режимы: «Под вайб» (новое рядом с тем, что нравится сейчас),
//     «Любимое» (перемешанные лайки), «Незнакомое» (только не из лайков).
//   • Источник рекомендаций — родное «Радио по треку» Spotify
//     (inspiredby-mix → плейлист-радио), семена — твои лайки и удачные
//     треки текущей сессии.
//   • Учится: дослушал/лайкнул → от этого строится следующая порция;
//     быстро пропустил → исполнитель реже; «Не нравится» → трек больше
//     не появится, исполнитель после двух дизлайков — тоже.
//   • Бесконечный: когда очередь кончается, добавляет новую порцию без повторов.
//
// API для приложения: window.doppoFlow = { start(mode), startFrom(uri), stop(),
//   dislike(), state, modes } + событие window "doppo:flow" при изменениях.

(function doppoFlowEngine() {
  if (!window.Spicetify || !Spicetify.Player || !Spicetify.Platform || !Spicetify.CosmosAsync || !Spicetify.Platform.History) {
    setTimeout(doppoFlowEngine, 250);
    return;
  }

  const STATE_KEY = "doppo:flow";
  const DIS_KEY = "doppo:flow-dislikes";
  const MODES = {
    vibe: "Под вайб",
    fav: "Любимое",
    fresh: "Незнакомое",
  };

  const read = (k, d) => {
    try {
      return Object.assign(d, JSON.parse(localStorage.getItem(k) || "{}"));
    } catch (e) {
      return d;
    }
  };
  let state = read(STATE_KEY, { active: false, mode: "vibe", radios: [], queued: [], played: [], good: [] });
  let dis = read(DIS_KEY, { tracks: {}, artists: {} });

  const save = () => {
    // держим историю короткой
    state.played = state.played.slice(-400);
    state.good = state.good.slice(-40);
    state.radios = state.radios.slice(-20);
    state.queued = state.queued.slice(-300);
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  };
  const saveDis = () => localStorage.setItem(DIS_KEY, JSON.stringify(dis));
  const emit = () => window.dispatchEvent(new Event("doppo:flow"));
  const note = (t, err) => Spicetify.showNotification(t, !!err);

  /* ---------------- данные ---------------- */

  async function username() {
    let user = Spicetify.Platform.username;
    if (!user) {
      try {
        const r = await Spicetify.CosmosAsync.get("sp://core-session/v1/username");
        user = r && r.username;
      } catch (e) {
        /* дальше */
      }
    }
    if (!user) {
      try {
        const u = await Spicetify.Platform.UserAPI.getUser();
        user = u && u.username;
      } catch (e) {
        /* нет */
      }
    }
    return user || null;
  }

  let likedCache = null;
  let likedAt = 0;
  async function liked() {
    if (likedCache && Date.now() - likedAt < 120000) return likedCache;
    try {
      const r = await Spicetify.Platform.LibraryAPI.getTracks({ limit: 9999999 });
      const items = ((r && (r.items || r.tracks)) || []).filter((t) => t && t.uri);
      likedCache = items.map((t) => ({ uri: t.uri, artists: (t.artists || []).map((a) => a.uri).filter(Boolean) }));
      likedAt = Date.now();
    } catch (e) {
      likedCache = likedCache || [];
    }
    return likedCache;
  }

  // Родное «Радио по треку» Spotify → URI плейлиста-радио
  async function radioFor(seedUri) {
    try {
      const r = await Spicetify.CosmosAsync.get(
        "https://spclient.wg.spotify.com/inspiredby-mix/v2/seed_to_playlist/" + seedUri + "?response-format=json"
      );
      const uri = r && r.mediaItems && r.mediaItems[0] && r.mediaItems[0].uri;
      return uri || null;
    } catch (e) {
      return null;
    }
  }

  async function playlistTracks(uri) {
    try {
      const r = await Spicetify.Platform.PlaylistAPI.getContents(uri, { limit: 200 });
      return ((r && r.items) || [])
        .filter((t) => t && t.uri && t.uri.startsWith("spotify:track:") && t.isPlayable !== false)
        .map((t) => ({ uri: t.uri, artists: (t.artists || []).map((a) => a.uri).filter(Boolean) }));
    } catch (e) {
      return [];
    }
  }

  function current() {
    const d = Spicetify.Player.data;
    const item = d && (d.item || d.track);
    if (!item || !item.uri) return null;
    const m = item.metadata || {};
    let artists = Array.isArray(item.artists) ? item.artists.map((a) => a.uri).filter(Boolean) : [];
    if (!artists.length) artists = [m.artist_uri, m["artist_uri:1"]].filter(Boolean);
    return {
      uri: item.uri,
      artists,
      ctx: (d.context && d.context.uri) || d.context_uri || "",
      duration: Spicetify.Player.getDuration() || 0,
    };
  }

  /* ---------------- вкус ---------------- */

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function blocked(t, likedSet) {
    if (dis.tracks[t.uri]) return true;
    if ((t.artists || []).some((a) => (dis.artists[a] || 0) >= 2)) return true;
    if (state.played.includes(t.uri)) return true;
    if (state.mode === "fresh" && likedSet && likedSet.has(t.uri)) return true;
    return false;
  }

  async function pickSeed() {
    const lib = await liked();
    const recent = lib.slice(0, 40);
    const cur = current();
    const pool = [];
    // удачные треки сессии — главный сигнал «под вайб»
    state.good.slice(-10).forEach((u) => pool.push(u, u));
    if (cur && cur.uri.startsWith("spotify:track:") && !dis.tracks[cur.uri]) pool.push(cur.uri);
    shuffle(recent.slice()).slice(0, 8).forEach((t) => pool.push(t.uri));
    const clean = pool.filter((u) => !dis.tracks[u]);
    return clean.length ? pick(clean) : lib.length ? pick(lib).uri : cur && cur.uri;
  }

  /* ---------------- запуск ---------------- */

  let busy = false;
  async function start(mode, seedOverride) {
    if (busy) return;
    busy = true;
    try {
      mode = MODES[mode] ? mode : "vibe";
      state = { active: true, mode, radios: [], queued: [], played: [], good: state.good || [] };
      save();
      emit();

      if (mode === "fav") {
        const user = await username();
        if (!user) throw new Error("no user");
        Spicetify.Player.setShuffle(true);
        await Spicetify.Player.playUri("spotify:user:" + user + ":collection");
        note("Мой поток · " + MODES.fav);
        return;
      }

      const lib = await liked();
      const likedSet = new Set(lib.map((t) => t.uri));
      const seed = seedOverride || (await pickSeed());
      const radio = seed && (await radioFor(seed));
      if (!radio) {
        // рекомендации недоступны — хотя бы любимое вперемешку
        state.mode = "fav";
        save();
        emit();
        busy = false;
        return start("fav");
      }
      state.radios.push(radio);
      const tracks = (await playlistTracks(radio)).filter((t) => !blocked(t, likedSet));
      Spicetify.Player.setShuffle(false);
      if (tracks.length) await Spicetify.Player.playUri(radio, {}, { skipTo: { uri: tracks[0].uri } });
      else await Spicetify.Player.playUri(radio);
      save();
      emit();
      note("Мой поток · " + MODES[mode]);
    } catch (e) {
      state.active = false;
      save();
      emit();
      note("Не получилось запустить поток", true);
    } finally {
      busy = false;
    }
  }

  function stop() {
    state.active = false;
    save();
    emit();
  }

  // наш ли это трек: из радио потока, из добавленных порций или из лайков (режим «Любимое»)
  function isOurs(cur) {
    if (!cur) return false;
    if (state.radios.includes(cur.ctx)) return true;
    if (state.queued.includes(cur.uri)) return true;
    if (state.mode === "fav" && /:collection(:|$)/.test(cur.ctx) && !/your-episodes/.test(cur.ctx)) return true;
    return false;
  }

  /* ---------------- бесконечность ---------------- */

  let refilling = false;
  async function refill() {
    if (refilling || state.mode === "fav") return;
    refilling = true;
    try {
      const lib = await liked();
      const likedSet = new Set(lib.map((t) => t.uri));
      for (let attempt = 0; attempt < 3; attempt++) {
        const seed = await pickSeed();
        const radio = seed && (await radioFor(seed));
        if (!radio) continue;
        const tracks = (await playlistTracks(radio)).filter((t) => !blocked(t, likedSet) && !state.queued.includes(t.uri));
        if (tracks.length < 5) continue;
        const batch = shuffle(tracks).slice(0, 20);
        await Spicetify.addToQueue(batch.map((t) => ({ uri: t.uri })));
        state.radios.push(radio);
        state.queued.push(...batch.map((t) => t.uri));
        save();
        break;
      }
    } catch (e) {
      /* попробуем на следующем треке */
    } finally {
      refilling = false;
    }
  }

  function remaining() {
    const q = (Spicetify.Queue && Spicetify.Queue.nextTracks) || [];
    let n = 0;
    for (const t of q) {
      const ct = t && (t.contextTrack || t);
      if (!ct || !ct.uri || ct.uri === "spotify:delimiter") break;
      if (t.provider === "autoplay") break;
      n++;
    }
    return n;
  }

  /* ---------------- обучение на поведении ---------------- */

  let last = null; // { uri, artists, duration, maxPos, ours }
  let skipsInRow = 0;

  setInterval(() => {
    if (!last) return;
    const pos = Spicetify.Player.getProgress() || 0;
    if (pos > last.maxPos) last.maxPos = pos;
  }, 1000);

  function judge(prev) {
    if (!prev || !prev.ours || !prev.duration) return;
    const ratio = prev.maxPos / prev.duration;
    if (ratio > 0.6) {
      if (!state.good.includes(prev.uri)) state.good.push(prev.uri);
    } else if (ratio < 0.25 && prev.duration > 40000 && prev.maxPos < 30000) {
      // быстро пропустил — исполнитель чуть реже
      prev.artists.forEach((a) => (dis.artists[a] = (dis.artists[a] || 0) + 0.5));
      saveDis();
    }
  }

  async function onSong() {
    const cur = current();
    judge(last);
    if (!state.active || !cur) {
      last = cur ? { ...cur, maxPos: 0, ours: false } : null;
      return;
    }
    const ours = isOurs(cur);
    last = { ...cur, maxPos: 0, ours };
    if (!ours) {
      // включил что-то своё — поток на паузе, история сохраняется
      state.active = false;
      save();
      emit();
      return;
    }
    if (!state.played.includes(cur.uri)) state.played.push(cur.uri);
    save();
    emit();

    // пропускаем то, что тебе не нравится (без бесконечного цикла)
    if (state.mode !== "fav") {
      const lib = state.mode === "fresh" ? await liked() : null;
      const likedSet = lib ? new Set(lib.map((t) => t.uri)) : null;
      const bad = dis.tracks[cur.uri] || cur.artists.some((a) => (dis.artists[a] || 0) >= 2) || (likedSet && likedSet.has(cur.uri));
      if (bad && skipsInRow < 6) {
        skipsInRow++;
        Spicetify.Player.next();
        return;
      }
    }
    skipsInRow = 0;
    if (remaining() < 4) refill();
  }

  // лайк во время потока — сильный сигнал
  let lastHeart = null;
  setInterval(() => {
    let h = false;
    try {
      h = !!Spicetify.Player.getHeart();
    } catch (e) {
      h = false;
    }
    const cur = current();
    if (state.active && cur && h && lastHeart === false && !state.good.includes(cur.uri)) {
      state.good.push(cur.uri);
      save();
    }
    lastHeart = h;
  }, 1500);

  function dislike() {
    const cur = current();
    if (!cur) return;
    dis.tracks[cur.uri] = 1;
    cur.artists.forEach((a) => (dis.artists[a] = (dis.artists[a] || 0) + 1));
    saveDis();
    if (last && last.uri === cur.uri) last.ours = false; // не считать как «быстро пропустил» повторно
    Spicetify.Player.next();
    note("Понял — такое больше не предложу");
  }

  Spicetify.Player.addEventListener("songchange", onSong);
  // если Spotify не прислал событие — сверяемся сами
  let lastUri = null;
  setInterval(() => {
    const cur = current();
    const u = cur && cur.uri;
    if (u !== lastUri) {
      const first = lastUri === null;
      lastUri = u;
      if (!first) onSong();
      else last = cur ? { ...cur, maxPos: 0, ours: isOurs(cur) } : null;
    }
  }, 1000);
  Spicetify.Player.addEventListener("songchange", () => {
    const cur = current();
    lastUri = cur && cur.uri;
  });

  window.doppoFlow = {
    start: (mode) => start(mode),
    startFrom: (uri) => start(state.mode === "fav" ? "vibe" : state.mode, uri),
    stop,
    dislike,
    modes: MODES,
    get state() {
      const cur = current();
      return { active: state.active && isOurs(cur), mode: state.mode };
    },
    resetTaste() {
      dis = { tracks: {}, artists: {} };
      state.good = [];
      saveDis();
      save();
      note("Вкус потока сброшен");
    },
  };
  emit();
})();
