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

  function normTrackWeb(it) {
    const t = it.track || it;
    if (!t || !t.uri) return null;
    return {
      uri: t.uri,
      title: t.name,
      artists: (t.artists || []).map((a) => a.name),
      album: (t.album && t.album.name) || "",
      cover: img(t.album && t.album.images),
      duration: t.duration_ms || 0,
      addedAt: it.added_at ? Date.parse(it.added_at) : 0,
      explicit: !!t.explicit,
    };
  }
  function normTrackPlatform(t) {
    if (!t || !t.uri) return null;
    return {
      uri: t.uri,
      title: t.name,
      artists: (t.artists || []).map((a) => a.name),
      album: (t.album && t.album.name) || "",
      cover: img(t.album && t.album.images),
      duration: (t.duration && t.duration.milliseconds) || t.duration_ms || 0,
      addedAt: t.addedAt ? Date.parse(t.addedAt) || Number(t.addedAt) : 0,
      explicit: !!t.isExplicit,
    };
  }

  async function likedPage(offset, limit) {
    try {
      const r = await Spicetify.CosmosAsync.get("https://api.spotify.com/v1/me/tracks?limit=" + limit + "&offset=" + offset);
      if (r && Array.isArray(r.items)) return { items: r.items.map(normTrackWeb).filter(Boolean), total: r.total || 0 };
    } catch (e) {
      /* дальше — внутренний API */
    }
    try {
      const L = Spicetify.Platform.LibraryAPI;
      const r = await L.getTracks({ limit, offset, sort: { field: "ADDED_AT", order: "DESC" } });
      const items = (r && (r.items || r.tracks)) || [];
      return { items: items.map(normTrackPlatform).filter(Boolean), total: (r && (r.totalLength || r.total)) || items.length };
    } catch (e) {
      return { items: [], total: 0, error: true };
    }
  }

  async function playlists() {
    try {
      const out = [];
      let url = "https://api.spotify.com/v1/me/playlists?limit=50";
      for (let i = 0; i < 4 && url; i++) {
        const r = await Spicetify.CosmosAsync.get(url);
        if (!r || !Array.isArray(r.items)) break;
        r.items.filter(Boolean).forEach((p) =>
          out.push({
            uri: p.uri,
            id: p.id,
            name: p.name,
            cover: img(p.images),
            count: (p.tracks && p.tracks.total) || 0,
            owner: (p.owner && p.owner.display_name) || "",
          })
        );
        url = r.next;
      }
      if (out.length) return out;
    } catch (e) {
      /* дальше */
    }
    try {
      const r = await Spicetify.Platform.RootlistAPI.getContents();
      const flat = [];
      const walk = (items) =>
        (items || []).forEach((x) => {
          if (x.type === "folder") walk(x.items);
          else if (x.type === "playlist")
            flat.push({ uri: x.uri, id: x.uri.split(":").pop(), name: x.name, cover: img(x.images), count: x.totalLength || 0, owner: (x.owner && x.owner.name) || "" });
        });
      walk(r && r.items);
      return flat;
    } catch (e) {
      return [];
    }
  }

  async function me() {
    try {
      const r = await Spicetify.CosmosAsync.get("https://api.spotify.com/v1/me");
      return { name: r.display_name || r.id, avatar: img(r.images), id: r.id };
    } catch (e) {
      return { name: (Spicetify.Platform && Spicetify.Platform.username) || "", avatar: "", id: Spicetify.Platform && Spicetify.Platform.username };
    }
  }

  return { likedPage, playlists, me };
})();

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

