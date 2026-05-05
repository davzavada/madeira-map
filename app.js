// Madeira map — weather + webcams.
// Single-file because the site is small and shipping straight to GitHub Pages.

(() => {
  const locations = window.MADEIRA_LOCATIONS;
  const microPoints = window.MADEIRA_MICRO_POINTS || [];
  const apiKey = window.MAPY_API_KEY;
  const bounds = L.latLngBounds(window.MADEIRA_BOUNDS);

  const ZOOM_MICRO = 11;     // micro info-points appear at this zoom and above

  // Visibility thresholds. We always show webcam thumbnails — at low zoom only
  // a few "tier 1" cams; tier-2 cams join in once zoomed in. Weather-only
  // ("info") points always show as a small named chip.
  const ZOOM_TIER_2 = 11;  // zoom at which tier-2 chips appear

  // ---------- localisation ----------
  const REGION = {
    "south":     "Jižní pobřeží",
    "sw":        "Jihozápad",
    "west":      "Západní pobřeží",
    "nw":        "Severozápad",
    "north":     "Severní pobřeží",
    "ne":        "Severovýchod",
    "east":      "Východní pobřeží",
    "far-east":  "Východní cíp"
  };
  const T = {
    today: "Dnes", tomorrow: "Zítra",
    feels: "Pocit", wind: "Vítr", rh: "Vlhkost", rain: "Déšť",
    next48: "Příštích 48 hodin",
    legTemp: "Teplota", legRain: "Srážky",
    weatherError: "Počasí se nepodařilo načíst.",
    noLiveCam: "Bez živého přenosu",
    offline: "kamera mimo provoz",
    sourceLink: "zdroj",
    live: "živě"
  };

  // ---------- map ----------
  const islandBounds = window.MADEIRA_ISLAND_BOUNDS
    ? L.latLngBounds(window.MADEIRA_ISLAND_BOUNDS)
    : bounds;

  const map = L.map("map", {
    center: [32.755, -16.96],
    zoom: 11,
    minZoom: 9,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: false,
    maxBounds: bounds,
    maxBoundsViscosity: 0.5
  });

  // Frame the island on first paint. Desktops reserve room on the left for
  // the summary + weekly cards (≈ 350 px wide), so Madeira sits to their
  // right. Mobile uses a hard zoom — the map only appears in map view.
  function frameIsland() {
    if (window.matchMedia("(max-width: 640px)").matches) {
      map.setView([32.755, -16.96], 10, { animate: false });
    } else {
      map.fitBounds(islandBounds, {
        // Asymmetric padding nudges the island a touch right of centre,
        // out from under the summary stack on the left.
        paddingTopLeft: [380, 40],
        paddingBottomRight: [40, 60],
        animate: false
      });
    }
    // Lock the minimum zoom to the default — zooming in is fine, zooming
    // out below the framed island view is not allowed.
    map.setMinZoom(map.getZoom());
  }
  map.whenReady(frameIsland);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Rebuild chips when the viewport crosses the mobile/desktop breakpoint or
  // is resized; chip dimensions change.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      map.invalidateSize();
      refreshAllChips();
      positionWeekly();
    }, 150);
  });

  // Re-frame the island when the map becomes visible after a viewport-mode
  // toggle (mobile list → mobile map view).
  function reframeOnView() { frameIsland(); refreshAllChips(); }

  // Refresh chip thumbnails every 60 s — the cache-busting timestamp embedded
  // in the YouTube live URL changes per minute, so re-rendering pulls fresh
  // frames.
  setInterval(() => {
    refreshAllChips();
    if (map.getZoom() >= ZOOM_MICRO) refreshMicroChips();
  }, 60_000);

  // Mapy.com only serves 256-px tiles via this endpoint — `detectRetina: true`
  // would fetch deeper-zoom tiles, sharpening the map but also shrinking the
  // label text. Sticking with 256 keeps the labels readable; on retina
  // screens this means the tiles are slightly soft, but it's the right
  // tradeoff for a map you read.
  L.tileLayer(
    `https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=${apiKey}`,
    {
      maxZoom: 18,
      tileSize: 256,
      crossOrigin: true,
      bounds
    }
  ).addTo(map);

  // ---------- WMO mapping ----------
  const wmoMap = {
    0:  ["Jasno", "sun"], 1: ["Skoro jasno", "sun"],
    2:  ["Polojasno", "sun-cloud"], 3: ["Zataženo", "cloud"],
    45: ["Mlha", "fog"], 48: ["Mlha s námrazou", "fog"],
    51: ["Slabé mrholení", "drizzle"], 53: ["Mrholení", "drizzle"], 55: ["Husté mrholení", "drizzle"],
    56: ["Mrznoucí mrholení", "drizzle"], 57: ["Mrznoucí mrholení", "drizzle"],
    61: ["Slabý déšť", "rain"], 63: ["Déšť", "rain"], 65: ["Silný déšť", "rain"],
    66: ["Mrznoucí déšť", "rain"], 67: ["Mrznoucí déšť", "rain"],
    71: ["Slabé sněžení", "snow"], 73: ["Sněžení", "snow"], 75: ["Silné sněžení", "snow"], 77: ["Sněhová zrna", "snow"],
    80: ["Přeháňky", "rain"], 81: ["Přeháňky", "rain"], 82: ["Silné přeháňky", "rain"],
    85: ["Sněhové přeháňky", "snow"], 86: ["Sněhové přeháňky", "snow"],
    95: ["Bouřka", "storm"], 96: ["Bouřka s krupobitím", "storm"], 99: ["Bouřka s krupobitím", "storm"]
  };
  const wmo = (code) => wmoMap[code] ?? ["—", "cloud"];

  const glyph = (kind, size = 18) => {
    const s = (paths) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" class="wx-glyph">${paths}</svg>`;
    switch (kind) {
      case "sun":
        return s(
          '<circle cx="12" cy="12" r="4.2" fill="currentColor"/>' +
          '<g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
          '<path d="M12 3v2"/><path d="M12 19v2"/><path d="M3 12h2"/><path d="M19 12h2"/>' +
          '<path d="M5.6 5.6l1.4 1.4"/><path d="M17 17l1.4 1.4"/>' +
          '<path d="M5.6 18.4l1.4-1.4"/><path d="M17 7l1.4-1.4"/></g>'
        );
      case "sun-cloud":
        return s(
          '<circle cx="9" cy="9" r="3" fill="currentColor" opacity="0.85"/>' +
          '<path d="M7 17a3.5 3.5 0 010-7 4.5 4.5 0 018.7 1.2A3 3 0 0117 17H7z" fill="currentColor" opacity="0.55"/>'
        );
      case "cloud":
        return s('<path d="M7 17a3.5 3.5 0 010-7 4.5 4.5 0 018.7 1.2A3 3 0 0117 17H7z" fill="currentColor" opacity="0.7"/>');
      case "fog":
        return s(
          '<path d="M7 13a3.5 3.5 0 010-7 4.5 4.5 0 018.7 1.2A3 3 0 0117 13H7z" fill="currentColor" opacity="0.55"/>' +
          '<g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
          '<path d="M5 17h14"/><path d="M7 20h10"/></g>'
        );
      case "drizzle": case "rain":
        return s(
          '<path d="M7 13a3.5 3.5 0 010-7 4.5 4.5 0 018.7 1.2A3 3 0 0117 13H7z" fill="currentColor" opacity="0.6"/>' +
          '<g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
          '<path d="M9 16l-1 3"/><path d="M13 16l-1 3"/><path d="M17 16l-1 3"/></g>'
        );
      case "snow":
        return s(
          '<path d="M7 13a3.5 3.5 0 010-7 4.5 4.5 0 018.7 1.2A3 3 0 0117 13H7z" fill="currentColor" opacity="0.55"/>' +
          '<g fill="currentColor"><circle cx="9" cy="18" r="1"/><circle cx="13" cy="20" r="1"/><circle cx="17" cy="18" r="1"/></g>'
        );
      case "storm":
        return s(
          '<path d="M7 13a3.5 3.5 0 010-7 4.5 4.5 0 018.7 1.2A3 3 0 0117 13H7z" fill="currentColor" opacity="0.6"/>' +
          '<path d="M11 14l-2 4h2l-1 3 4-5h-2l1-2z" fill="currentColor"/>'
        );
      default:
        return s('<circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.5"/>');
    }
  };

  const compass = (deg) => ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"][Math.round(deg / 45) % 8];
  const fmtTime = (iso) => !iso ? "—" : new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const fmtDay = (iso, idx) =>
    idx === 0 ? T.today : idx === 1 ? T.tomorrow : new Date(iso).toLocaleDateString("cs-CZ", { weekday: "short" });
  const fmtHour = (iso) => new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit" });
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- weather ----------
  // Always hit the live Open-Meteo API on load — we want the freshest data
  // available, not a half-hour-old cache.
  const weatherCache = new Map();

  async function fetchWeather(loc) {
    if (weatherCache.has(loc.id)) return weatherCache.get(loc.id);
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${loc.lat}&longitude=${loc.lon}` +
      "&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation,weather_code,relative_humidity_2m" +
      "&hourly=temperature_2m,precipitation,precipitation_probability,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code,sunrise,sunset" +
      "&timezone=auto&forecast_days=7&past_days=1&wind_speed_unit=kmh";
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather fetch failed");
    const data = await res.json();
    weatherCache.set(loc.id, data);
    return data;
  }

  async function prefetchAllWeather() {
    const results = await Promise.allSettled(locations.map((loc) => fetchWeather(loc)));
    results.forEach((r, i) => { if (r.status === "fulfilled") weatherCache.set(locations[i].id, r.value); });
    computeNiceToday();
    refreshAllChips();
    renderForecastCards();
    renderWeekly();
    renderCards();
    updateFavicon();
    // Micro points are lazy: only fetch their weather once we cross the zoom
    // threshold, to keep the initial page load light.
    if (map.getZoom() >= ZOOM_MICRO) ensureMicroLoaded();
  }

  // ---------- micro info-points (weather-only, zoom ≥ 12) ----------
  const microLayer = L.layerGroup().addTo(map);
  let microFetched = false;

  async function ensureMicroLoaded() {
    if (microFetched) {
      refreshMicroChips();
      return;
    }
    microFetched = true;
    const results = await Promise.allSettled(microPoints.map((p) => fetchWeather(p)));
    results.forEach((r, i) => { if (r.status === "fulfilled") weatherCache.set(microPoints[i].id, r.value); });
    refreshMicroChips();
  }

  function microChipHtml(p) {
    const wx = weatherCache.get(p.id);
    if (!wx) {
      return `<div class="micro" title="${escapeHtml(p.name)}"><span class="micro__loading"><span></span><span></span><span></span></span></div>`;
    }
    const cur = wx.current;
    const rain = rolling24Rain(wx);
    const [, kind] = wmo(cur.weather_code);
    return `
      <div class="micro" title="${escapeHtml(p.name)}">
        <span class="micro__glyph">${glyph(kind, 11)}</span>
        <span class="micro__temp">${Math.round(cur.temperature_2m)}°</span>
        <span class="micro__rain">${rain.toFixed(0)}<small>mm</small></span>
      </div>
    `;
  }

  function refreshMicroChips() {
    microLayer.clearLayers();
    if (map.getZoom() < ZOOM_MICRO) return;
    microPoints.forEach((p) => {
      const icon = L.divIcon({
        className: "mark mark--micro",
        html: microChipHtml(p),
        iconSize: [86, 22],
        iconAnchor: [8, 11]
      });
      L.marker([p.lat, p.lon], {
        icon,
        keyboard: false,
        interactive: false,        // no detail view
        bubblingMouseEvents: false
      }).addTo(microLayer);
    });
  }

  // ---------- snapshot index (cron) ----------
  // The snapshots/index.json file is rebuilt every 20 min by GitHub Actions.
  // We poll it on a timer too so a long-open page picks up fresh frames
  // without a manual reload — particularly important for Netmadeira-only
  // cams (e.g. Porto Moniz) where there is no live YouTube fallback.
  let snapshotIndex = null;
  function pollSnapshotIndex() {
    return fetch("snapshots/index.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((idx) => {
        if (!idx) return;
        const changed = !snapshotIndex || snapshotIndex.capturedAt !== idx.capturedAt;
        snapshotIndex = idx;
        if (changed) {
          refreshAllChips();
          renderCards();
        }
      })
      .catch(() => {});
  }
  pollSnapshotIndex();
  setInterval(pollSnapshotIndex, 5 * 60 * 1000);   // every 5 min

  function snapshotInfo(loc) {
    const item = snapshotIndex?.items?.[loc.id];
    if (!item) return null;
    return {
      url: `snapshots/${item.file}?t=${encodeURIComponent(item.capturedAt)}`,
      capturedAt: item.capturedAt,
      stale: !!item.stale
    };
  }

  function fmtSnapshotTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // Precipitation total for the next 24 hours (rolling, from "now").
  function rolling24Rain(wx) {
    if (!wx?.hourly) return 0;
    const now = Date.now();
    const idx = wx.hourly.time.findIndex((t) => new Date(t).getTime() >= now);
    const start = Math.max(0, idx);
    return wx.hourly.precipitation
      .slice(start, start + 24)
      .reduce((a, b) => a + b, 0);
  }

  // 24 h slice for a specific calendar day relative to today (0 = today,
  // 1 = tomorrow, …). Used by the tomorrow forecast card.
  function dayHourly(wx, dayOffset = 0) {
    if (!wx?.hourly?.time || !wx.daily?.time?.[dayOffset]) {
      return { time: [], precip: [], temp: [], pop: [], nowFrac: -1 };
    }
    const targetDate = wx.daily.time[dayOffset];   // YYYY-MM-DD
    const startIdx = wx.hourly.time.findIndex((t) => t.startsWith(targetDate));
    if (startIdx < 0) return { time: [], precip: [], temp: [], pop: [], nowFrac: -1 };
    const end = startIdx + 24;
    return {
      time:   wx.hourly.time.slice(startIdx, end),
      precip: wx.hourly.precipitation.slice(startIdx, end),
      temp:   wx.hourly.temperature_2m.slice(startIdx, end),
      pop:    wx.hourly.precipitation_probability.slice(startIdx, end),
      nowFrac: -1   // no current-time line for non-today
    };
  }

  // Total precipitation for a specific day (mm).
  function dayRain(wx, dayOffset = 0) {
    if (dayOffset === 0) return rolling24Rain(wx);
    return wx?.daily?.precipitation_sum?.[dayOffset] ?? 0;
  }

  // Hourly slice spanning `hours` total, with `pastHours` of those before
  // "now". This way the now indicator can land somewhere in the middle of
  // the chart instead of at the very left edge.
  function rollingHourly(wx, hours = 24, pastHours = 0) {
    if (!wx?.hourly) return { time: [], precip: [], temp: [], pop: [], nowFrac: 0 };
    const now = Date.now();
    const idxFuture = wx.hourly.time.findIndex((t) => new Date(t).getTime() >= now);
    const start = Math.max(0, idxFuture - pastHours);
    const end = Math.min(wx.hourly.time.length, start + hours);
    const time   = wx.hourly.time.slice(start, end);
    const tStart = time.length ? new Date(time[0]).getTime() : now;
    const tEnd   = time.length ? new Date(time[time.length - 1]).getTime() : now;
    const span   = Math.max(1, tEnd - tStart);
    return {
      time,
      precip: wx.hourly.precipitation.slice(start, end),
      temp:   wx.hourly.temperature_2m.slice(start, end),
      pop:    wx.hourly.precipitation_probability.slice(start, end),
      nowFrac: Math.max(0, Math.min(1, (now - tStart) / span))
    };
  }

  // ---------- forecast cards (today + tomorrow) ------------------------
  // Each card tracks its own active location, so the user can compare e.g.
  // "Calheta today" vs "Funchal tomorrow" side by side.
  const activeByCard = Object.create(null);

  function renderForecastCard(opts) {
    const { rootId, dayOffset, dayWord, includeNowLine } = opts;
    const root = document.getElementById(rootId);
    if (!root) return;

    const ranked = locations
      .map((loc) => ({ loc, wx: weatherCache.get(loc.id), rain: dayRain(weatherCache.get(loc.id), dayOffset) }))
      .filter((x) => x.wx)
      .sort((a, b) => a.rain - b.rain);
    if (!ranked.length) return;

    const best = ranked[0];

    if (!activeByCard[rootId] || !ranked.some((r) => r.loc.id === activeByCard[rootId])) {
      activeByCard[rootId] = best.loc.id;
    }
    const active = ranked.find((r) => r.loc.id === activeByCard[rootId]);
    const activeT = active.wx.daily.temperature_2m_max?.[dayOffset];

    // For "today" we use a rolling window with 6 h of past data so the red
    // "now" line lands in the middle. For other days we use the calendar
    // day (00–23h) and skip the now line.
    const bestSeries = dayOffset === 0
      ? rollingHourly(active.wx, 24, 6)
      : dayHourly(active.wx, dayOffset);
    const n = bestSeries.precip.length;

    // viewBox aspect tracks the rendered aspect (≈ 320 × 110 in CSS) so
    // `preserveAspectRatio="none"` doesn't stretch text and bars vertically.
    const W = 320, H = 110;
    const padL = 22, padR = 22, padT = 8, padB = 20;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const x = (i) => padL + (i / Math.max(1, n - 1)) * innerW;

    const tMin = Math.floor(Math.min(...bestSeries.temp) - 1);
    const tMax = Math.ceil(Math.max(...bestSeries.temp) + 1);
    const tRange = Math.max(1, tMax - tMin);
    const yT = (v) => padT + (1 - (v - tMin) / tRange) * innerH;

    const tempPath = bestSeries.temp
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yT(v).toFixed(1)}`)
      .join(" ");
    const fillPath = tempPath + ` L${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`;

    // Absolute precipitation scale: 0 / 5 / 10 mm using the full chart
    // height — most days sit well under 10 mm so this gives meaningful detail.
    const pMax = 10;
    const yP = (v) => padT + innerH - Math.min(1, v / pMax) * innerH;
    const bars = bestSeries.precip.map((v, i) => {
      const xc = x(i);
      const yy = yP(v);
      const h = (padT + innerH) - yy;
      const op = Math.min(1, 0.30 + (bestSeries.pop[i] || 0) / 100);
      return `<rect x="${(xc - 2).toFixed(1)}" y="${yy.toFixed(1)}" width="4" height="${Math.max(0, h).toFixed(1)}" rx="1" fill="var(--rain)" opacity="${op.toFixed(2)}"/>`;
    }).join("");

    // "now" indicator — only on today's card.
    const nowRule = (includeNowLine && bestSeries.nowFrac >= 0)
      ? `<line x1="${(padL + bestSeries.nowFrac * innerW).toFixed(1)}" x2="${(padL + bestSeries.nowFrac * innerW).toFixed(1)}" y1="${padT}" y2="${(padT + innerH).toFixed(1)}" class="summary__now"/>`
      : "";

    const yLabels = [];
    for (let k = 0; k <= 2; k++) {
      const v = Math.round(tMin + (tRange * k) / 2);
      yLabels.push(
        `<line x1="${padL}" x2="${W - padR}" y1="${yT(v).toFixed(1)}" y2="${yT(v).toFixed(1)}" class="summary__grid"/>` +
        `<text x="${padL - 4}" y="${(yT(v) + 3).toFixed(1)}" class="summary__ax summary__ax--y">${v}°</text>`
      );
    }
    const xLabels = [];
    for (let i = 0; i < n; i += 6) {
      xLabels.push(`<text x="${(x(i)).toFixed(1)}" y="${(H - 5).toFixed(1)}" class="summary__ax">${escapeHtml(fmtHour(bestSeries.time[i]))}</text>`);
    }
    // right-side precip axis labels — 0 / 10 / 20 mm absolute
    const pAxis = `
      <text x="${(W - padR + 2).toFixed(1)}" y="${(yP(pMax) + 3).toFixed(1)}" class="summary__ax summary__ax--rain">${pMax}<tspan class="summary__ax-unit">mm</tspan></text>
      <text x="${(W - padR + 2).toFixed(1)}" y="${(yP(pMax / 2) + 3).toFixed(1)}" class="summary__ax summary__ax--rain">${pMax / 2}</text>
      <text x="${(W - padR + 2).toFixed(1)}" y="${(yP(0) + 3).toFixed(1)}" class="summary__ax summary__ax--rain">0</text>
    `;

    const lines = `
      ${yLabels.join("")}
      ${bars}
      <path d="${fillPath}" class="summary__fill"/>
      <path d="${tempPath}" class="summary__temp-line"/>
      ${nowRule}
      ${pAxis}
    `;

    const activeIsBest = active.loc.id === best.loc.id;
    const subText = (activeIsBest ? "" : escapeHtml(active.loc.name) + " · ")
      + active.rain.toFixed(1) + " mm srážek za 24 h"
      + (activeT != null ? ` · ${Math.round(activeT)}°` : "");

    root.innerHTML = `
      <p class="summary__lead">
        Nejhezčí počasí ${escapeHtml(dayWord)} v oblasti
        <strong class="summary__where">${escapeHtml(best.loc.name)}</strong>
        <span class="summary__sub">${subText}</span>
      </p>
      <svg class="summary__chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Srážky v příštích 24 hodinách">
        ${lines}
        ${xLabels.join("")}
      </svg>
      <ul class="summary__list">
        ${ranked.map((r, i) =>
          `<li class="summary__row${i === 0 ? " summary__row--best" : ""}${r.loc.id === activeByCard[rootId] ? " summary__row--active" : ""}"
               data-loc-id="${escapeHtml(r.loc.id)}"
               role="button"
               tabindex="0">
             <span class="summary__name">${escapeHtml(r.loc.name)}</span>
             <span class="summary__mm">${r.rain.toFixed(1)} <small>mm</small></span>
           </li>`
        ).join("")}
      </ul>
    `;
    root.removeAttribute("aria-hidden");

    root.querySelectorAll("[data-loc-id]").forEach((el) => {
      const select = () => {
        activeByCard[rootId] = el.dataset.locId;
        // re-render only this card; the other one keeps its independent
        // selection.
        renderForecastCard(opts);
        positionWeekly();
      };
      el.addEventListener("click", select);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
      });
    });
  }

  // Render both forecast cards together so they stay in sync.
  function renderForecastCards() {
    renderForecastCard({ rootId: "summary",  dayOffset: 0, dayWord: "dnes",  includeNowLine: true });
    renderForecastCard({ rootId: "tomorrow", dayOffset: 1, dayWord: "zítra", includeNowLine: false });
    positionWeekly();
  }

  // ---------- weekly forecast (Madeira-wide) ----------
  // 4-day overview on the main card; the full 7-day view opens in the
  // detail panel — same liquid-glass surface as location detail.
  function renderWeekly() {
    const root = document.getElementById("weekly");
    if (!root) return;

    const valid = locations.map((l) => weatherCache.get(l.id)).filter((wx) => wx?.daily);
    if (!valid.length) return;

    const totalAvailable = Math.min(7, valid[0].daily.time.length);
    const visibleCount = Math.min(4, totalAvailable);

    const days = valid[0].daily.time.slice(0, visibleCount).map((iso, i) => {
      const hi = avg(valid.map((wx) => wx.daily.temperature_2m_max?.[i]).filter(isNum));
      const lo = avg(valid.map((wx) => wx.daily.temperature_2m_min?.[i]).filter(isNum));
      const rain = avg(valid.map((wx) => wx.daily.precipitation_sum?.[i]).filter(isNum));
      const codes = valid.map((wx) => wx.daily.weather_code?.[i]).filter(isNum);
      const code = codes.sort((a, b) => codes.filter((c) => c === a).length - codes.filter((c) => c === b).length).pop() ?? 3;
      return { iso, dayLabel: fmtDay(iso, i), hi, lo, rain, kind: wmo(code)[1], label: wmo(code)[0] };
    });

    const maxRain = Math.max(0.5, ...days.map((d) => d.rain));
    const allTemps = days.flatMap((d) => [d.hi, d.lo]);
    const tMin = Math.floor(Math.min(...allTemps));
    const tMax = Math.ceil(Math.max(...allTemps));
    const tRange = Math.max(1, tMax - tMin);

    positionWeekly();
    const canExpand = totalAvailable > 4;
    root.innerHTML = `
      <p class="weekly__lead">
        Týdenní výhled
        ${canExpand
          ? `<button type="button" class="weekly__toggle" data-action="open-weekly">
               Celý týden
               <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                 <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
             </button>`
          : ""}
      </p>
      <ul class="weekly__list">
        ${days.map((d) => {
          const hiPct = ((d.hi - tMin) / tRange) * 100;
          const loPct = ((d.lo - tMin) / tRange) * 100;
          const rainPct = (d.rain / maxRain) * 100;
          return `
            <li class="weekly__row">
              <span class="weekly__day">${escapeHtml(d.dayLabel)}</span>
              <span class="weekly__glyph" title="${escapeHtml(d.label)}">${glyph(d.kind, 16)}</span>
              <span class="weekly__temp">
                <span class="weekly__bar">
                  <span class="weekly__bar-fill" style="left:${loPct.toFixed(1)}%; right:${(100 - hiPct).toFixed(1)}%"></span>
                </span>
                <span class="weekly__lo">${Math.round(d.lo)}°</span>
                <span class="weekly__hi">${Math.round(d.hi)}°</span>
              </span>
              <span class="weekly__rain">
                <span class="weekly__rain-bar" style="width:${rainPct.toFixed(1)}%"></span>
                <span class="weekly__rain-mm">${d.rain.toFixed(1)}<small>mm</small></span>
              </span>
            </li>
          `;
        }).join("")}
      </ul>
    `;
    root.removeAttribute("aria-hidden");

    const toggle = root.querySelector(".weekly__toggle");
    if (toggle) {
      toggle.addEventListener("click", openWeeklyPanel);
    }
  }

  // Build the 7-day overview that fills the detail panel.
  function openWeeklyPanel() {
    const valid = locations.map((l) => weatherCache.get(l.id)).filter((wx) => wx?.daily);
    if (!valid.length) return;

    if (activeId) {
      markerByLocation.get(activeId)?.setIcon(buildIcon(locations.find((l) => l.id === activeId), false));
    }
    activeId = "__weekly__";
    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("panel--open");
    renderWeeklyPanel(valid);
  }

  function renderWeeklyPanel(valid) {
    const totalAvailable = Math.min(7, valid[0].daily.time.length);
    const days = valid[0].daily.time.slice(0, totalAvailable).map((iso, i) => {
      const hi = avg(valid.map((wx) => wx.daily.temperature_2m_max?.[i]).filter(isNum));
      const lo = avg(valid.map((wx) => wx.daily.temperature_2m_min?.[i]).filter(isNum));
      const rain = avg(valid.map((wx) => wx.daily.precipitation_sum?.[i]).filter(isNum));
      const pop = avg(valid.map((wx) => wx.daily.precipitation_probability_max?.[i]).filter(isNum));
      const codes = valid.map((wx) => wx.daily.weather_code?.[i]).filter(isNum);
      const code = codes.sort((a, b) => codes.filter((c) => c === a).length - codes.filter((c) => c === b).length).pop() ?? 3;
      const sunrise = valid[0].daily.sunrise?.[i];
      const sunset = valid[0].daily.sunset?.[i];
      return { iso, dayLabel: fmtDay(iso, i), hi, lo, rain, pop, kind: wmo(code)[1], label: wmo(code)[0], sunrise, sunset };
    });

    const allTemps = days.flatMap((d) => [d.hi, d.lo]);
    const tMin = Math.floor(Math.min(...allTemps));
    const tMax = Math.ceil(Math.max(...allTemps));
    const tRange = Math.max(1, tMax - tMin);
    const maxRain = Math.max(0.5, ...days.map((d) => d.rain));

    panelContent.innerHTML = `
      <div class="panel__head">
        <div class="panel__head-row">
          <h2 class="panel__name">Týdenní výhled</h2>
        </div>
      </div>

      <ul class="weekly-detail">
        ${days.map((d) => {
          const hiPct = ((d.hi - tMin) / tRange) * 100;
          const loPct = ((d.lo - tMin) / tRange) * 100;
          const rainPct = (d.rain / maxRain) * 100;
          return `
            <li class="weekly-detail__row">
              <div class="weekly-detail__head">
                <span class="weekly-detail__day">${escapeHtml(d.dayLabel)}</span>
                <span class="weekly-detail__glyph">${glyph(d.kind, 22)}</span>
                <span class="weekly-detail__label">${escapeHtml(d.label)}</span>
                <span class="weekly-detail__sun">↑ ${fmtTime(d.sunrise)} · ↓ ${fmtTime(d.sunset)}</span>
              </div>
              <div class="weekly-detail__bars">
                <div class="weekly-detail__temp">
                  <span class="weekly-detail__bar">
                    <span class="weekly-detail__bar-fill" style="left:${loPct.toFixed(1)}%; right:${(100 - hiPct).toFixed(1)}%"></span>
                  </span>
                  <span class="weekly-detail__lo">${Math.round(d.lo)}°</span>
                  <span class="weekly-detail__hi">${Math.round(d.hi)}°</span>
                </div>
                <div class="weekly-detail__rain">
                  <span class="weekly-detail__rain-bar" style="width:${rainPct.toFixed(1)}%"></span>
                  <span class="weekly-detail__rain-mm">${d.rain.toFixed(1)}<small>mm</small></span>
                  ${d.pop > 0 ? `<span class="weekly-detail__pop">${Math.round(d.pop)}%</span>` : ""}
                </div>
              </div>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  }

  const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Pin tomorrow below summary, then weekly below tomorrow. Heights are
  // dynamic (chart + list rows) so we measure rather than hard-code.
  function positionWeekly() {
    const summary = document.getElementById("summary");
    const tomorrow = document.getElementById("tomorrow");
    const weekly = document.getElementById("weekly");
    if (!summary || !weekly) return;
    if (window.matchMedia("(max-width: 640px)").matches) {
      if (tomorrow) tomorrow.style.top = "";
      weekly.style.top = "";
      return;
    }
    const sR = summary.getBoundingClientRect();
    if (tomorrow) tomorrow.style.top = `${Math.round(sR.bottom + 12)}px`;
    const lastBottom = tomorrow
      ? tomorrow.getBoundingClientRect().bottom
      : sR.bottom;
    weekly.style.top = `${Math.round(lastBottom + 12)}px`;
  }

  // ---------- Mobile card list (webcam previews stacked under summary) ----
  function renderCards() {
    const root = document.getElementById("cards");
    if (!root) return;

    const cb = Math.floor(Date.now() / 60000);   // minute-level cache buster
    const html = locations.map((loc) => {
      const wx = weatherCache.get(loc.id);
      const cur = wx?.current;
      const today = wx?.daily;
      const [, kind] = wx ? wmo(cur.weather_code) : ["", "cloud"];

      const snap = snapshotInfo(loc);
      const yt = loc.webcam?.youtubeId
        ? `https://i.ytimg.com/vi/${loc.webcam.youtubeId}/maxresdefault_live.jpg?_=${cb}`
        : null;
      const primarySrc = yt || snap?.url || null;
      const fallback = yt && snap ? snap.url : null;

      const rain24 = wx ? rolling24Rain(wx) : 0;
      const isLive = !!yt;
      const stamp = isLive
        ? `<span class="card__stamp card__stamp--live">${escapeHtml(T.live)}</span>`
        : (snap ? `<span class="card__stamp">${escapeHtml(fmtSnapshotTime(snap.capturedAt))}</span>` : "");

      return `
        <button class="card" type="button" data-loc-id="${escapeHtml(loc.id)}" aria-label="${escapeHtml(loc.name)}">
          <div class="card__thumb">
            ${primarySrc
              ? `<img src="${escapeHtml(primarySrc)}"
                      ${fallback ? `data-fallback="${escapeHtml(fallback)}"` : ""}
                      onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback');}else{this.style.display='none';}"
                      alt="" loading="lazy" referrerpolicy="no-referrer" />`
              : `<div class="card__thumb-none">${escapeHtml(T.noLiveCam)}</div>`}
            ${stamp}
          </div>
          <div class="card__body">
            <span class="card__name">${escapeHtml(loc.name)}</span>
            ${wx
              ? `<span class="card__glyph">${glyph(kind, 16)}</span>
                 <span class="card__temp">${Math.round(cur.temperature_2m)}°</span>
                 <span class="card__rain">${rain24.toFixed(0)}<small>mm</small></span>`
              : ""}
          </div>
        </button>
      `;
    }).join("");

    root.innerHTML = html;
    root.querySelectorAll("[data-loc-id]").forEach((el) => {
      el.addEventListener("click", () => selectLocation(el.dataset.locId));
    });
  }

  // Refresh cards alongside chips so live thumbs stay current.
  setInterval(() => { renderCards(); }, 60_000);

  // ---------- view toggle (mobile only) ----------
  const viewToggle = document.getElementById("view-toggle");
  viewToggle?.addEventListener("click", () => {
    document.body.classList.toggle("view-map");
    if (document.body.classList.contains("view-map")) {
      requestAnimationFrame(() => { map.invalidateSize(); reframeOnView(); });
    }
  });

  // ---------- "nice today" highlight ----------
  // A location is flagged as "nice" if today's max temp ≥ median + 0.3°C
  // and today's precipitation is ≤ 30% of the island-wide max for the day.
  // The user can scan for these chips to find places to head to.
  let niceIds = new Set();
  function computeNiceToday() {
    const wxs = locations.map((l) => weatherCache.get(l.id)).filter(Boolean);
    if (wxs.length < 3) return;
    const maxT = wxs.map((w) => w.daily.temperature_2m_max?.[0] ?? -99);
    const popT = wxs.map((w) => w.daily.precipitation_sum?.[0] ?? 0);
    const popMax = Math.max(...popT, 0.1);
    const tMedian = [...maxT].sort((a, b) => a - b)[Math.floor(maxT.length / 2)];
    niceIds = new Set();
    locations.forEach((loc, i) => {
      const wx = weatherCache.get(loc.id);
      if (!wx) return;
      const t = wx.daily.temperature_2m_max?.[0] ?? -99;
      const p = wx.daily.precipitation_sum?.[0] ?? 0;
      const code = wx.daily.weather_code?.[0] ?? 99;
      const dryEnough = p <= popMax * 0.3 || p < 1;
      const warmEnough = t >= tMedian + 0.3;
      const notStormy = code < 95;
      if (dryEnough && warmEnough && notStormy) niceIds.add(loc.id);
    });
  }

  // ---------- dynamic favicon ----------
  // Pick the dominant condition across all locations so the tab icon matches
  // the island's mood. Rain wins over cloud wins over sun if any meaningful precip.
  function dominantCondition() {
    let mode = "sun";
    let raining = false;
    let cloudy = false;
    let storm = false;
    weatherCache.forEach((wx) => {
      const c = wx?.current?.weather_code;
      const todayRain = wx?.daily?.precipitation_sum?.[0] ?? 0;
      if (c == null) return;
      if (c >= 95) storm = true;
      else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 86) || todayRain >= 1) raining = true;
      else if (c === 3 || c === 45 || c === 48 || c === 2) cloudy = true;
    });
    if (storm) mode = "storm";
    else if (raining) mode = "rain";
    else if (cloudy) mode = "cloud";
    return mode;
  }

  function faviconSvg(kind) {
    // Solid filled glyphs at 32px, no stroke — render crisp at favicon size.
    const wrap = (inner, bg = "transparent") =>
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='${bg}' rx='6'/>${inner}</svg>`;
    switch (kind) {
      case "sun":
        return wrap(
          `<circle cx='16' cy='16' r='6' fill='%23f0a830'/>
           <g fill='%23f0a830'>
             <rect x='15' y='2' width='2' height='4' rx='1'/>
             <rect x='15' y='26' width='2' height='4' rx='1'/>
             <rect x='2' y='15' width='4' height='2' rx='1'/>
             <rect x='26' y='15' width='4' height='2' rx='1'/>
             <rect x='5' y='5' width='2' height='4' rx='1' transform='rotate(-45 6 7)'/>
             <rect x='25' y='23' width='2' height='4' rx='1' transform='rotate(-45 26 25)'/>
             <rect x='25' y='5' width='2' height='4' rx='1' transform='rotate(45 26 7)'/>
             <rect x='5' y='23' width='2' height='4' rx='1' transform='rotate(45 6 25)'/>
           </g>`
        );
      case "cloud":
        return wrap(
          `<path d='M9 22a5 5 0 010-10 6 6 0 0111.7 1.6A4 4 0 0123 22H9z' fill='%23a3a8b1'/>`
        );
      case "rain":
        return wrap(
          `<path d='M9 18a5 5 0 010-10 6 6 0 0111.7 1.6A4 4 0 0123 18H9z' fill='%232f6fb5'/>
           <g fill='%232f6fb5'>
             <rect x='10' y='21' width='2' height='5' rx='1'/>
             <rect x='15' y='22' width='2' height='6' rx='1'/>
             <rect x='20' y='21' width='2' height='5' rx='1'/>
           </g>`
        );
      case "storm":
        return wrap(
          `<path d='M9 16a5 5 0 010-10 6 6 0 0111.7 1.6A4 4 0 0123 16H9z' fill='%23304a6e'/>
           <path d='M14 18l-2 5h3l-1 5 5-7h-3l1-3z' fill='%23f0a830'/>`
        );
      default:
        return wrap(`<circle cx='16' cy='16' r='6' fill='%23a3a8b1'/>`);
    }
  }

  function updateFavicon() {
    const kind = dominantCondition();
    const svg = faviconSvg(kind);
    const href = "data:image/svg+xml," + svg.replace(/\s+/g, " ").trim();
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = href;
  }

  // ---------- markers (always-visible chips) ----------
  const markerByLocation = new Map();

  // Decide chip mode for a given location at the current zoom.
  // - "full"  — webcam chip with thumbnail
  // - "named" — small pill with name + temp + glyph + rain (info points)
  // - "dot"   — single pin (tier-2 webcams when zoomed out)
  function chipMode(loc, zoom) {
    if (loc.kind === "info") return "named";
    const tier = loc.tier ?? 2;
    if (tier === 1) return "full";
    if (tier === 2) return zoom >= ZOOM_TIER_2 ? "full" : "dot";
    return "dot";
  }

  function makeChipHtml(loc, mode) {
    const wx = weatherCache.get(loc.id);
    const cur = wx?.current;
    const today = wx?.daily;
    const [, kind] = wx ? wmo(cur.weather_code) : ["", "cloud"];

    if (mode === "dot") {
      return `<span class="chip chip--dot" title="${escapeHtml(loc.name)}${wx ? " — " + Math.round(cur.temperature_2m) + "°" : ""}"></span>`;
    }

    if (mode === "full") {
      const snap = snapshotInfo(loc);
      const yt = loc.webcam?.youtubeId
        ? `https://i.ytimg.com/vi/${loc.webcam.youtubeId}/maxresdefault_live.jpg`
        : null;
      // Prefer the live YouTube frame (auto-updates every ~30 s while the
      // stream is on) — cache-bust per minute so the browser pulls a fresh
      // copy. Fall back to the locally archived snapshot if the live one
      // fails (stream offline). For Netmadeira-only cams, fall back to local.
      const primarySrc = yt
        ? `${yt}?_=${Math.floor(Date.now() / 60000)}`
        : (snap?.url || null);
      const fallback = yt && snap ? snap.url : null;
      const thumb = primarySrc
        ? `<img src="${escapeHtml(primarySrc)}"
                ${fallback ? `data-fallback="${escapeHtml(fallback)}"` : ""}
                onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback');}else{this.style.display='none';}"
                alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<div class="chip__thumb-none">${escapeHtml(T.noLiveCam)}</div>`;
      const niceClass = niceIds.has(loc.id) ? " chip--nice" : "";
      // For YouTube-driven chips show "živě" (live) instead of an archive
      // timestamp, since the image is real-time. Netmadeira chips fall back
      // to the snapshot's capture time.
      const stampText = yt ? T.live : (snap ? fmtSnapshotTime(snap.capturedAt) : "");
      const stamp = stampText
        ? `<span class="chip__stamp${yt ? " chip__stamp--live" : ""}">${escapeHtml(stampText)}</span>`
        : "";
      const rain24 = wx ? rolling24Rain(wx) : 0;
      return `
        <div class="chip chip--full${niceClass}">
          <div class="chip__thumb">${thumb}${loc.webcam ? '<span class="chip__rec"></span>' : ""}${stamp}</div>
          <div class="chip__body">
            <span class="chip__name">${escapeHtml(loc.name)}</span>
            ${wx
              ? `<span class="chip__glyph">${glyph(kind, 14)}</span>
                 <span class="chip__temp">${Math.round(cur.temperature_2m)}°</span>
                 <span class="chip__rain" title="srážky příštích 24 h">${rain24.toFixed(0)}<small>mm</small></span>`
              : `<span class="chip__loading"><span></span><span></span><span></span></span>`}
          </div>
          <span class="chip__pin"></span>
        </div>
      `;
    }

    // mode === "named"
    const niceClass = niceIds.has(loc.id) ? " chip--nice" : "";
    return `
      <div class="chip chip--mini${niceClass}">
        <span class="chip__pin chip__pin--mini"></span>
        ${wx
          ? `<span class="chip__glyph">${glyph(kind, 14)}</span>
             <span class="chip__name chip__name--mini">${escapeHtml(loc.name)}</span>
             <span class="chip__temp chip__temp--mini">${Math.round(cur.temperature_2m)}°</span>
             <span class="chip__rain chip__rain--mini">${(today.precipitation_sum?.[0] ?? 0).toFixed(0)}<small>mm</small></span>`
          : `<span class="chip__name chip__name--mini">${escapeHtml(loc.name)}</span>
             <span class="chip__loading"><span></span><span></span><span></span></span>`}
      </div>
    `;
  }

  function fullChipDims() {
    return window.matchMedia("(max-width: 640px)").matches
      ? { size: [140, 79], anchor: [10, 73] }
      : { size: [176, 99], anchor: [12, 92] };
  }

  function buildIcon(loc, active) {
    const mode = chipMode(loc, map.getZoom());
    let sizes;
    if (mode === "full") {
      const dims = fullChipDims();
      sizes = { size: dims.size, anchor: [...dims.anchor] };
      // Mirror the anchor for locations whose chip should extend *west* —
      // anchor moves to the bottom-right of the tile so the body trails
      // away from the geographic point in the opposite direction.
      if (loc.anchorSide === "right") {
        sizes.anchor[0] = dims.size[0] - dims.anchor[0];
      }
    } else {
      sizes = ({
        dot:   { size: [16, 16],  anchor: [8, 8] },
        named: { size: [180, 30], anchor: [10, 15] }
      })[mode];
    }
    return L.divIcon({
      className: "mark mark--" + mode + (active ? " mark--active" : ""),
      html: makeChipHtml(loc, mode),
      iconSize: sizes.size,
      iconAnchor: sizes.anchor
    });
  }

  let activeId = null;

  locations.forEach((loc) => {
    const marker = L.marker([loc.lat, loc.lon], {
      icon: buildIcon(loc, false),
      // No `title:` — that'd render the browser's system tooltip on hover.
      keyboard: true,
      riseOnHover: true,
      riseOffset: 1000,
      alt: loc.name,
      bubblingMouseEvents: false
    });
    marker.on("click", () => selectLocation(loc.id));
    marker.addTo(map);
    markerByLocation.set(loc.id, marker);
  });

  function refreshAllChips() {
    locations.forEach((loc) => {
      const marker = markerByLocation.get(loc.id);
      if (marker) marker.setIcon(buildIcon(loc, activeId === loc.id));
    });
  }

  // Always refresh chips on zoom — tier boundaries are at multiple zoom levels
  // and refreshing all 5 markers is cheap (a setIcon per marker).
  let lastZoom = map.getZoom();
  map.on("zoomend", () => {
    const z = map.getZoom();
    if (z !== lastZoom) {
      lastZoom = z;
      refreshAllChips();
      if (z >= ZOOM_MICRO) ensureMicroLoaded();
      else microLayer.clearLayers();
    }
  });

  // ---------- panel ----------
  const panel = document.getElementById("panel");
  const panelContent = panel.querySelector(".panel__content");
  const panelClose = panel.querySelector(".panel__close");
  panelClose.addEventListener("click", () => deselect());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") deselect(); });

  // Click on the map (outside any chip) closes the panel.
  map.on("click", () => { if (activeId) deselect(); });

  function selectLocation(id) {
    const loc = locations.find((l) => l.id === id);
    if (!loc) return;
    if (activeId && activeId !== id) {
      const prev = markerByLocation.get(activeId);
      prev?.setIcon(buildIcon(locations.find((l) => l.id === activeId), false));
    }
    activeId = id;
    markerByLocation.get(id).setIcon(buildIcon(loc, true));

    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("panel--open");
    renderLoading(loc);

    fetchWeather(loc).then((wx) => { if (activeId === id) renderPanel(loc, wx); })
                     .catch(() => { if (activeId === id) renderPanel(loc, null); });
  }
  function deselect() {
    if (activeId && activeId !== "__weekly__") {
      const prevLoc = locations.find((l) => l.id === activeId);
      markerByLocation.get(activeId)?.setIcon(buildIcon(prevLoc, false));
    }
    activeId = null;
    panel.classList.remove("panel--open");
    panel.setAttribute("aria-hidden", "true");
    panelContent.innerHTML = "";
  }

  function renderLoading(loc) {
    panelContent.innerHTML = `
      ${head(loc)}
      <div class="panel__loading"><span></span><span></span><span></span></div>
    `;
  }

  function head(loc, cur, label) {
    const inline = cur
      ? `<span class="panel__inline">
           <span class="panel__inline-temp">${Math.round(cur.temperature_2m)}°</span>
           <span class="panel__inline-label">${escapeHtml(label || "")}</span>
         </span>`
      : "";
    return `
      <div class="panel__head">
        <div class="panel__head-row">
          <h2 class="panel__name">${escapeHtml(loc.name)}</h2>
          ${inline}
        </div>
      </div>
    `;
  }

  function renderPanel(loc, wx) {
    if (!wx) {
      panelContent.innerHTML = `
        ${head(loc)}
        <div class="panel__error">${T.weatherError}</div>
        ${livecam(loc)}
      `;
      return;
    }
    const cur = wx.current;
    const [label, kind] = wmo(cur.weather_code);
    const days = wx.daily.time.map((iso, i) => ({
      iso,
      dayLabel: fmtDay(iso, i),
      hi: Math.round(wx.daily.temperature_2m_max[i]),
      lo: Math.round(wx.daily.temperature_2m_min[i]),
      pop: wx.daily.precipitation_probability_max[i] ?? 0,
      kind: wmo(wx.daily.weather_code[i])[1],
      label: wmo(wx.daily.weather_code[i])[0]
    }));

    panelContent.innerHTML = `
      ${head(loc, cur, label)}

      <dl class="now__stats now__stats--detail">
        <div><dt>${T.feels}</dt><dd>${Math.round(cur.apparent_temperature)}°</dd></div>
        <div><dt>${T.wind}</dt><dd>${Math.round(cur.wind_speed_10m)} <small>${compass(cur.wind_direction_10m)}</small></dd></div>
        <div><dt>${T.rh}</dt><dd>${Math.round(cur.relative_humidity_2m)}%</dd></div>
        <div><dt>${T.rain}</dt><dd>${(wx.daily.precipitation_sum?.[0] ?? 0).toFixed(1)}<small>mm</small></dd></div>
      </dl>

      <section class="forecast glass">
        ${days.slice(0, 4).map((d) => `
          <div class="day">
            <div class="day__name">${escapeHtml(d.dayLabel)}</div>
            <div class="day__glyph" title="${escapeHtml(d.label)}">${glyph(d.kind, 20)}</div>
            <div class="day__pop">${d.pop > 0 ? d.pop + "%" : ""}</div>
            <div class="day__range"><strong>${d.hi}°</strong> <span>${d.lo}°</span></div>
          </div>
        `).join("")}
      </section>

      ${renderHourlyChart(wx)}
    `;
  }

  function livecam(loc) {
    if (!loc.webcam) {
      return `
        <section class="livecam livecam--offline">
          <div class="livecam__frame livecam__frame--empty">
            <div class="livecam__none">${escapeHtml(T.offline)}</div>
          </div>
        </section>
      `;
    }

    let frame;
    if (loc.webcam.youtubeId) {
      frame = `<iframe
            src="https://www.youtube.com/embed/${loc.webcam.youtubeId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1"
            title="${escapeHtml(loc.webcam.title)} — ${T.live}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen></iframe>`;
    } else {
      // Netmadeira-style: no embeddable stream. Show the latest local snapshot,
      // refreshing every 60 s by reloading the same path with a cache-buster.
      const snap = snapshotInfo(loc);
      const src = snap?.url || "";
      frame = `<img class="livecam__still" src="${escapeHtml(src)}"
                 alt="${escapeHtml(loc.webcam.title)}"
                 data-loc-id="${escapeHtml(loc.id)}" />`;
    }

    const stamp = (() => {
      if (loc.webcam.youtubeId) return "";
      const snap = snapshotInfo(loc);
      return snap ? `<span class="livecam__time">${escapeHtml(fmtSnapshotTime(snap.capturedAt))}</span>` : "";
    })();

    return `
      <section class="livecam">
        <div class="livecam__frame">${frame}</div>
        <div class="livecam__caption">
          <span class="livecam__rec"></span>
          <span>${escapeHtml(loc.webcam.title)} — ${T.live}</span>
          ${stamp}
          <a class="livecam__src" href="${escapeHtml(loc.webcam.page)}" target="_blank" rel="noopener">${T.sourceLink} ↗</a>
        </div>
      </section>
    `;
  }

  function renderHourlyChart(wx) {
    const HOURS = 48;
    const t = wx.hourly.time.slice(0, HOURS);
    const temp = wx.hourly.temperature_2m.slice(0, HOURS);
    const pop = wx.hourly.precipitation_probability.slice(0, HOURS);
    const precip = wx.hourly.precipitation.slice(0, HOURS);

    const W = 600, H = 180;
    const padL = 28, padR = 28, padT = 22, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const tMin = Math.floor(Math.min(...temp) - 1);
    const tMax = Math.ceil(Math.max(...temp) + 1);
    const tRange = Math.max(1, tMax - tMin);
    const x = (i) => padL + (i / (HOURS - 1)) * innerW;
    const yT = (v) => padT + (1 - (v - tMin) / tRange) * innerH;

    const tempPath = temp.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yT(v).toFixed(1)}`).join(" ");
    const fillPath = tempPath + ` L${x(HOURS - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`;

    // Absolute scale, same as the summary chart so values are comparable.
    const pMax = 10;
    const yP = (v) => padT + innerH - Math.min(1, v / pMax) * innerH;
    const bars = precip.map((v, i) => {
      const xc = x(i);
      const y = yP(v);
      const h = (padT + innerH) - y;
      const opacity = Math.min(1, 0.25 + (pop[i] || 0) / 100);
      return `<rect x="${(xc - 3).toFixed(1)}" y="${y.toFixed(1)}" width="6" height="${Math.max(0, h).toFixed(1)}" rx="1.5" fill="var(--rain)" opacity="${opacity.toFixed(2)}"/>`;
    }).join("");

    const xLabels = [];
    for (let i = 0; i < HOURS; i += 6) {
      xLabels.push(`<text x="${x(i).toFixed(1)}" y="${(H - 8).toFixed(1)}" class="ax-x">${escapeHtml(fmtHour(t[i]))}</text>`);
    }
    const yLabels = [];
    for (let k = 0; k <= 2; k++) {
      const v = Math.round(tMin + (tRange * k) / 2);
      yLabels.push(
        `<line x1="${padL}" x2="${W - padR}" y1="${yT(v).toFixed(1)}" y2="${yT(v).toFixed(1)}" class="ax-grid"/>` +
        `<text x="${padL - 6}" y="${(yT(v) + 3).toFixed(1)}" class="ax-y">${v}°</text>`
      );
    }
    // right-side precipitation axis — 0 / 10 / 20 mm absolute
    const pAxis = `
      <text x="${(W - padR + 2).toFixed(1)}" y="${(yP(pMax) + 3).toFixed(1)}" class="ax-y ax-y--rain">${pMax}<tspan class="ax-y__unit">mm</tspan></text>
      <text x="${(W - padR + 2).toFixed(1)}" y="${(yP(pMax / 2) + 3).toFixed(1)}" class="ax-y ax-y--rain">${pMax / 2}</text>
      <text x="${(W - padR + 2).toFixed(1)}" y="${(yP(0) + 3).toFixed(1)}" class="ax-y ax-y--rain">0</text>
    `;
    const nowX = x(0);

    return `
      <section class="hourly">
        <header class="hourly__head">
          <h3>${T.next48}</h3>
          <div class="hourly__legend">
            <span class="leg leg--temp">${T.legTemp}</span>
            <span class="leg leg--rain">${T.legRain}</span>
          </div>
        </header>
        <svg class="hourly__chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Hourly forecast">
          ${yLabels.join("")}
          ${bars}
          <path d="${fillPath}" class="temp-fill"/>
          <path d="${tempPath}" class="temp-line"/>
          <line x1="${nowX}" x2="${nowX}" y1="${padT}" y2="${padT + innerH}" class="now-rule"/>
          ${xLabels.join("")}
          ${pAxis}
        </svg>
      </section>
    `;
  }

  // kick off
  prefetchAllWeather();
})();
