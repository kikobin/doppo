// doppo — «Моя коллекция» и «Мне нравится» (subfile приложения).
// Маршруты: /doppo/collection и /doppo/liked.
// Данные — твоя настоящая медиатека: Web API Spotify через CosmosAsync
// (токен клиента), запасной путь — внутренний Platform.LibraryAPI.
// Родные страницы Spotify остаются: ссылки «Открыть в Spotify» ведут туда.

/* ------------------------------------------------------------------ */
/* Данные                                                              */
/* ------------------------------------------------------------------ */

const DFLib = (() => {
  const img = (images) => {
    const list = Array.isArray(images) ? images : [];
    const pick = list.find((i) => i && (i.width || 0) >= 200 && (i.width || 0) <= 700) || list[0];
    return pick ? dfImg(pick.url || pick.uri || "") : "";
  };
  const ts = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
    if (typeof v === "string") return Date.parse(v) || Number(v) || 0;
    if (v.isoString) return Date.parse(v.isoString) || 0;
    if (v.milliseconds) return Number(v.milliseconds);
    return 0;
  };

  function normPlatform(t) {
    if (!t || !t.uri) return null;
    return {
      uri: t.uri,
      title: t.name,
      artists: (t.artists || []).map((a) => a.name),
      album: (t.album && t.album.name) || "",
      cover: img(t.album && t.album.images),
      duration: (t.duration && t.duration.milliseconds) || t.duration_ms || 0,
      addedAt: ts(t.addedAt),
      explicit: !!t.isExplicit,
      playable: t.isPlayable !== false,
    };
  }
  function normWeb(it) {
    const t = it.track || it;
    if (!t || !t.uri) return null;
    return {
      uri: t.uri,
      title: t.name,
      artists: (t.artists || []).map((a) => a.name),
      album: (t.album && t.album.name) || "",
      cover: img(t.album && t.album.images),
      duration: t.duration_ms || 0,
      addedAt: ts(it.added_at),
      explicit: !!t.explicit,
      playable: t.is_playable !== false,
    };
  }

  // кэш с «ленивым» обновлением: показываем сразу, тихо обновляем в фоне
  function cached(loader, ttl) {
    let value = null;
    let at = 0;
    let inflight = null;
    const subs = new Set();
    function load() {
      if (inflight) return inflight;
      inflight = loader()
        .then((v) => {
          value = v;
          at = Date.now();
          subs.forEach((f) => f(v));
          return v;
        })
        .finally(() => (inflight = null));
      return inflight;
    }
    return {
      get() {
        if (value && Date.now() - at < ttl) return Promise.resolve(value);
        if (value) {
          load();
          return Promise.resolve(value);
        }
        return load();
      },
      peek: () => value,
      refresh: load,
      subscribe(f) {
        subs.add(f);
        return () => subs.delete(f);
      },
      patch(fn) {
        if (value) {
          value = fn(value);
          subs.forEach((f) => f(value));
        }
      },
    };
  }

  // Все лайки одним запросом — так делает официальный Shuffle+.
  async function loadLiked() {
    try {
      const r = await Spicetify.Platform.LibraryAPI.getTracks({ limit: 9999999 });
      const items = ((r && (r.items || r.tracks)) || []).map(normPlatform).filter(Boolean);
      if (items.length || (r && r.totalLength === 0)) return sortLiked(items);
    } catch (e) {
      /* внутренний API недоступен — идём в Web API */
    }
    const out = [];
    let url = "https://api.spotify.com/v1/me/tracks?limit=50";
    for (let i = 0; i < 200 && url; i++) {
      const r = await Spicetify.CosmosAsync.get(url);
      if (!r || !Array.isArray(r.items)) break;
      r.items.forEach((it) => {
        const t = normWeb(it);
        if (t) out.push(t);
      });
      url = r.next;
    }
    return sortLiked(out);
  }
  const sortLiked = (items) => (items.some((t) => t.addedAt) ? items.slice().sort((a, b) => b.addedAt - a.addedAt) : items);

  async function loadPlaylists() {
    try {
      const r = await Spicetify.Platform.RootlistAPI.getContents();
      const flat = [];
      const walk = (items) =>
        (items || []).forEach((x) => {
          if (x.type === "folder") walk(x.items);
          else if (x.type === "playlist")
            flat.push({
              uri: x.uri,
              id: x.uri.split(":").pop(),
              name: x.name,
              cover: img(x.images),
              count: x.totalLength || 0,
              owner: (x.owner && (x.owner.name || x.owner.displayName)) || "",
            });
        });
      walk(r && r.items);
      if (flat.length) return flat;
    } catch (e) {
      /* дальше */
    }
    const out = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    for (let i = 0; i < 10 && url; i++) {
      const r = await Spicetify.CosmosAsync.get(url);
      if (!r || !Array.isArray(r.items)) break;
      r.items.filter(Boolean).forEach((p) =>
        out.push({ uri: p.uri, id: p.id, name: p.name, cover: img(p.images), count: (p.tracks && p.tracks.total) || 0, owner: (p.owner && p.owner.display_name) || "" })
      );
      url = r.next;
    }
    return out;
  }

  async function loadMe() {
    try {
      const u = await Spicetify.Platform.UserAPI.getUser();
      if (u && (u.displayName || u.username)) return { name: u.displayName || u.username, avatar: img(u.images) };
    } catch (e) {
      /* дальше */
    }
    try {
      const r = await Spicetify.CosmosAsync.get("https://api.spotify.com/v1/me");
      return { name: r.display_name || r.id, avatar: img(r.images) };
    } catch (e) {
      return { name: (Spicetify.Platform && Spicetify.Platform.username) || "", avatar: "" };
    }
  }

  const liked = cached(() => loadLiked().catch(() => []), 60 * 1000);
  const playlists = cached(() => loadPlaylists().catch(() => []), 5 * 60 * 1000);
  const me = cached(loadMe, 30 * 60 * 1000);

  async function setLiked(uri, on) {
    const L = Spicetify.Platform.LibraryAPI;
    if (on) await L.add({ uris: [uri] });
    else await L.remove({ uris: [uri] });
  }

  return { liked, playlists, me, setLiked };
})();

