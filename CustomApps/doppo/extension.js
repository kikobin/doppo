// doppo — расширение, которое идёт в комплекте с приложением «Мой поток»
// (manifest.json → subfiles_extension). Запускается вместе со Spotify.
//
// Что делает (всё ДОБАВЛЯЕТ, ничего не убирает из Spotify):
//  • блок навигации doppo над «Моей медиатекой»: Мой поток / Поиск / Коллекция;
//  • кнопку «Мой поток» в нижнем плеере (рядом с очередью, текстом и т.д.);
//  • пункт «Запустить поток с этого трека» в контекстном меню трека;
//  • подменю «doppo» в меню профиля с настройками;
//  • открывает текст doppo вместо родного экрана текста Spotify (отключаемо);
//  • (по желанию) открывает «Мой поток» при запуске.
//
// Настройки лежат в localStorage["doppo:settings"] — их же читает приложение.

(function doppoExtension() {
  if (
    !window.Spicetify ||
    !Spicetify.Platform ||
    !Spicetify.Platform.History ||
    !Spicetify.Player ||
    !Spicetify.Menu ||
    !Spicetify.Playbar ||
    !Spicetify.ContextMenu ||
    !Spicetify.URI
  ) {
    setTimeout(doppoExtension, 200);
    return;
  }

  const ROUTE = "/doppo";
  const KEY = "doppo:settings";
  const History = Spicetify.Platform.History;
  const ru = !Spicetify.Locale || String(Spicetify.Locale.getLocale() || "ru").startsWith("ru");
  const T = ru
    ? {
        flow: "Мой поток",
        search: "Поиск",
        collection: "Коллекция",
        startFlow: "Запустить поток с этого трека",
        nav: "Блок навигации doppo",
        openOnStart: "Открывать «Мой поток» при запуске",
        smoke: "Дымка в «Моём потоке»",
        playbar: "Кнопка «Мой поток» в плеере",
        lyrics: "Текст doppo вместо родного",
        pages: "«Мне нравится» в стиле doppo",
        canvas: "Видео Canvas на фоне",
      }
    : {
        flow: "My Flow",
        search: "Search",
        collection: "Collection",
        startFlow: "Start flow from this track",
        nav: "doppo navigation block",
        openOnStart: "Open My Flow on start",
        smoke: "Smoke in My Flow",
        playbar: "My Flow button in player",
        lyrics: "doppo lyrics instead of native",
        pages: "doppo Liked Songs page",
        canvas: "Canvas video background",
      };

  /* ---------------- настройки ---------------- */
  const DEFAULTS = { nav: true, openOnStart: false, smoke: true, playbar: true, lyrics: true, canvas: false, pages: true };
  function load() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }
  let settings = load();
  function save(patch) {
    settings = Object.assign({}, settings, patch);
    localStorage.setItem(KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("doppo:settings"));
    applySettings();
  }

  /* ---------------- шрифт и стили для своих элементов ---------------- */
  if (!document.getElementById("doppo-font")) {
    const link = document.createElement("link");
    link.id = "doppo-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }

  const style = document.createElement("style");
  style.id = "doppo-extension-style";
  style.textContent = `
.doppo-nav { container-type: inline-size; padding: 14px 8px 6px; display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
  font-family: "Onest", var(--encore-body-font-stack, system-ui), sans-serif; }
.doppo-nav__logo { display: flex; align-items: center; gap: 10px; padding: 2px 12px 14px; color: #f2f2ee; cursor: pointer; user-select: none; }
.doppo-nav__logo svg { width: 32px; height: 24px; flex-shrink: 0; }
.doppo-nav__logo span { font-weight: 700; font-size: 28px; letter-spacing: -0.05em; line-height: 1; }
.doppo-nav__item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 14px; padding: 11px 14px; border-radius: 16px;
  color: rgba(255,255,255,.8); font-weight: 700; font-size: 15px; cursor: pointer; transition: background .15s ease, color .15s ease; }
.doppo-nav__item svg { width: 22px; height: 22px; flex-shrink: 0; }
.doppo-nav__item:hover { background: rgba(255,255,255,.05); color: #fff; }
.doppo-nav__item:focus-visible { outline: 2px solid #fff; }
.doppo-nav__item.is-active { background: rgba(255,255,255,.09); color: #fff; }
.doppo-lyrics-on, .doppo-lyrics-on svg { color: #ffd60a !important; fill: currentColor; }
.doppo-lyrics-on::after { content: ""; position: absolute; bottom: 2px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #ffd60a; }
.doppo-nav__divider { height: 1px; background: rgba(255,255,255,.07); margin: 8px 6px 2px; }
@container (max-width: 140px) {
  .doppo-nav__logo span, .doppo-nav__label { display: none; }
  .doppo-nav__logo, .doppo-nav__item { justify-content: center; padding-left: 0; padding-right: 0; }
}`;
  document.head.appendChild(style);

  /* ---------------- блок навигации ---------------- */
  const ICONS = {
    logo:
      '<svg viewBox="0 0 34 26" fill="currentColor" aria-hidden="true"><rect x="6" y="1" width="7" height="24" rx="3.5" transform="rotate(28 9.5 13)"/><rect x="19" y="1" width="7" height="24" rx="3.5" transform="rotate(28 22.5 13)"/></svg>',
    flow:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 1-7.4 4.3"/><path d="M12 7.5a4.5 4.5 0 1 1-4 2.4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>',
    collection:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="4" width="4.5" height="16" rx="1.6"/><rect x="9.5" y="4" width="4.5" height="16" rx="1.6"/><rect x="15.4" y="4.6" width="4.5" height="15.6" rx="1.6" transform="rotate(-12 17.6 12.4)"/></svg>',
  };
  const ITEMS = [
    { label: T.flow, path: ROUTE, icon: ICONS.flow },
    { label: T.search, path: "/search", icon: ICONS.search },
    { label: T.collection, path: ROUTE + "/collection", icon: ICONS.collection, also: [ROUTE + "/liked", "/collection"] },
  ];

  const nav = document.createElement("div");
  nav.className = "doppo-nav";
  nav.setAttribute("role", "navigation");
  nav.setAttribute("aria-label", "doppo");
  const logo = document.createElement("div");
  logo.className = "doppo-nav__logo";
  logo.innerHTML = ICONS.logo + "<span>doppo</span>";
  logo.addEventListener("click", () => History.push(ROUTE));
  nav.appendChild(logo);
  for (const item of ITEMS) {
    const btn = document.createElement("button");
    btn.className = "doppo-nav__item";
    btn.dataset.path = item.path;
    btn.dataset.also = (item.also || []).join("|");
    btn.title = item.label;
    btn.innerHTML = item.icon + '<span class="doppo-nav__label">' + item.label + "</span>";
    btn.addEventListener("click", () => History.push(item.path));
    nav.appendChild(btn);
  }
  const divider = document.createElement("div");
  divider.className = "doppo-nav__divider";
  nav.appendChild(divider);

  function navHost() {
    // Вставляем НАД родной «Моей медиатекой», не трогая её содержимое.
    return (
      document.querySelector("#Desktop_LeftSidebar_Id nav") ||
      document.querySelector(".Root__nav-bar nav") ||
      document.querySelector("#Desktop_LeftSidebar_Id") ||
      document.querySelector(".Root__nav-bar")
    );
  }
  function mountNav() {
    if (!settings.nav) {
      if (nav.isConnected) nav.remove();
      return;
    }
    if (nav.isConnected) return;
    const host = navHost();
    if (!host) return;
    host.prepend(nav);
    highlight(History.location);
  }
  // history v4 отдаёт location, v5 — { action, location }: берём надёжно
  function curLoc(arg) {
    if (arg && arg.location && arg.location.pathname !== undefined) return arg.location;
    if (arg && arg.pathname !== undefined) return arg;
    return History.location || { pathname: "/" };
  }
  const isFlowPath = (p) => p === ROUTE || p === ROUTE + "/" || p.startsWith(ROUTE + "/lyrics");
  const isLyricsPath = (p) => p.startsWith(ROUTE + "/lyrics");

  function highlight(arg) {
    const path = curLoc(arg).pathname || "/";
    nav.querySelectorAll(".doppo-nav__item").forEach((btn) => {
      const paths = [btn.dataset.path].concat(btn.dataset.also ? btn.dataset.also.split("|") : []);
      const hit = (p) => path === p || path.startsWith(p + "/");
      // «Мой поток» — только сам поток и текст, не страницы коллекции
      const active = btn.dataset.path === ROUTE ? path === ROUTE || hit(ROUTE + "/lyrics") : paths.some(hit);
      btn.classList.toggle("is-active", active);
    });
    document.body.classList.toggle("doppo-route-flow", isFlowPath(path));
    document.body.classList.toggle("doppo-route-lyrics", isLyricsPath(path));
    if (playbarBtn) playbarBtn.active = isFlowPath(path);
  }

  // назад, если есть куда; иначе — на главную
  function back(fallback) {
    const canBack = typeof History.index === "number" ? History.index > 0 : History.length > 1;
    if (canBack && History.goBack) History.goBack();
    else History.push(fallback || "/");
  }
  function toggleFlow() {
    const p = curLoc().pathname;
    if (p === ROUTE) back("/");
    else History.push(ROUTE);
  }
  function toggleLyrics() {
    const p = curLoc().pathname;
    if (isLyricsPath(p)) back(ROUTE);
    else History.push(ROUTE + "/lyrics", { doppoFrom: p });
  }

  /* ---------------- кнопка в плеере ---------------- */
  let playbarBtn = null;
  let playbarRegistered = false;
  try {
    playbarBtn = new Spicetify.Playbar.Button(T.flow, ICONS.flow, toggleFlow, false, false, false);
  } catch (e) {
    playbarBtn = null;
  }

  /* ---------------- контекстное меню трека ---------------- */
  try {
    new Spicetify.ContextMenu.Item(
      T.startFlow,
      async ([uri]) => {
        if (window.doppoFlow) window.doppoFlow.startFrom(uri);
        else await Spicetify.Player.playUri(uri);
        History.push(ROUTE);
      },
      (uris) => uris.length === 1 && Spicetify.URI.isTrack(uris[0]),
      ICONS.flow
    ).register();
  } catch (e) {
    /* старые версии Spicetify — пропускаем */
  }

  /* ---------------- меню профиля: настройки ---------------- */
  const menuItems = {
    nav: new Spicetify.Menu.Item(T.nav, settings.nav, (self) => {
      save({ nav: !settings.nav });
      self.setState(settings.nav);
    }),
    playbar: new Spicetify.Menu.Item(T.playbar, settings.playbar, (self) => {
      save({ playbar: !settings.playbar });
      self.setState(settings.playbar);
    }),
    smoke: new Spicetify.Menu.Item(T.smoke, settings.smoke, (self) => {
      save({ smoke: !settings.smoke });
      self.setState(settings.smoke);
    }),
    canvas: new Spicetify.Menu.Item(T.canvas, settings.canvas, (self) => {
      save({ canvas: !settings.canvas });
      self.setState(settings.canvas);
    }),
    pages: new Spicetify.Menu.Item(T.pages, settings.pages, (self) => {
      save({ pages: !settings.pages });
      self.setState(settings.pages);
    }),
    lyrics: new Spicetify.Menu.Item(T.lyrics, settings.lyrics, (self) => {
      save({ lyrics: !settings.lyrics });
      self.setState(settings.lyrics);
    }),
    openOnStart: new Spicetify.Menu.Item(T.openOnStart, settings.openOnStart, (self) => {
      save({ openOnStart: !settings.openOnStart });
      self.setState(settings.openOnStart);
    }),
  };
  const resetItem = new Spicetify.Menu.Item(ru ? "Сбросить вкус потока" : "Reset flow taste", false, () => {
    if (window.doppoFlow) window.doppoFlow.resetTaste();
  });
  try {
    new Spicetify.Menu.SubMenu("doppo", Object.values(menuItems).concat(resetItem)).register();
  } catch (e) {
    Object.values(menuItems).forEach((i) => i.register());
  }

  /* ---------------- применение ---------------- */
  function applySettings() {
    mountNav();
    if (playbarBtn && settings.playbar !== playbarRegistered) {
      if (settings.playbar) playbarBtn.register();
      else playbarBtn.deregister();
      playbarRegistered = settings.playbar;
    }
  }

  // родной экран текста → текст doppo (сам экран Spotify остаётся доступен, если выключить пункт)
  // и родной «Любимые треки» → «Мне нравится» doppo (кроме перехода по кнопке «Открыть в Spotify»)
  function redirectLyrics(arg) {
    const loc = curLoc(arg);
    const path = loc.pathname || "";
    const native = loc.state && loc.state.doppoNative;
    let to = null;
    if (settings.lyrics && (path === "/lyrics" || path.startsWith("/lyrics/"))) to = ROUTE + "/lyrics";
    if (settings.pages && path === "/collection/tracks" && !native) to = ROUTE + "/liked";
    if (!to) return;
    setTimeout(() => (History.replace ? History.replace(to) : History.push(to)), 0);
  }

  // Кнопка «Текст» в нижнем плеере: перехватываем нажатие ещё до Spotify,
  // чтобы с любой вкладки открывался текст doppo (повторное нажатие — закрыть).
  const LYRICS_BTN =
    'button[data-testid="lyrics-button"], .main-nowPlayingBar-lyricsButton, ' +
    '.main-nowPlayingBar-extraControls button[aria-label="Lyrics"], .main-nowPlayingBar-extraControls button[aria-label="Текст"]';
  document.addEventListener(
    "click",
    (e) => {
      if (!settings.lyrics) return;
      const btn = e.target && e.target.closest && e.target.closest(LYRICS_BTN);
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleLyrics();
    },
    true
  );
  // подсвечиваем родную кнопку текста, когда открыт текст doppo
  function markLyricsBtn() {
    const on = isLyricsPath(curLoc().pathname || "");
    document.querySelectorAll(LYRICS_BTN).forEach((b) => b.classList.toggle("doppo-lyrics-on", on && settings.lyrics));
  }

  applySettings();
  highlight();
  redirectLyrics();
  markLyricsBtn();
  History.listen((arg) => {
    highlight(arg);
    redirectLyrics(arg);
    markLyricsBtn();
  });
  window.doppoNav = { toggleLyrics, toggleFlow, back };
  // Spotify иногда перерисовывает левую панель и плеер — возвращаем своё на место
  setInterval(() => {
    mountNav();
    markLyricsBtn();
  }, 2000);

  if (settings.openOnStart) {
    const p = History.location && History.location.pathname;
    if (!p || p === "/") History.push(ROUTE);
  }
})();
