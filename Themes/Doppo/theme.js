// doppo — theme.js для Spicetify
// Добавляет логотип doppo и меню «Мой поток / Поиск / Коллекция» в левый сайдбар.
// Требует: spicetify config inject_theme_js 1

(function doppoTheme() {
  // Открывать «Мой поток» при запуске Spotify (true / false)
  const OPEN_FLOW_ON_START = true;
  const FLOW_APP = "doppo-flow";

  if (
    !window.Spicetify ||
    !Spicetify.Platform ||
    !Spicetify.Platform.History ||
    !document.querySelector(".Root__nav-bar, #Desktop_LeftSidebar_Id")
  ) {
    setTimeout(doppoTheme, 300);
    return;
  }

  const History = Spicetify.Platform.History;
  const hasFlow = !!(Spicetify.Config && Array.isArray(Spicetify.Config.custom_apps) && Spicetify.Config.custom_apps.includes(FLOW_APP));

  document.body.classList.add("doppo");

  // шрифт — на случай если @import в user.css заблокирован
  if (!document.getElementById("doppo-font")) {
    const link = document.createElement("link");
    link.id = "doppo-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }

  const ICONS = {
    logo:
      '<svg viewBox="0 0 34 26" fill="currentColor" aria-hidden="true">' +
      '<rect x="6" y="1" width="7" height="24" rx="3.5" transform="rotate(28 9.5 13)"/>' +
      '<rect x="19" y="1" width="7" height="24" rx="3.5" transform="rotate(28 22.5 13)"/></svg>',
    flow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M12 3.5a8.5 8.5 0 1 1-7.4 4.3"/><path d="M12 7.5a4.5 4.5 0 1 1-4 2.4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>',
    collection:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<rect x="3" y="4" width="4.5" height="16" rx="1.6"/><rect x="9.5" y="4" width="4.5" height="16" rx="1.6"/>' +
      '<rect x="15.4" y="4.6" width="4.5" height="15.6" rx="1.6" transform="rotate(-12 17.6 12.4)"/></svg>',
  };

  const ITEMS = [
    { label: "Мой поток", path: hasFlow ? "/" + FLOW_APP : "/", icon: ICONS.flow },
    { label: "Поиск", path: "/search", icon: ICONS.search },
    { label: "Коллекция", path: "/collection", icon: ICONS.collection },
  ];

  function build() {
    const nav = document.createElement("div");
    nav.className = "doppo-nav";

    const logo = document.createElement("div");
    logo.className = "doppo-logo";
    logo.innerHTML = ICONS.logo + "<span>doppo</span>";
    logo.addEventListener("click", () => History.push(ITEMS[0].path));
    nav.appendChild(logo);

    for (const item of ITEMS) {
      const btn = document.createElement("button");
      btn.className = "doppo-nav__item";
      btn.dataset.path = item.path;
      btn.title = item.label;
      btn.innerHTML = item.icon + '<span class="doppo-nav__label">' + item.label + "</span>";
      btn.addEventListener("click", () => History.push(item.path));
      nav.appendChild(btn);
    }

    const divider = document.createElement("div");
    divider.className = "doppo-nav__divider";
    nav.appendChild(divider);
    return nav;
  }

  let navEl = build();

  function mount() {
    if (document.contains(navEl)) return;
    const host =
      document.querySelector("#Desktop_LeftSidebar_Id nav") ||
      document.querySelector(".Root__nav-bar nav") ||
      document.querySelector("#Desktop_LeftSidebar_Id") ||
      document.querySelector(".Root__nav-bar");
    if (!host) return;
    host.prepend(navEl);
    highlight(History.location);
  }

  function highlight(location) {
    const path = (location && location.pathname) || "/";
    navEl.querySelectorAll(".doppo-nav__item").forEach((btn) => {
      const p = btn.dataset.path;
      const active = p === "/" ? path === "/" : path === p || path.startsWith(p + "/");
      btn.classList.toggle("is-active", active);
    });
  }

  mount();
  // Spotify иногда перерисовывает сайдбар — возвращаем меню на место
  setInterval(mount, 1500);
  History.listen(highlight);

  if (OPEN_FLOW_ON_START && hasFlow) {
    const path = History.location && History.location.pathname;
    if (!path || path === "/") History.push("/" + FLOW_APP);
  }
})();