function dfUseCached(store) {
  const [v, setV] = dfUseState(() => store.peek());
  dfUseEffect(() => {
    let alive = true;
    store.get().then((x) => alive && setV(x));
    const off = store.subscribe((x) => alive && setV(x));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return v;
}

function dfContextUri() {
  const d = Spicetify.Player.data || {};
  return (d.context && d.context.uri) || d.context_uri || d.contextUri || "";
}
function dfIsLikedContext() {
  const uri = dfContextUri();
  return /:collection(:|$)|^spotify:collection/.test(uri) && !/:collection:(your-episodes|artist|album)/.test(uri);
}

// «что сейчас должно гореть»: сразу после нажатия показываем нажатое (pending),
// пока Spotify не подтвердит или не пройдёт 3 с
function dfUsePending(np) {
  const [pending, setPending] = dfUseState(null);
  const realUri = np.track && np.track.uri;
  const realCtx = dfContextUri();
  dfUseEffect(() => {
    if (!pending) return;
    const sameTarget = pending.uri ? pending.uri === realUri : pending.ctx === realCtx;
    if (sameTarget && np.playing === pending.playing) return setPending(null);
    const id = setTimeout(() => setPending(null), 3000);
    return () => clearTimeout(id);
  }, [pending, realUri, realCtx, np.playing]);
  return {
    uri: pending && pending.uri ? pending.uri : realUri,
    ctx: pending && pending.ctx ? pending.ctx : realCtx,
    playing: pending ? pending.playing : np.playing,
    set: setPending,
  };
}

async function dfUsername() {
  let user = Spicetify.Platform && Spicetify.Platform.username;
  if (!user) {
    try {
      const res = await Spicetify.CosmosAsync.get("sp://core-session/v1/username");
      user = res && res.username;
    } catch (e) {
      /* нет */
    }
  }
  return user;
}

async function dfPlayLiked(trackUri, shuffle) {
  const user = await dfUsername();
  const ctx = "spotify:user:" + user + ":collection";
  try {
    if (shuffle !== undefined) Spicetify.Player.setShuffle(!!shuffle);
    if (trackUri) await Spicetify.Player.playUri(ctx, {}, { skipTo: { uri: trackUri } });
    else await Spicetify.Player.playUri(ctx);
  } catch (e) {
    if (trackUri) Spicetify.Player.playUri(trackUri);
  }
}

/* ------------------------------------------------------------------ */
/* Помощники                                                           */
/* ------------------------------------------------------------------ */

function dfAgo(ts) {
  if (!ts) return "";
  const d = (Date.now() - ts) / 86400000;
  if (d < 1) return "сегодня";
  if (d < 2) return "вчера";
  if (d < 7) return Math.floor(d) + " " + dfPlural(Math.floor(d), "день", "дня", "дней") + " назад";
  if (d < 31) {
    const w = Math.floor(d / 7);
    return w + " " + dfPlural(w, "неделю", "недели", "недель") + " назад";
  }
  return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function dfPlural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function dfTotal(ms) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? h + " ч " + (m % 60) + " мин" : m + " мин";
}

const DF_HEART_ART =
  '<svg viewBox="0 0 100 100"><defs><radialGradient id="dfh" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#ffd3e2"/><stop offset="1" stop-color="#ff5c8a"/></radialGradient></defs><path d="M50 82S17 62 10 41C5 26 15 13 29 13c9 0 15 5 21 12 6-7 12-12 21-12 14 0 24 13 19 28-7 21-40 41-40 41z" fill="url(#dfh)"/></svg>';

function DFHeartArt({ size }) {
  return dfH(
    "div",
    { className: "df-heartart", style: { width: size, height: size } },
    dfH("div", { className: "df-heartart__svg", dangerouslySetInnerHTML: { __html: DF_HEART_ART } })
  );
}

function DFEq() {
  return dfH("span", { className: "df-eq", "aria-label": "играет" }, dfH("i"), dfH("i"), dfH("i"));
}

function DFTrackRow({ t, index, active, playing, onPlay, showAdded, liked, onHeart }) {
  return dfH(
    "div",
    {
      className: "df-row" + (active ? " is-active" : "") + (liked === false ? " is-unliked" : "") + (t.playable === false ? " is-disabled" : ""),
      onDoubleClick: onPlay,
      role: "row",
    },
    dfH(
      "div",
      { className: "df-row__idx" },
      dfH("span", { className: "df-row__n" }, active && playing ? dfH(DFEq) : index + 1),
      dfH("button", { className: "df-row__play", onClick: onPlay, title: "Играть" }, dfH(DFIcon, { name: active && playing ? "pause" : "play", size: 16 }))
    ),
    t.cover ? dfH("img", { className: "df-row__cover", src: t.cover, alt: "", loading: "lazy" }) : dfH("div", { className: "df-row__cover" }),
    dfH(
      "div",
      { className: "df-row__info" },
      dfH("div", { className: "df-row__title" }, t.title),
      dfH("div", { className: "df-row__artist" }, t.explicit ? dfH("span", { className: "df-e" }, "E") : null, t.artists.join(", "))
    ),
    dfH("div", { className: "df-row__album" }, t.album),
    showAdded ? dfH("div", { className: "df-row__added" }, dfAgo(t.addedAt)) : null,
    dfH(
      "button",
      {
        className: "df-row__heart" + (liked === false ? " is-off" : ""),
        title: liked === false ? "Вернуть в «Мне нравится»" : "Убрать из «Мне нравится»",
        onClick: onHeart,
      },
      dfH(DFIcon, { name: "heart", fill: liked !== false, size: 18 })
    ),
    dfH("div", { className: "df-row__dur" }, dfTime(t.duration))
  );
}

function dfUseHearts() {
  const [off, setOff] = dfUseState(() => new Set());
  const toggle = (t) => async (e) => {
    if (e) e.stopPropagation();
    const nowOn = off.has(t.uri);
    setOff((cur) => {
      const n = new Set(cur);
      nowOn ? n.delete(t.uri) : n.add(t.uri);
      return n;
    });
    try {
      await DFLib.setLiked(t.uri, nowOn);
      Spicetify.showNotification(nowOn ? "Снова в «Мне нравится»" : "Убрано из «Мне нравится»");
    } catch (err) {
      setOff((cur) => {
        const n = new Set(cur);
        nowOn ? n.add(t.uri) : n.delete(t.uri);
        return n;
      });
      Spicetify.showNotification("Не удалось сохранить. Попробуй ещё раз", true);
    }
  };
  return { isLiked: (t) => !off.has(t.uri), toggle };
}

/* ------------------------------------------------------------------ */
/* «Моя коллекция»                                                     */
/* ------------------------------------------------------------------ */

function DFCollectionPage({ np }) {
  const liked = dfUseCached(DFLib.liked);
  const lists = dfUseCached(DFLib.playlists);
  const hearts = dfUseHearts();
  const pend = dfUsePending(np);
  const History = Spicetify.Platform.History;
  const playingUri = pend.uri;
  const count = liked ? liked.length : null;
  const likedCtx = pend.ctx ? /collection/.test(pend.ctx) : false;
  const likedPlaying = pend.playing && likedCtx;
  const playTrack = (t) => {
    if (playingUri === t.uri) {
      pend.set({ uri: t.uri, playing: !pend.playing });
      Spicetify.Player.togglePlay();
    } else {
      pend.set({ uri: t.uri, playing: true });
      dfPlayLiked(t.uri);
    }
  };
  const playCtx = (ctx, start) => {
    if (pend.ctx === ctx) {
      pend.set({ ctx, playing: !pend.playing });
      Spicetify.Player.togglePlay();
    } else {
      pend.set({ ctx, playing: true });
      start();
    }
  };

  return dfH(
    "div",
    { className: "df-page" },
    dfH("h1", { className: "df-page__title" }, "Моя коллекция"),
    dfH(
      "div",
      { className: "df-coll-top" },
      dfH(
        "div",
        { className: "df-likedcard", onClick: () => History.push(DF_ROUTE + "/liked"), role: "button", tabIndex: 0 },
        dfH(DFHeartArt, { size: 120 }),
        dfH(
          "div",
          { className: "df-likedcard__row" },
          dfH(
            "div",
            null,
            dfH("div", { className: "df-likedcard__title" }, "Мне нравится"),
            dfH("div", { className: "df-likedcard__sub" }, count == null ? "загружаем…" : count + " " + dfPlural(count, "трек", "трека", "треков"))
          ),
          dfH(
            "button",
            {
              className: "df-ctl df-ctl--play df-likedcard__play",
              title: likedPlaying ? "Пауза" : "Играть «Мне нравится»",
              onClick: (e) => {
                e.stopPropagation();
                if (likedCtx) {
                  pend.set({ ctx: pend.ctx, playing: !pend.playing });
                  Spicetify.Player.togglePlay();
                } else {
                  dfUsername().then((u) => playCtx("spotify:user:" + u + ":collection", () => dfPlayLiked(null)));
                }
              },
            },
            dfH(DFIcon, { name: likedPlaying ? "pause" : "play", size: 24 })
          )
        )
      ),
      dfH(
        "div",
        { className: "df-coll-recent" },
        dfH("div", { className: "df-subhead" }, "Недавно понравилось"),
        liked
          ? liked.slice(0, 4).map((t, i) =>
              dfH(DFTrackRow, {
                key: t.uri,
                t,
                index: i,
                active: playingUri === t.uri,
                playing: pend.playing,
                liked: hearts.isLiked(t),
                onHeart: hearts.toggle(t),
                onPlay: () => playTrack(t),
              })
            )
          : [0, 1, 2, 3].map((i) => dfH("div", { key: i, className: "df-row df-row--skeleton" }))
      )
    ),
    dfH(
      "div",
      { className: "df-sectionhead" },
      dfH("h2", null, "Мои плейлисты"),
      lists ? dfH("span", { className: "df-sectionhead__count" }, lists.length) : null
    ),
    dfH(
      "div",
      { className: "df-grid" },
      lists
        ? lists.map((p) =>
            dfH(
              "div",
              { key: p.uri, className: "df-card" + (pend.ctx === p.uri ? " is-current" : ""), onClick: () => History.push("/playlist/" + p.id), role: "button", tabIndex: 0 },
              dfH(
                "div",
                { className: "df-card__img" },
                p.cover ? dfH("img", { src: p.cover, alt: "", loading: "lazy", decoding: "async" }) : dfH(DFIcon, { name: "lyrics", size: 40 }),
                dfH(
                  "button",
                  {
                    className: "df-card__play",
                    title: pend.ctx === p.uri && pend.playing ? "Пауза" : "Играть",
                    onClick: (e) => {
                      e.stopPropagation();
                      playCtx(p.uri, () => Spicetify.Player.playUri(p.uri));
                    },
                  },
                  dfH(DFIcon, { name: pend.ctx === p.uri && pend.playing ? "pause" : "play", size: 20 })
                )
              ),
              dfH("div", { className: "df-card__title" }, p.name),
              dfH("div", { className: "df-card__sub" }, "Плейлист · " + p.count + (p.owner ? " · " + p.owner : ""))
            )
          )
        : [0, 1, 2, 3, 4].map((i) => dfH("div", { key: i, className: "df-card df-card--skeleton" }, dfH("div", { className: "df-card__img" })))
    )
  );
}

/* ------------------------------------------------------------------ */
/* «Мне нравится»                                                      */
/* ------------------------------------------------------------------ */

const DF_PAGE_STEP = 120;

function DFLikedPage({ np }) {
  const all = dfUseCached(DFLib.liked);
  const user = dfUseCached(DFLib.me);
  const hearts = dfUseHearts();
  const [query, setQuery] = dfUseState("");
  const [limit, setLimit] = dfUseState(DF_PAGE_STEP);
  const [shuffle, setShuffle] = dfUseState(() => !!Spicetify.Player.getShuffle());
  const sentinel = dfUseRef(null);
  const History = Spicetify.Platform.History;

  // список рисуется порциями — тысячи лайков не тормозят
  dfUseEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + DF_PAGE_STEP), { rootMargin: "900px" });
    io.observe(el);
    return () => io.disconnect();
  }, [all]);
  dfUseEffect(() => setLimit(DF_PAGE_STEP), [query]);

  const tracks = all || [];
  const q = query.trim().toLowerCase();
  const filtered = dfUseMemoSafe(
    () => (q ? tracks.filter((t) => (t.title + " " + t.artists.join(" ") + " " + t.album).toLowerCase().includes(q)) : tracks),
    [tracks, q]
  );
  const shown = filtered.slice(0, limit);
  const totalMs = dfUseMemoSafe(() => tracks.reduce((s, t) => s + t.duration, 0), [tracks]);
  const pend = dfUsePending(np);
  const playingUri = pend.uri;
  const likedCtx = pend.ctx ? /collection/.test(pend.ctx) : false;
  const likedPlaying = pend.playing && likedCtx;
  const playTrack = (t) => {
    if (playingUri === t.uri) {
      pend.set({ uri: t.uri, playing: !pend.playing });
      Spicetify.Player.togglePlay();
    } else {
      pend.set({ uri: t.uri, playing: true });
      dfPlayLiked(t.uri);
    }
  };

  return dfH(
    "div",
    { className: "df-page df-page--liked" },
    dfH(
      "div",
      { className: "df-hero" },
      dfH(DFHeartArt, { size: 212 }),
      dfH(
        "div",
        { className: "df-hero__text" },
        dfH("div", { className: "df-hero__type" }, "Плейлист"),
        dfH("h1", { className: "df-hero__title" }, "Мне нравится"),
        dfH(
          "div",
          { className: "df-hero__meta" },
          user && user.avatar ? dfH("img", { src: user.avatar, alt: "" }) : null,
          user ? dfH("b", null, user.name) : null,
          all ? dfH("span", null, " · " + all.length + " " + dfPlural(all.length, "трек", "трека", "треков") + (all.length ? ", " + dfTotal(totalMs) : "")) : null
        )
      )
    ),
    dfH(
      "div",
      { className: "df-actions" },
      dfH(
        "button",
        {
          className: "df-ctl df-ctl--play",
          title: likedPlaying ? "Пауза" : "Играть",
          onClick: () => {
            if (likedCtx) {
              pend.set({ ctx: pend.ctx, playing: !pend.playing });
              Spicetify.Player.togglePlay();
            } else {
              pend.set({ ctx: "spotify:collection", playing: true });
              dfPlayLiked(null);
            }
          },
        },
        dfH(DFIcon, { name: likedPlaying ? "pause" : "play", size: 26 })
      ),
      dfH(
        "button",
        {
          className: "df-iconbtn" + (shuffle ? " is-on" : ""),
          title: shuffle ? "Выключить перемешивание" : "Перемешать",
          onClick: () => {
            Spicetify.Player.setShuffle(!shuffle);
            setShuffle(!shuffle);
          },
        },
        dfH(DFIcon, { name: "shuffle", size: 26 })
      ),
      dfH("div", { className: "df-actions__spacer" }),
      dfH(
        "label",
        { className: "df-search" },
        dfH(DFIcon, { name: "search", size: 16 }),
        dfH("input", { value: query, placeholder: "Искать в «Мне нравится»", onChange: (e) => setQuery(e.target.value) }),
        query ? dfH("button", { className: "df-search__clear", onClick: () => setQuery(""), title: "Очистить" }, "×") : null
      ),
      dfH("button", { className: "df-link", onClick: () => History.push("/collection/tracks", { doppoNative: true }), title: "Родная страница Spotify" }, "Открыть в Spotify")
    ),
    dfH(
      "div",
      { className: "df-table" },
      dfH(
        "div",
        { className: "df-row df-row--head" },
        dfH("div", { className: "df-row__idx" }, "#"),
        dfH("div", { className: "df-row__cover df-row__cover--head" }),
        dfH("div", { className: "df-row__info" }, "Название"),
        dfH("div", { className: "df-row__album" }, "Альбом"),
        dfH("div", { className: "df-row__added" }, "Добавлен"),
        dfH("div", { className: "df-row__heart" }),
        dfH("div", { className: "df-row__dur" }, dfH(DFIcon, { name: "clock", size: 16 }))
      ),
      shown.map((t, i) =>
        dfH(DFTrackRow, {
          key: t.uri,
          t,
          index: i,
          showAdded: true,
          active: playingUri === t.uri,
          playing: pend.playing,
          liked: hearts.isLiked(t),
          onHeart: hearts.toggle(t),
          onPlay: () => playTrack(t),
        })
      ),
      !all ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => dfH("div", { key: "s" + i, className: "df-row df-row--skeleton" })) : null,
      all && !all.length ? dfH("div", { className: "df-emptyrow" }, "Здесь появятся треки, которые тебе нравятся") : null,
      all && all.length && !filtered.length ? dfH("div", { className: "df-emptyrow" }, "Ничего не нашлось по «" + query + "»") : null,
      dfH("div", { ref: sentinel, style: { height: 1 } })
    )
  );
}

function dfUseMemoSafe(fn, deps) {
  return Spicetify.React.useMemo(fn, deps);
}