function DFTrackRow({ t, index, active, playing, onPlay, showAdded }) {
  return dfH(
    "div",
    {
      className: "df-row" + (active ? " is-active" : ""),
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
    dfH("div", { className: "df-row__heart" }, dfH(DFIcon, { name: "heart", fill: true, size: 18 })),
    dfH("div", { className: "df-row__dur" }, dfTime(t.duration))
  );
}

/* ------------------------------------------------------------------ */
/* «Моя коллекция»                                                     */
/* ------------------------------------------------------------------ */

function DFCollectionPage({ np }) {
  const [liked, setLiked] = dfUseState(null);
  const [lists, setLists] = dfUseState(null);
  const History = Spicetify.Platform.History;

  dfUseEffect(() => {
    let alive = true;
    DFLib.likedPage(0, 6).then((r) => alive && setLiked(r));
    DFLib.playlists().then((r) => alive && setLists(r));
    return () => {
      alive = false;
    };
  }, []);

  const playingUri = np.track && np.track.uri;
  const count = liked ? liked.total : null;

  return dfH(
    "div",
    { className: "df-page" },
    dfH("h1", { className: "df-page__title" }, "Моя коллекция"),
    dfH(
      "div",
      { className: "df-coll-top" },
      dfH(
        "div",
        { className: "df-likedcard", onClick: () => History.push(DF_ROUTE + "/liked"), role: "button" },
        dfH(DFHeartArt, { size: 120 }),
        dfH(
          "div",
          { className: "df-likedcard__row" },
          dfH(
            "div",
            null,
            dfH("div", { className: "df-likedcard__title" }, "Мне нравится"),
            dfH("div", { className: "df-likedcard__sub" }, count == null ? "…" : count + " " + dfPlural(count, "трек", "трека", "треков"))
          ),
          dfH(
            "button",
            {
              className: "df-ctl df-ctl--play df-likedcard__play",
              title: "Играть «Мне нравится»",
              onClick: (e) => {
                e.stopPropagation();
                dfPlayLiked(null);
              },
            },
            dfH(DFIcon, { name: "play", size: 24 })
          )
        )
      ),
      dfH(
        "div",
        { className: "df-coll-recent" },
        dfH("div", { className: "df-subhead" }, "Недавно понравилось"),
        liked
          ? liked.items.slice(0, 4).map((t, i) =>
              dfH(DFTrackRow, {
                key: t.uri,
                t,
                index: i,
                active: playingUri === t.uri,
                playing: np.playing,
                onPlay: () => (playingUri === t.uri ? Spicetify.Player.togglePlay() : dfPlayLiked(t.uri)),
              })
            )
          : [0, 1, 2, 3].map((i) => dfH("div", { key: i, className: "df-row df-row--skeleton" }))
      )
    ),
    dfH(
      "div",
      { className: "df-sectionhead" },
      dfH("h2", null, "Мои плейлисты"),
      dfH("button", { className: "df-link", onClick: () => History.push("/collection/playlists") }, "Все")
    ),
    dfH(
      "div",
      { className: "df-grid" },
      lists
        ? lists.map((p) =>
            dfH(
              "div",
              { key: p.uri, className: "df-card", onClick: () => History.push("/playlist/" + p.id), role: "button" },
              dfH(
                "div",
                { className: "df-card__img" },
                p.cover ? dfH("img", { src: p.cover, alt: "", loading: "lazy" }) : dfH(DFIcon, { name: "lyrics", size: 40 }),
                dfH(
                  "button",
                  {
                    className: "df-card__play",
                    title: "Играть",
                    onClick: (e) => {
                      e.stopPropagation();
                      Spicetify.Player.playUri(p.uri);
                    },
                  },
                  dfH(DFIcon, { name: "play", size: 20 })
                )
              ),
              dfH("div", { className: "df-card__title" }, p.name),
              dfH("div", { className: "df-card__sub" }, "Плейлист · " + p.count)
            )
          )
        : [0, 1, 2, 3, 4].map((i) => dfH("div", { key: i, className: "df-card df-card--skeleton" }, dfH("div", { className: "df-card__img" })))
    )
  );
}

/* ------------------------------------------------------------------ */
/* «Мне нравится»                                                      */
/* ------------------------------------------------------------------ */

function DFLikedPage({ np }) {
  const [tracks, setTracks] = dfUseState([]);
  const [total, setTotal] = dfUseState(null);
  const [loading, setLoading] = dfUseState(false);
  const [query, setQuery] = dfUseState("");
  const [user, setUser] = dfUseState(null);
  const [shuffle, setShuffle] = dfUseState(() => Spicetify.Player.getShuffle());
  const sentinel = dfUseRef(null);
  const busy = dfUseRef(false);
  const History = Spicetify.Platform.History;

  const loadMore = () => {
    if (busy.current) return;
    if (total != null && tracks.length >= total) return;
    busy.current = true;
    setLoading(true);
    DFLib.likedPage(tracks.length, 50).then((r) => {
      setTracks((cur) => cur.concat(r.items.filter((t) => !cur.some((c) => c.uri === t.uri))));
      setTotal(r.error ? 0 : r.total);
      setLoading(false);
      busy.current = false;
    });
  };

  dfUseEffect(() => {
    DFLib.me().then(setUser);
    loadMore();
  }, []);

  dfUseEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  });

  const q = query.trim().toLowerCase();
  const shown = q ? tracks.filter((t) => (t.title + " " + t.artists.join(" ") + " " + t.album).toLowerCase().includes(q)) : tracks;
  const totalMs = tracks.reduce((s, t) => s + t.duration, 0);
  const playingUri = np.track && np.track.uri;

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
          dfH("b", null, user ? user.name : ""),
          dfH(
            "span",
            null,
            total == null ? "" : " · " + total + " " + dfPlural(total, "трек", "трека", "треков") + (total && tracks.length >= total ? ", " + dfTotal(totalMs) : "")
          )
        )
      )
    ),
    dfH(
      "div",
      { className: "df-actions" },
      dfH(
        "button",
        { className: "df-ctl df-ctl--play", title: "Играть", onClick: () => (np.track && np.playing && tracks.some((t) => t.uri === playingUri) ? Spicetify.Player.togglePlay() : dfPlayLiked(null)) },
        dfH(DFIcon, { name: np.playing && tracks.some((t) => t.uri === playingUri) ? "pause" : "play", size: 26 })
      ),
      dfH(
        "button",
        {
          className: "df-iconbtn" + (shuffle ? " is-on" : ""),
          title: "Перемешать",
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
        dfH("input", { value: query, placeholder: "Искать в «Мне нравится»", onChange: (e) => setQuery(e.target.value) })
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
          playing: np.playing,
          onPlay: () => (playingUri === t.uri ? Spicetify.Player.togglePlay() : dfPlayLiked(t.uri)),
        })
      ),
      loading ? [0, 1, 2, 3, 4, 5].map((i) => dfH("div", { key: "s" + i, className: "df-row df-row--skeleton" })) : null,
      !loading && total === 0 ? dfH("div", { className: "df-emptyrow" }, "Здесь появятся треки, которые тебе нравятся") : null,
      dfH("div", { ref: sentinel, style: { height: 1 } })
    )
  );
}
