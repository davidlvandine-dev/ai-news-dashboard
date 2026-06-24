const LAT = 28.214193;
const LON = -80.728470;

const ALERT_REFRESH_MS  = 5  * 60 * 1000;
const RADAR_REFRESH_MS  = 10 * 60 * 1000;
const FRAME_INTERVAL_MS = 600;

const SEVERITY_ORDER = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];

const SEVERITY_STYLE = {
  Extreme:  { bg: 'rgba(239,68,68,0.18)',    border: '#ef4444', text: '#ef4444',  icon: '🔴' },
  Severe:   { bg: 'rgba(249,115,22,0.18)',   border: '#f97316', text: '#f97316',  icon: '🟠' },
  Moderate: { bg: 'rgba(251,191,36,0.18)',   border: '#fbbf24', text: '#d97706',  icon: '🟡' },
  Minor:    { bg: 'rgba(96,165,250,0.18)',   border: '#60a5fa', text: '#3b82f6',  icon: '🔵' },
  Unknown:  { bg: 'rgba(136,145,164,0.18)',  border: '#8891a4', text: '#8891a4',  icon: '⚪' },
};

// --- State ---
let map;
let radarLayers  = [];
let radarTimes   = [];
let currentFrame = 0;
let isPlaying    = true;
let animTimer    = null;

// --- DOM ---
const els = {
  alertBanner:      document.getElementById('alertBanner'),
  alertBannerIcon:  document.getElementById('alertBannerIcon'),
  alertBannerTitle: document.getElementById('alertBannerTitle'),
  alertBannerSub:   document.getElementById('alertBannerSub'),
  alertsList:       document.getElementById('alertsList'),
  alertsTitle:      document.getElementById('alertsTitle'),
  playPause:        document.getElementById('radarPlayPause'),
  scrubber:         document.getElementById('radarScrubber'),
  timeLabel:        document.getElementById('radarTimeLabel'),
  lastUpdated:      document.getElementById('weatherLastUpdated'),
  themeToggle:      document.getElementById('themeToggle'),
};

// --- Theme ---
function updateThemeLabel() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  els.themeToggle.textContent = light ? '🌙 Dark mode' : '☀️ Light mode';
}

els.themeToggle.addEventListener('click', () => {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  if (light) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
  }
  updateThemeLabel();
});

updateThemeLabel();

// --- Map ---
function initMap() {
  map = L.map('map', { center: [LAT, LON], zoom: 7, zoomControl: true });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
  }).addTo(map);

  L.circleMarker([LAT, LON], {
    radius: 6,
    color: '#2dd4bf',
    fillColor: '#2dd4bf',
    fillOpacity: 0.9,
    weight: 2,
  }).addTo(map).bindTooltip('Your location', { permanent: false });
}

