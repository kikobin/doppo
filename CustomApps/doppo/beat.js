// doppo — движок ритма (расширение из комплекта приложения).
// Берёт анализ трека Spotify (Spicetify.getAudioData → beats, segments) и
// публикует window.doppoBeat = { pulse, loud, tempo, key, mode, acquire() }.
// Считает только пока кто-то подписан (открыт «Мой поток») — в остальное
// время не тратит ни CPU, ни запросов.

(function doppoBeat() {
  if (!window.Spicetify || !Spicetify.Player || !Spicetify.Platform) {
    setTimeout(doppoBeat, 250);
    return;
  }

  const beat = { pulse: 0, loud: 0, tempo: 0, key: -1, mode: 1, hasData: false, playing: false, acquire };
  window.doppoBeat = beat;

  let users = 0;
  let raf = 0;
  let timer = 0;
  let analysisUri = null;
  let beats = [];
  let segs = [];
  let base = 0;
  let at = performance.now();

  const clock = () => (beat.playing ? base + (performance.now() - at) : base);
  function sync(hard) {
    const p = Spicetify.Player.getProgress() || 0;
    const pl = Spicetify.Player.isPlaying();
    const pred = clock();
    base = hard || pl !== beat.playing || Math.abs(p - pred) > 300 ? p : pred + (p - pred) * 0.2;
    at = performance.now();
    beat.playing = pl;
  }

  async function loadAnalysis() {
    const d = Spicetify.Player.data;
    const item = d && (d.item || d.track);
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
      /* анализа нет — мягкое покачивание */
    }
  }

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

  function frame() {
    const t = clock();
    let target = 0;
    let loud = 0;
    if (beat.playing && beat.hasData) {
      const i = find(beats, t);
      if (i >= 0) {
        const b = beats[i];
        const phase = Math.min(1, (t - b.start) / Math.max(1, b.dur));
        target = Math.pow(1 - phase, 2.4) * (0.55 + 0.45 * b.conf);
      }
      const s = find(segs, t);
      if (s >= 0) loud = Math.min(1, Math.max(0, (segs[s].loud + 32) / 30));
    } else if (beat.playing) {
      target = Math.pow(1 - ((t / 625) % 1), 2.4) * 0.35;
      loud = 0.3;
    }
    beat.pulse = target;
    beat.loud += (loud - beat.loud) * 0.35;
    raf = requestAnimationFrame(frame);
  }

  const onPlay = () => sync(true);
  const onSong = () => {
    sync(true);
    loadAnalysis();
  };

  function start() {
    sync(true);
    loadAnalysis();
    timer = setInterval(() => sync(false), 250);
    Spicetify.Player.addEventListener("onplaypause", onPlay);
    Spicetify.Player.addEventListener("songchange", onSong);
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    Spicetify.Player.removeEventListener("onplaypause", onPlay);
    Spicetify.Player.removeEventListener("songchange", onSong);
    beat.pulse = 0;
  }

  function acquire() {
    if (users++ === 0) start();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (--users === 0) stop();
    };
  }
})();
