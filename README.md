# doppo для Spotify

Тема и приложение для [Spicetify](https://github.com/spicetify/cli), которые делают Spotify похожим на doppo:
тёмный графит, жирный шрифт [Onest](https://fonts.google.com/specimen/Onest), большие скругления и экран **«Мой поток»**
с дымкой вокруг обложки.

## Что внутри

| Часть | Путь | Что делает |
|---|---|---|
| Тема **Doppo** | `Themes/Doppo/` | Цвета (`color.ini`), шрифт, скругления, белые кнопки, розовое сердце, крупный текст песен (`user.css`), логотип doppo и меню «Мой поток / Поиск / Коллекция» в сайдбаре (`theme.js`) |
| Приложение **«Мой поток»** | `CustomApps/doppo-flow/` | Жёлтая плашка «Мой поток», огромное название трека, обложка в анимированной дымке, название альбома, полоса «артист — трек» с прогрессом (по клику — перемотка), лайк, кнопки управления. Кнопка ☰ слева открывает экран **текста песни**: обложка слева, синхронизированный текст справа (источник — LRCLIB, запасной — встроенный текст Spotify) |

Если ничего не играет, большая кнопка ▶ запускает «поток» — перемешанные «Мне нравится».

## Установка

1. Поставь Spicetify: https://spicetify.app/docs/getting-started
2. Скачай этот репозиторий.
3. Запусти установщик.

Windows (PowerShell, из папки репозитория):

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS / Linux:

```bash
./install.sh
```

### Вручную

Скопируй `Themes/Doppo` в папку `Themes`, а `CustomApps/doppo-flow` — в `CustomApps` папки Spicetify
(это папка, где лежит конфиг из `spicetify -c`), затем:

```bash
spicetify config current_theme Doppo color_scheme doppo inject_css 1 replace_colors 1 inject_theme_js 1
```

```bash
spicetify config custom_apps doppo-flow
```

```bash
spicetify apply
```

## Настройка

- **Светлее фон** — вторая палитра: `spicetify config color_scheme fog` и `spicetify apply`.
- **Не открывать «Мой поток» при запуске** — в `Themes/Doppo/theme.js` поставь `OPEN_FLOW_ON_START = false`.
- **Акцент / цвет сердца / радиусы** — переменные `--doppo-accent`, `--doppo-heart`, `--doppo-radius` в начале `user.css`.

## Удаление

Вернуть чистый Spotify:

```bash
spicetify restore
```

## Важно

Spotify часто меняет названия CSS-классов, поэтому после крупных обновлений клиента отдельные мелочи темы
(скругления, цвета отдельных элементов) могут слететь — приложение «Мой поток» от этого не зависит.
Шрифт подгружается с Google Fonts, текст песен — с lrclib.net.