// --- Radar ---
async function loadRadar() {
  try {
    const resp = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await resp.json();

    const wasPlaying = isPlaying;
    stopAnimation();

    radarLayers.forEach(l => map.removeLayer(l));
    radarLayers = [];
    radarTimes  = [];

    const frames = data.radar.past;
    const host   = data.host;

    frames.forEach(f => {
      const layer = L.tileLayer(
        `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
        { opacity: 0, zIndex: 2, maxZoom: 19, maxNativeZoom: 6, attribution: 'RainViewer' }
      );
      layer.addTo(map);
      radarLayers.push(layer);
      radarTimes.push(f.time);
    });

    els.scrubber.max   = frames.length - 1;
    currentFrame       = frames.length - 1;
    els.scrubber.value = currentFrame;

    showFrame(currentFrame);
    if (wasPlaying) startAnimation();
  } catch (e) {
    console.error('Radar load failed:', e);
  }
}

function showFrame(idx) {
  radarLayers.forEach((l, i) => l.setOpacity(i === idx ? 0.75 : 0));
  els.scrubber.value = idx;
  const ts = radarTimes[idx];
  if (ts) {
    els.timeLabel.textContent = new Date(ts * 1000).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });
  }
}

function startAnimation() {
  clearInterval(animTimer);
  animTimer = setInterval(() => {
    currentFrame = (currentFrame + 1) % radarLayers.length;
    showFrame(currentFrame);
  }, FRAME_INTERVAL_MS);
  els.playPause.textContent = '⏸ Pause';
  isPlaying = true;
}

function stopAnimation() {
  clearInterval(animTimer);
  animTimer = null;
  els.playPause.textContent = '▶ Play';
  isPlaying = false;
}

els.playPause.addEventListener('click', () => {
  if (isPlaying) stopAnimation();
  else startAnimation();
});

els.scrubber.addEventListener('input', () => {
  stopAnimation();
  currentFrame = Number(els.scrubber.value);
  showFrame(currentFrame);
});

// --- Alerts ---
function severityRank(s) {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? SEVERITY_ORDER.length - 1 : i;
}

async function loadAlerts() {
  try {
    const resp = await fetch(
      `https://api.weather.gov/alerts/active?point=${LAT},${LON}`,
      { headers: { 'User-Agent': 'ai-news-dashboard (davidlvandine@gmail.com)' } }
    );
    const data   = await resp.json();
    const alerts = (data.features || [])
      .map(f => f.properties)
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

    renderAlertBanner(alerts);
    renderAlerts(alerts);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    els.lastUpdated.textContent = `Alerts updated ${now}`;
  } catch (e) {
    console.error('Alert load failed:', e);
    els.alertsTitle.textContent = 'Unable to load alerts';
  }
}

function renderAlertBanner(alerts) {
  const top = alerts.find(a => a.severity === 'Extreme' || a.severity === 'Severe');
  if (!top) {
    els.alertBanner.hidden = true;
    return;
  }
  const s = SEVERITY_STYLE[top.severity] || SEVERITY_STYLE.Unknown;
  els.alertBanner.hidden = false;
  els.alertBanner.style.borderLeftColor = s.border;
  els.alertBanner.style.background      = s.bg;
  els.alertBannerIcon.textContent        = s.icon;
  els.alertBannerTitle.textContent       = top.event;
  els.alertBannerSub.textContent         = top.headline ? ' — ' + top.headline : '';
}

function formatDt(iso) {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    els.alertsTitle.textContent = 'No active alerts';
    els.alertsList.innerHTML = '';
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No active NWS weather alerts for this area.';
    els.alertsList.appendChild(empty);
    return;
  }

  els.alertsTitle.textContent = `${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}`;
  els.alertsList.innerHTML = '';

  alerts.forEach(a => {
    const s    = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.Unknown;
    const card = document.createElement('article');
    card.className = 'alert-card';
    card.style.borderLeftColor = s.border;

    // head
    const head = document.createElement('div');
    head.className = 'alert-card-head';

    const left = document.createElement('div');
    const cat  = document.createElement('p');
    cat.className   = 'category';
    cat.textContent = [a.severity, a.urgency].filter(Boolean).join(' · ');
    const title = document.createElement('h3');
    title.className   = 'alert-card-title';
    title.textContent = a.event || 'Alert';
    left.append(cat, title);

    const badge = document.createElement('span');
    badge.className   = 'alert-card-badge';
    badge.style.background = s.bg;
    badge.style.color      = s.text;
    badge.textContent = a.certainty || '?';
    head.append(left, badge);
    card.appendChild(head);

    // headline
    if (a.headline) {
      const hl = document.createElement('p');
      hl.className   = 'alert-card-headline';
      hl.textContent = a.headline;
      card.appendChild(hl);
    }

    // times
    const times = document.createElement('div');
    times.className = 'alert-card-times';
    const eff = document.createElement('span');
    eff.textContent = `Effective: ${formatDt(a.effective)}`;
    const exp = document.createElement('span');
    exp.textContent = `Expires: ${formatDt(a.expires)}`;
    times.append(eff, exp);
    card.appendChild(times);

    // description (collapsible)
    if (a.description) {
      const details = document.createElement('details');
      details.className = 'alert-card-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Full description';
      const desc = document.createElement('p');
      desc.className   = 'alert-card-desc';
      desc.textContent = a.description;
      details.append(summary, desc);
      card.appendChild(details);
    }

    els.alertsList.appendChild(card);
  });
}

// --- Init ---
initMap();
loadRadar();
loadAlerts();

setInterval(loadAlerts, ALERT_REFRESH_MS);
setInterval(loadRadar,  RADAR_REFRESH_MS);
