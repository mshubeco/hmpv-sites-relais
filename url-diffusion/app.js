"use strict";

const DATA = window.HMPV_URL;
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const NS = "http://www.w3.org/2000/svg";

const PAL = {
  ink: "#2c2622",
  muted: "#7d7368",
  paper: "#fbf8f2",
  line: "#e5d9cb",
  rt: "#b85c38",
  qt: "#3e6d78",
  rp: "#5e7d62",
  rtMid: "#d4a894",
  qtMid: "#8aafb6",
  rpMid: "#a9c4ad",
  rtPale: "#f0e0d6",
  qtPale: "#d7e4e7",
  rpPale: "#e1ebe3",
};

const LEVELS = {
  spatial: {
    restreint: { label: "Restreint", color: "#a89886" },
    moyen: { label: "Moyen", color: "#8d7356" },
    large: { label: "Large", color: "#3e6d78" },
  },
  temporal: {
    bref: { label: "Bref", color: "#b85c38" },
    soutenu: { label: "Soutenu", color: "#8d6b4a" },
    persistant: { label: "Persistant", color: "#7d5e78" },
  },
  influence: {
    faible: { label: "Faible", color: "#c4b8aa" },
    rt: { label: "RT", color: "#b85c38" },
    conversation: { label: "Conversation", color: "#5e7d62" },
    mixte: { label: "Mixte", color: "#6d7a55" },
  },
};

const NAMED = [
  { id: "locale", label: "Virale locale", short: "Locale", color: "#b85c38" },
  { id: "trans", label: "Transcommunautaire", short: "Trans.", color: "#3e6d78" },
  { id: "conversation", label: "Conversationnelle", short: "Conv.", color: "#5e7d62" },
  { id: "persistante", label: "Persistante", short: "Persist.", color: "#7d5e78" },
  { id: "ponctuelle", label: "Ponctuelle", short: "Ponct.", color: "#8d7356" },
];

const PROFILES = [
  ...NAMED,
  { id: "autre", label: "Sans croisement nommé", short: "Autre", color: "#c4b8aa" },
];

const COLS = [
  { key: "adopters", group: "Adoption", label: "Adoptants", kind: "int", formula: "Comptes distincts dont un message autre qu'un retweet contient l'URL. Pour chaque compte, seul le premier de ces messages est retenu. Un retweet n'est pas une adoption." },
  { key: "n_milieux", group: "Pénétration", label: "Milieux", kind: "int", formula: "Milieux distincts où l'URL est vue. Un milieu est une communauté Louvain d'au moins 25 comptes. Il compte si un message qui contient l'URL y est publié, ou si un relais documenté a sa source ou son auteur dans ce milieu." },
  { key: "rt_n", group: "Actes", label: "RT", kind: "int", formula: "Retweets qui contiennent l'URL, plus les retweets dont le message source, présent dans le corpus, contient l'URL." },
  { key: "quote_n", group: "Actes", label: "Quotes", kind: "int", formula: "Quotes qui contiennent l'URL, plus les quotes dont le message cité, présent dans le corpus, contient l'URL." },
  { key: "reply_n", group: "Actes", label: "Replies", kind: "int", formula: "Replies qui contiennent l'URL, plus les replies dont le message parent, présent dans le corpus, contient l'URL." },
  { key: "half_life", group: "Temps", label: "Demi-vie (j)", kind: "num", formula: "Parmi les adoptants, on ordonne les horodatages de leur premier message explicite. La demi-vie est le délai, en jours, entre le premier adoptant et celui qui atteint la moitié des adoptants : (t⌈n/2⌉ − t₁) / 86 400. Sans adoptant, le calcul se fait sur les messages associés. Un seul adoptant vaut 0." },
  { key: "reactivations", group: "Temps", label: "Réactivations", kind: "int", formula: "Nombre de fois où deux jours civils qui portent au moins un message associé sont séparés par au moins 7 jours civils entièrement silencieux." },
];

const FICHE = [
  { label: "Score spatial", formula: "0,55 × position relative des adoptants + 0,45 × position relative des milieux. La position relative vaut 0,5 à la médiane du corpus des 368 URL, et 1 au seuil haut (max(2 × médiane, 3e quartile))." },
  { label: "Score temporel", formula: "0,70 × position relative de la demi-vie + 0,30 × min(1, réactivations / 2)." },
  { label: "Score d'influence", formula: "Position relative du volume RT + quotes + replies, par rapport à la médiane et au seuil haut du corpus." },
  { label: "Durée totale", formula: "(Horodatage du dernier message associé − horodatage du premier) / 86 400." },
  { label: "1er milieu (adoptants)", formula: "Part des adoptants dans le milieu le plus représenté parmi les adoptants situés dans un milieu." },
  { label: "Profondeur / viralité", formula: "Plus long chemin et distance moyenne du plus grand arbre reconstructible (Goel et al., 2016)." },
];

let REF = null;
const plotSpace = {
  bound2d: false,
  bound3d: false,
  colorMode: "influence",
  xRange2d: null,
  yRange2d: null,
  camera3d: null,
};

const SEGS = [
  ["rt_in", "RT internes", PAL.rt],
  ["rt_out", "RT inter", PAL.rtMid],
  ["rt_other", "RT sans communauté", PAL.rtPale],
  ["qt_in", "Quotes internes", PAL.qt],
  ["qt_out", "Quotes inter", PAL.qtMid],
  ["qt_other", "Quotes d'introduction ou sans communauté", PAL.qtPale],
  ["rp_in", "Replies internes", PAL.rp],
  ["rp_out", "Replies inter", PAL.rpMid],
  ["rp_other", "Replies d'introduction ou sans communauté", PAL.rpPale],
];

const state = {
  q: "",
  minAd: 0,
  profiles: new Set(),
  sortKey: "adopters",
  sortDir: -1,
  mode: "rank",
  selected: null,
  day: null,
  view: [],
  base: [],
};

function metric(row, key) {
  if (key === "conversation") return (row.quote_n || 0) + (row.reply_n || 0);
  if (key === "rt_other") return Math.max(0, (row.rt_n || 0) - (row.rt_in || 0) - (row.rt_out || 0));
  if (key === "qt_other") return Math.max(0, (row.quote_n || 0) - (row.qt_in || 0) - (row.qt_out || 0));
  if (key === "rp_other") return Math.max(0, (row.reply_n || 0) - (row.rp_in || 0) - (row.rp_out || 0));
  if (key === "spatial") return row._score ? row._score.spatial : null;
  if (key === "temporal") return row._score ? row._score.temporal : null;
  if (key === "influence") return row._score ? row._score.influence : null;
  return row[key];
}

function fmt(kind, value) {
  if (value == null || Number.isNaN(value)) return "—";
  if (kind === "int") return Math.round(value).toLocaleString("fr-FR");
  if (kind === "share") return (value * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %";
  return value.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(value) >= 10 ? 1 : 2 });
}

function unit(value, singular, plural) {
  const n = value || 0;
  return `${fmt("int", n)} ${n === 1 ? singular : plural}`;
}

function pct(value) {
  if (value == null) return "—";
  return (value * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " %";
}

function fmtDate(unix) {
  const date = new Date(unix * 1000);
  return date.getUTCDate() + " " + MONTHS[date.getUTCMonth()] + " " + date.getUTCFullYear();
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function pathOf(url) {
  try {
    const parsed = new URL(url);
    const path = (parsed.pathname + parsed.search) || "/";
    return path === "/" ? "" : path;
  } catch (err) {
    return "";
  }
}

function visibleCols() {
  return COLS;
}

function quantile(values, p) {
  const xs = values.slice().sort((a, b) => a - b);
  if (!xs.length) return 0;
  const i = (xs.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.min(a + 1, xs.length - 1);
  const t = i - a;
  return xs[a] * (1 - t) + xs[b] * t;
}

function refBand(values) {
  const med = quantile(values, 0.5);
  const p75 = quantile(values, 0.75);
  return { med, high: Math.max(2 * med, p75, med + 1e-9) };
}

function meanSd(values) {
  const n = values.length || 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const var_ = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  return { mean, sd: Math.sqrt(var_) || 1 };
}

function buildRef(rows) {
  const mils = rows.map((row) => row.n_milieux || 0);
  const milStat = meanSd(mils);
  return {
    ad: refBand(rows.map((row) => row.adopters || 0)),
    mil: refBand(mils),
    milMean: milStat.mean,
    milSd: milStat.sd,
    hl: refBand(rows.map((row) => row.half_life || 0)),
    acts: refBand(rows.map((row) => (row.rt_n || 0) + (row.quote_n || 0) + (row.reply_n || 0))),
    n: rows.length,
  };
}

function milZ(row) {
  return ((row.n_milieux || 0) - REF.milMean) / REF.milSd;
}

/** Échelle d'affichage : asinh étale le centre et limite l'effet des outliers. */
function milZVis(row) {
  return Math.asinh(milZ(row));
}

function softRel(value, med, high) {
  const x = value || 0;
  if (x <= 0) return 0;
  if (x <= med) return 0.5 * (x / Math.max(med, 1e-9));
  return 0.5 + 0.5 * Math.min(1, (x - med) / Math.max(high - med, 1e-9));
}

function shareBag(row) {
  const mech = (row.rt_n || 0) + (row.quote_n || 0) + (row.reply_n || 0);
  return {
    acts: mech,
    rtShare: mech ? row.rt_n / mech : 0,
    convShare: mech ? ((row.quote_n || 0) + (row.reply_n || 0)) / mech : 0,
  };
}

function axisScores(row) {
  const shares = shareBag(row);
  const spatial = 0.55 * softRel(row.adopters || 0, REF.ad.med, REF.ad.high)
    + 0.45 * softRel(row.n_milieux || 0, REF.mil.med, REF.mil.high);
  const temporal = 0.70 * softRel(row.half_life || 0, REF.hl.med, REF.hl.high)
    + 0.30 * Math.min(1, (row.reactivations || 0) / 2);
  const influence = softRel(shares.acts, REF.acts.med, REF.acts.high);
  return {
    spatial,
    temporal,
    influence,
    rtShare: shares.rtShare,
    convShare: shares.convShare,
    acts: shares.acts,
  };
}

function axisLevels(row, score) {
  const ad = row.adopters || 0;
  const mil = row.n_milieux || 0;
  const hl = row.half_life || 0;
  const rea = row.reactivations || 0;
  let spatial = "moyen";
  if (ad <= REF.ad.med && mil <= REF.mil.med) spatial = "restreint";
  else if (ad >= REF.ad.high || mil >= REF.mil.high) spatial = "large";
  let temporal = "soutenu";
  if (hl <= REF.hl.med && rea === 0) temporal = "bref";
  else if (rea >= 1 || hl >= REF.hl.high) temporal = "persistant";
  let influence = "faible";
  if (score.acts > REF.acts.med) {
    if (score.convShare >= 0.35 && score.rtShare >= 0.5) influence = "mixte";
    else if (score.convShare >= 0.35) influence = "conversation";
    else influence = "rt";
  }
  return { spatial, temporal, influence };
}

function namedProfiles(row, score, levels) {
  const ids = [];
  if (
    (levels.influence === "rt" || levels.influence === "mixte")
    && (levels.spatial === "moyen" || levels.spatial === "large")
    && levels.temporal !== "persistant"
    && row.top_share != null
    && row.top_share >= 0.35
    && score.rtShare >= 0.5
  ) ids.push("locale");
  if (levels.spatial === "large" && (row.n_milieux || 0) >= Math.max(3, REF.mil.high)) ids.push("trans");
  if (levels.influence === "conversation" || levels.influence === "mixte") ids.push("conversation");
  if (levels.temporal === "persistant") ids.push("persistante");
  if (levels.spatial === "restreint" && levels.temporal === "bref" && levels.influence === "faible") ids.push("ponctuelle");
  return ids;
}

function annotateRow(row) {
  const score = axisScores(row);
  const levels = axisLevels(row, score);
  row._score = score;
  row._levels = levels;
  row._profiles = namedProfiles(row, score, levels);
  row._cell = `${levels.spatial}|${levels.temporal}|${levels.influence}`;
}

function annotateAll() {
  REF = buildRef(DATA.urls);
  DATA.urls.forEach(annotateRow);
}

function percentiles(rows, key) {
  const vals = [];
  rows.forEach((row, index) => {
    const value = metric(row, key);
    if (value == null || Number.isNaN(value)) return;
    vals.push([value, index]);
  });
  vals.sort((a, b) => a[0] - b[0]);
  const out = new Map();
  let cursor = 0;
  while (cursor < vals.length) {
    let end = cursor;
    while (end + 1 < vals.length && vals[end + 1][0] === vals[cursor][0]) end += 1;
    const score = vals.length === 1 ? 1 : ((cursor + end) / 2) / (vals.length - 1);
    for (let i = cursor; i <= end; i += 1) out.set(vals[i][1], score);
    cursor = end + 1;
  }
  return out;
}

function attachProfiles() {
  // Typologie figée sur le corpus entier ; les filtres ne recalculent pas les seuils.
}

function heat(p) {
  const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
  const low = [246, 241, 234];
  const mid = [231, 207, 192];
  const high = [143, 77, 56];
  const rgb = p < 0.5 ? mix(low, mid, p / 0.5) : mix(mid, high, (p - 0.5) / 0.5);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function defsHtml(list) {
  return `<dl>${list.map((item) => `<dt>${esc(item.label)}</dt><dd>${esc(item.formula)}</dd>`).join("")}</dl>`;
}

function baseRows() {
  const q = state.q.trim().toLowerCase();
  return DATA.urls.filter((row) => {
    if ((row.adopters || 0) < state.minAd) return false;
    if (!q) return true;
    const blob = [row.url, row.host, row.origin && row.origin.user, row.top_label, ...(row.aliases || [])].join(" ").toLowerCase();
    return blob.includes(q);
  });
}

function render() {
  state.base = baseRows();
  let view = state.base;
  if (state.profiles.size) {
    view = view.filter((row) => {
      const ids = row._profiles || [];
      if (!ids.length && state.profiles.has("autre")) return true;
      return ids.some((id) => state.profiles.has(id));
    });
  }
  const cols = visibleCols();
  const key = state.sortKey;
  const dir = state.sortDir;
  view = view.slice().sort((a, b) => {
    const va = metric(a, key);
    const vb = metric(b, key);
    const na = va == null || Number.isNaN(va);
    const nb = vb == null || Number.isNaN(vb);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    if (va === vb) return (b.adopters || 0) - (a.adopters || 0);
    return (va - vb) * dir;
  });
  state.view = view;
  const ranks = {};
  const bounds = {};
  cols.forEach((col) => {
    ranks[col.key] = percentiles(view, col.key);
    let lo = Infinity;
    let hi = -Infinity;
    view.forEach((row) => {
      const value = metric(row, col.key);
      if (value == null || Number.isNaN(value)) return;
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    });
    bounds[col.key] = { lo, hi };
  });
  paintChips();
  paintCoverage();
  paintTable(view, cols, ranks, bounds);
  document.getElementById("shown").textContent = view.length.toLocaleString("fr-FR") + " URL affichées";
  const current = view.find((row) => row.url === state.selected) || view[0];
  if (!current) {
    state.selected = null;
    document.getElementById("detail").innerHTML = '<p class="empty">Aucune URL ne correspond aux filtres.</p>';
    return;
  }
  const changed = current.url !== state.selected;
  state.selected = current.url;
  const last = current.series.new_ad.length - 1;
  if (changed || state.day == null || state.day > last) state.day = last;
  paintDetail(current);
}

function paintChips() {
  const counts = Object.fromEntries(PROFILES.map((p) => [p.id, 0]));
  state.base.forEach((row) => {
    if (!row._profiles.length) counts.autre += 1;
    row._profiles.forEach((id) => { counts[id] += 1; });
  });
  const box = document.getElementById("profileChips");
  box.innerHTML = PROFILES.map((p) => {
    const on = state.profiles.has(p.id) ? " on" : "";
    return `<button type="button" class="chip${on}" data-profile="${p.id}"><i class="dot" style="background:${p.color}"></i>${esc(p.label)} <span class="count">${counts[p.id]}</span></button>`;
  }).join("");
}

function cellLabel(cell) {
  const [spatial, temporal, influence] = cell.split("|");
  return `${LEVELS.spatial[spatial].label} · ${LEVELS.temporal[temporal].label} · ${LEVELS.influence[influence].label}`;
}

function pointColor(row) {
  if (row._profiles.includes("locale")) return NAMED.find((item) => item.id === "locale").color;
  if (row._profiles.includes("trans")) return NAMED.find((item) => item.id === "trans").color;
  if (row._profiles.includes("conversation")) return NAMED.find((item) => item.id === "conversation").color;
  if (row._profiles.includes("persistante")) return NAMED.find((item) => item.id === "persistante").color;
  if (row._profiles.includes("ponctuelle")) return NAMED.find((item) => item.id === "ponctuelle").color;
  return LEVELS.influence[row._levels.influence].color;
}

function coverageKey() {
  return [
    state.base.length,
    state.q,
    state.minAd,
    [...state.profiles].sort().join(","),
    plotSpace.colorMode,
  ].join("|");
}

function absExtents(rows) {
  const maxX = Math.max(REF.ad.med * 1.2, ...rows.map((row) => row.adopters || 0));
  const maxY = Math.max(REF.hl.med * 1.2, ...rows.map((row) => row.half_life || 0));
  const zs = rows.map((row) => milZVis(row));
  const zLo = Math.min(...zs);
  const zHi = Math.max(...zs);
  const span = Math.max(1.2, zHi - zLo);
  const pad = 0.12 * span;
  return {
    xMax: maxX * 1.06,
    yMax: maxY * 1.06,
    zMin: zLo - pad,
    zMax: zHi + pad,
  };
}

function hoverHtml(row) {
  const named = row._profiles.map((id) => PROFILES.find((p) => p.id === id).label).join(", ") || "sans croisement nommé";
  const z = milZ(row);
  return `<b>${esc(row.host)}</b><br>${esc(pathOf(row.url) || row.url)}<br>${esc(cellLabel(row._cell))}<br>${esc(named)}<br>adoptants ${(row.adopters || 0).toLocaleString("fr-FR")} · t½ ${fmt("num", row.half_life)} j · milieux ${(row.n_milieux || 0).toLocaleString("fr-FR")} (z=${z.toLocaleString("fr-FR", { maximumFractionDigits: 2, signDisplay: "exceptZero" })})<br>RT ${(row.rt_n || 0).toLocaleString("fr-FR")}`;
}

function paintCoverage() {
  const rows = state.base;
  const box = document.getElementById("coverageBody");
  const n = rows.length;
  if (!n) {
    box.innerHTML = '<p class="note">Aucune URL ne reste après la recherche et le filtre d\'adoptants.</p>';
    plotSpace.lastKey = "";
    plotSpace.bound2d = false;
    plotSpace.bound3d = false;
    return;
  }
  if (document.getElementById("space2dAbs") && document.getElementById("space3dAbs") && plotSpace.lastKey === coverageKey() && box.querySelector(".level-grid")) {
    drawSpace2dAbs(rows);
    drawSpace3dAbs(rows);
    return;
  }
  plotSpace.lastKey = coverageKey();
  const levelBlocks = [
    ["Spatial", "spatial", "Adoptants et milieux, seuils = médiane et seuil haut du corpus."],
    ["Temporel", "temporal", "Demi-vie et réactivations, seuils = médiane et seuil haut de la demi-vie."],
    ["Influence", "influence", "Volume d'actes et part RT vs quotes-replies, seuil volume = médiane du corpus."],
  ].map(([title, key, note]) => {
    const counts = {};
    Object.keys(LEVELS[key]).forEach((id) => { counts[id] = 0; });
    rows.forEach((row) => { counts[row._levels[key]] += 1; });
    const bars = Object.entries(LEVELS[key]).map(([id, meta]) => {
      const width = (counts[id] / n) * 100;
      return `<div class="area-row"><span class="area-name"><i class="dot" style="background:${meta.color}"></i>${esc(meta.label)}</span><span class="track"><i style="width:${width}%;background:${meta.color}"></i></span><span class="count">${counts[id]}</span></div>`;
    }).join("");
    return `<article style="--c:${Object.values(LEVELS[key])[0].color}"><h4>${esc(title)}</h4><p>${esc(note)}</p>${bars}</article>`;
  }).join("");

  const cellCounts = {};
  rows.forEach((row) => { cellCounts[row._cell] = (cellCounts[row._cell] || 0) + 1; });
  const topCells = Object.entries(cellCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([cell, count]) => {
    const width = (count / n) * 100;
    return `<div><span>${esc(cellLabel(cell))}</span><span class="count">${count}</span><span class="track" style="grid-column:1/-1"><i style="width:${width}%;background:#8f4d38"></i></span></div>`;
  }).join("");

  const namedCounts = Object.fromEntries(NAMED.map((item) => [item.id, 0]));
  let autre = 0;
  rows.forEach((row) => {
    if (!row._profiles.length) autre += 1;
    row._profiles.forEach((id) => { namedCounts[id] += 1; });
  });
  const namedBars = [
    ...NAMED.map((item) => ({ ...item, n: namedCounts[item.id] })),
    { label: "Sans croisement nommé", color: "#c4b8aa", n: autre },
  ].map((item) => {
    const width = (item.n / n) * 100;
    return `<div class="area-row"><span class="area-name"><i class="dot" style="background:${item.color}"></i>${esc(item.label)}</span><span class="track"><i style="width:${width}%;background:${item.color}"></i></span><span class="count">${item.n}</span></div>`;
  }).join("");

  const quadNote = `Les traits médians (adoptants ${fmt("num", REF.ad.med)}, t½ ${fmt("num", REF.hl.med)} j) découpent 4 espaces : bref×restreint · bref×large · durable×restreint · durable×large.`;

  plotSpace.bound2d = false;
  plotSpace.bound3d = false;
  box.innerHTML = `
    <p class="note">Lecture en valeurs absolues seulement. Taille des points = nombre de RT (échelle √). Couleur = type d'influence ou croisement nommé. Médianes figées sur les ${REF.n.toLocaleString("fr-FR")} URL du tableau.</p>
    <div class="row" style="margin:6px 0 10px">
      <button type="button" id="colorInfl" class="${plotSpace.colorMode === "influence" ? "on" : ""}">Couleur = influence</button>
      <button type="button" id="colorNamed" class="${plotSpace.colorMode === "named" ? "on" : ""}">Couleur = croisement</button>
    </div>

    <h3>1 · Plan 2D — adoptants × demi-vie</h3>
    <p class="note">${esc(quadNote)} Molette pour zoomer, clic pour ouvrir une URL.</p>
    <div class="space2d"><div id="space2dAbs"></div><div class="hud"><span>méd. adoptants ${fmt("num", REF.ad.med)} · méd. t½ ${fmt("num", REF.hl.med)} j · taille = RT</span></div></div>

    <h3>2 · Cube 3D — + pénétration milieux (z-score)</h3>
    <p class="note">Même plan (X adoptants, Y demi-vie). Z = asinh(z-score des milieux) pour étaler la pénétration relative sans laisser les outliers écraser l'axe — z = (n − moy.) / σ, moy. ${fmt("num", REF.milMean)}, σ ${fmt("num", REF.milSd)}. Plan Z = 0 = moyenne. Orbit / molette.</p>
    <div class="space3d"><div id="space3dAbs"></div><div class="hud"><span>Z = asinh(z milieux) · 0 = moyenne (${fmt("num", REF.milMean)}) · taille = RT</span></div></div>

    <h3>3 · Niveaux exhaustifs</h3>
    <div class="level-grid">${levelBlocks}</div>

    <h3>4 · Cellules et croisements</h3>
    <p class="note">La typologie exhaustive est le triplet spatial × temporel × influence. Une URL appartient à exactement une cellule. Les croisements nommés sont des labels de lecture non exclusifs.</p>
    <div class="cell-list" style="margin-bottom:12px">${topCells}</div>
    <div class="areas">${namedBars}</div>`;
  document.getElementById("colorInfl").addEventListener("click", () => {
    plotSpace.colorMode = "influence";
    paintCoverage();
  });
  document.getElementById("colorNamed").addEventListener("click", () => {
    plotSpace.colorMode = "named";
    paintCoverage();
  });
  drawSpace2dAbs(rows);
  drawSpace3dAbs(rows);
}

function groupKey(row) {
  if (plotSpace.colorMode === "named") {
    if (row._profiles.includes("locale")) return "locale";
    if (row._profiles.includes("trans")) return "trans";
    if (row._profiles.includes("conversation")) return "conversation";
    if (row._profiles.includes("persistante")) return "persistante";
    if (row._profiles.includes("ponctuelle")) return "ponctuelle";
    return "autre";
  }
  return row._levels.influence;
}

function groupMeta(key) {
  if (plotSpace.colorMode === "named") {
    return PROFILES.find((item) => item.id === key) || PROFILES.find((item) => item.id === "autre");
  }
  return { id: key, label: LEVELS.influence[key].label, color: LEVELS.influence[key].color };
}

function markerSize(rt, maxRt, selected, scale) {
  const k = scale == null ? 34 : scale;
  const base = 7 + k * Math.sqrt(Math.max(0, rt || 0) / Math.max(1, maxRt));
  return selected ? base * 1.18 : base;
}

function groupedRows(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, index });
  });
  return groups;
}

function bindPlotClick(root, boundKey) {
  if (plotSpace[boundKey]) return;
  plotSpace[boundKey] = true;
  root.on("plotly_click", (event) => {
    const url = event.points && event.points[0] && event.points[0].customdata;
    if (!url) return;
    const row = DATA.urls.find((item) => item.url === url);
    if (!row) return;
    state.selected = row.url;
    state.day = row.series.new_ad.length - 1;
    render();
    window.open(row.url, "_blank", "noopener,noreferrer");
  });
}

function drawSpace2dAbs(rows) {
  const root = document.getElementById("space2dAbs");
  if (!root || typeof Plotly === "undefined") {
    if (root) root.innerHTML = '<p class="note">Plotly n\'est pas chargé (fichier plotly.min.js manquant).</p>';
    return;
  }
  const { xMax, yMax } = absExtents(rows);
  const maxRt = Math.max(1, ...rows.map((row) => row.rt_n || 0));
  const traces = [];
  groupedRows(rows).forEach((items, key) => {
    const meta = groupMeta(key);
    const selected = items.map(({ row }) => row.url === state.selected);
    traces.push({
      type: "scatter",
      mode: "markers",
      name: meta.label,
      x: items.map(({ row }) => row.adopters || 0),
      y: items.map(({ row }) => row.half_life || 0),
      text: items.map(({ row }) => hoverHtml(row)),
      customdata: items.map(({ row }) => row.url),
      hovertemplate: "%{text}<extra></extra>",
      marker: {
        size: items.map(({ row }, i) => markerSize(row.rt_n, maxRt, selected[i], 34)),
        color: meta.color,
        opacity: 0.82,
        line: { width: items.map((_, i) => (selected[i] ? 2.2 : 0.6)), color: items.map((_, i) => (selected[i] ? "#2c2622" : "#fbf8f2")) },
        sizemode: "diameter",
      },
    });
  });
  const layout = {
    margin: { l: 54, r: 18, t: 36, b: 48 },
    paper_bgcolor: "#fbf8f2",
    plot_bgcolor: "#f7f2ea",
    xaxis: {
      range: plotSpace.xRange2d || [0, xMax],
      gridcolor: "#e5d9cb",
      zeroline: false,
      automargin: true,
      title: { text: "Adoptants (n)", font: { size: 12, color: "#3e6d78" } },
    },
    yaxis: {
      range: plotSpace.yRange2d || [0, yMax],
      gridcolor: "#e5d9cb",
      zeroline: false,
      automargin: true,
      title: { text: "Demi-vie (jours)", font: { size: 12, color: "#7d5e78" } },
    },
    shapes: [
      { type: "line", x0: REF.ad.med, x1: REF.ad.med, y0: 0, y1: yMax, line: { color: "#3e6d78", width: 1.4, dash: "dot" } },
      { type: "line", x0: 0, x1: xMax, y0: REF.hl.med, y1: REF.hl.med, line: { color: "#7d5e78", width: 1.4, dash: "dot" } },
    ],
    annotations: [
      { x: REF.ad.med * 0.45, y: REF.hl.med * 0.45, text: "bref · restreint", showarrow: false, font: { size: 11, color: "#8a7d70" }, opacity: 0.85 },
      { x: REF.ad.med + (xMax - REF.ad.med) * 0.55, y: REF.hl.med * 0.45, text: "bref · large", showarrow: false, font: { size: 11, color: "#8a7d70" }, opacity: 0.85 },
      { x: REF.ad.med * 0.45, y: REF.hl.med + (yMax - REF.hl.med) * 0.55, text: "durable · restreint", showarrow: false, font: { size: 11, color: "#8a7d70" }, opacity: 0.85 },
      { x: REF.ad.med + (xMax - REF.ad.med) * 0.55, y: REF.hl.med + (yMax - REF.hl.med) * 0.55, text: "durable · large", showarrow: false, font: { size: 11, color: "#8a7d70" }, opacity: 0.85 },
    ],
    legend: {
      orientation: "h",
      y: 1.14,
      x: 0,
      font: { size: 11, color: "#2c2622" },
      bgcolor: "rgba(251,248,242,0.9)",
    },
    showlegend: true,
    hovermode: "closest",
  };
  const config = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d"],
  };
  return Plotly.react(root, traces, layout, config).then(() => {
    bindPlotClick(root, "bound2d");
    if (!root._rangeBound) {
      root._rangeBound = true;
      root.on("plotly_relayout", (event) => {
        if (event["xaxis.range[0]"] != null && event["xaxis.range[1]"] != null) {
          plotSpace.xRange2d = [event["xaxis.range[0]"], event["xaxis.range[1]"]];
        }
        if (event["yaxis.range[0]"] != null && event["yaxis.range[1]"] != null) {
          plotSpace.yRange2d = [event["yaxis.range[0]"], event["yaxis.range[1]"]];
        }
        if (event["xaxis.autorange"] || event["yaxis.autorange"]) {
          plotSpace.xRange2d = null;
          plotSpace.yRange2d = null;
        }
      });
    }
  });
}

function planeMeshAbs(axis, value, xMax, yMax, zMin, zMax, color, name) {
  const u = [0, 1, 0, 1];
  const v = [0, 0, 1, 1];
  const zSpan = (t) => zMin + t * (zMax - zMin);
  let x;
  let y;
  let z;
  if (axis === "x") {
    x = u.map(() => value);
    y = u.map((t) => t * yMax);
    z = v.map(zSpan);
  } else if (axis === "y") {
    x = u.map((t) => t * xMax);
    y = u.map(() => value);
    z = v.map(zSpan);
  } else {
    x = u.map((t) => t * xMax);
    y = v.map((t) => t * yMax);
    z = u.map(() => value);
  }
  return {
    type: "mesh3d",
    x, y, z,
    i: [0, 0],
    j: [1, 3],
    k: [3, 2],
    opacity: 0.13,
    color,
    flatshading: true,
    hoverinfo: "skip",
    showlegend: false,
    name,
  };
}

function boxEdgesAbs(xMax, yMax, zMin, zMax) {
  const corners = [
    [0, 0, zMin], [xMax, 0, zMin], [xMax, yMax, zMin], [0, yMax, zMin],
    [0, 0, zMax], [xMax, 0, zMax], [xMax, yMax, zMax], [0, yMax, zMax],
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const x = [];
  const y = [];
  const z = [];
  edges.forEach(([a, b]) => {
    x.push(corners[a][0], corners[b][0], null);
    y.push(corners[a][1], corners[b][1], null);
    z.push(corners[a][2], corners[b][2], null);
  });
  return {
    type: "scatter3d",
    mode: "lines",
    x, y, z,
    line: { color: "#c9bba6", width: 2 },
    hoverinfo: "skip",
    showlegend: false,
    name: "cadre",
  };
}

function drawSpace3dAbs(rows) {
  const root = document.getElementById("space3dAbs");
  if (!root || typeof Plotly === "undefined") {
    if (root) root.innerHTML = '<p class="note">Plotly n\'est pas chargé (fichier plotly.min.js manquant).</p>';
    return;
  }
  const { xMax, yMax, zMin, zMax } = absExtents(rows);
  const maxRt = Math.max(1, ...rows.map((row) => row.rt_n || 0));
  const traces = [
    boxEdgesAbs(xMax, yMax, zMin, zMax),
    planeMeshAbs("x", REF.ad.med, xMax, yMax, zMin, zMax, "#3e6d78", "méd. adoptants"),
    planeMeshAbs("y", REF.hl.med, xMax, yMax, zMin, zMax, "#7d5e78", "méd. demi-vie"),
    planeMeshAbs("z", 0, xMax, yMax, zMin, zMax, "#5f7a4a", "z milieux = 0"),
  ];
  groupedRows(rows).forEach((items, key) => {
    const meta = groupMeta(key);
    const selected = items.map(({ row }) => row.url === state.selected);
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: meta.label,
      x: items.map(({ row }) => row.adopters || 0),
      y: items.map(({ row }) => row.half_life || 0),
      z: items.map(({ row }) => milZVis(row)),
      text: items.map(({ row }) => hoverHtml(row)),
      customdata: items.map(({ row }) => row.url),
      hovertemplate: "%{text}<extra></extra>",
      marker: {
        size: items.map(({ row }, i) => markerSize(row.rt_n, maxRt, selected[i], 22)),
        color: meta.color,
        opacity: 0.88,
        line: { width: items.map((_, i) => (selected[i] ? 2 : 0)), color: "#2c2622" },
      },
    });
  });
  const layout = {
    margin: { l: 0, r: 0, t: 8, b: 0 },
    paper_bgcolor: "#fbf8f2",
    scene: {
      aspectmode: "manual",
      aspectratio: { x: 1, y: 0.95, z: 1.85 },
      xaxis: {
        title: { text: "Adoptants", font: { size: 12, color: "#3e6d78" } },
        range: [0, xMax],
        backgroundcolor: "#f7f2ea",
        gridcolor: "#e5d9cb",
        zerolinecolor: "#d3c4b2",
      },
      yaxis: {
        title: { text: "Demi-vie (j)", font: { size: 12, color: "#7d5e78" } },
        range: [0, yMax],
        backgroundcolor: "#f7f2ea",
        gridcolor: "#e5d9cb",
        zerolinecolor: "#d3c4b2",
      },
      zaxis: {
        title: { text: "Milieux · asinh(z)", font: { size: 12, color: "#5f7a4a" } },
        range: [zMin, zMax],
        backgroundcolor: "#f7f2ea",
        gridcolor: "#e5d9cb",
        zeroline: true,
        zerolinecolor: "#5f7a4a",
      },
      camera: plotSpace.camera3d || { eye: { x: 1.55, y: 1.25, z: 1.35 } },
    },
    legend: {
      orientation: "h",
      y: 1.12,
      x: 0,
      font: { size: 11, color: "#2c2622" },
      bgcolor: "rgba(251,248,242,0.9)",
    },
    showlegend: true,
  };
  const config = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d"],
  };
  return Plotly.react(root, traces, layout, config).then(() => {
    bindPlotClick(root, "bound3d");
    if (!root._camBound) {
      root._camBound = true;
      root.on("plotly_relayout", (event) => {
        if (event["scene.camera"]) plotSpace.camera3d = event["scene.camera"];
      });
    }
  });
}

function paintTable(view, cols, ranks, bounds) {
  const head = cols.map((col) => {
    const mark = state.sortKey === col.key ? (state.sortDir < 0 ? " ↓" : " ↑") : "";
    return `<th data-key="${col.key}" title="${esc(col.formula)}"><span class="grp">${esc(col.group)}</span><span class="nm">${esc(col.label)}${mark}</span></th>`;
  }).join("");
  const body = view.map((row, index) => {
    const cells = cols.map((col) => {
      const value = metric(row, col.key);
      if (value == null || Number.isNaN(value)) {
        return '<td class="cell"><span class="na">—</span></td>';
      }
      let p = 0.5;
      if (state.mode === "rank") p = ranks[col.key].get(index) ?? 0.5;
      else {
        const bound = bounds[col.key];
        p = bound.hi === bound.lo ? 0.5 : (value - bound.lo) / (bound.hi - bound.lo);
      }
      const color = heat(p);
      const ink = p >= 0.88 ? PAL.paper : PAL.ink;
      const title = state.mode === "rank"
        ? `${fmt(col.kind, value)} · rang ${(p * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`
        : fmt(col.kind, value);
      return `<td class="cell"><span style="background:${color};color:${ink}" title="${esc(title)}">${fmt(col.kind, value)}</span></td>`;
    }).join("");
    const dots = (row._profiles.length ? row._profiles : ["autre"]).map((id) => {
      const prof = PROFILES.find((p) => p.id === id);
      return `<i class="dot" title="${esc(prof.label)}" style="background:${prof.color}"></i>`;
    }).join("");
    const on = row.url === state.selected ? " on" : "";
    return `<tr class="${on}" data-i="${index}"><td class="lab"><button type="button" class="linkish"><span class="host">${esc(row.host)}</span><span class="path">${esc(pathOf(row.url) || row.url)}</span><span class="mini">${dots}</span></button></td>${cells}</tr>`;
  }).join("");
  document.getElementById("sheet").innerHTML = `<table><thead><tr><th class="lab">Ressource</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function story(row) {
  const lines = [];
  const origin = row.origin || {};
  const who = origin.user ? "@" + origin.user : "un compte non nommé";
  if (origin.mode === "reprise") {
    lines.push(`Le message source est absent du corpus. Première reprise observée : RT de ${who}, le ${fmtDate(origin.t)}, milieu ${origin.label}.`);
  } else {
    lines.push(`Premier message explicite : ${who}, milieu ${origin.label}, le ${fmtDate(origin.t)}.`);
  }
  lines.push(`Cellule : ${cellLabel(row._cell)} (scores spatial ${fmt("num", row._score.spatial)}, temporel ${fmt("num", row._score.temporal)}, influence ${fmt("num", row._score.influence)}).`);
  lines.push(`${fmt("int", row.adopters)} adoptants explicites, dans ${fmt("int", row.n_milieux)} milieux sur ${DATA.meta.n_milieux}.`);
  if (row.top_label && row.top_share != null) {
    lines.push(`${row.top_label} rassemble ${pct(row.top_share)} des adoptants.`);
  }
  if (row.hors_share != null && row.hors_share >= 0.5) {
    lines.push(`Les petites composantes et les comptes hors graphe rassemblent ${pct(row.hors_share)} des adoptants.`);
  }
  const mech = (row.rt_n || 0) + (row.quote_n || 0) + (row.reply_n || 0);
  if (mech) {
    lines.push(`${unit(row.rt_n, "RT", "RT")}, ${unit(row.quote_n, "quote", "quotes")}, ${unit(row.reply_n, "reply", "replies")}.`);
  }
  lines.push(`Demi-vie ${fmt("num", row.half_life)} jours · durée totale ${fmt("num", row.duration)} jours · ${pct(row.active_frac)} de jours actifs · ${fmt("int", row.reactivations)} réactivation${row.reactivations > 1 ? "s" : ""}.`);
  if (row.sv == null) {
    lines.push("Les messages qui contiennent l'URL ne forment pas de chaîne d'au moins deux nœuds.");
  } else {
    lines.push(`Plus grand arbre : profondeur ${fmt("int", row.depth)}, viralité structurelle ${fmt("num", row.sv)}, ${pct(row.largest_share)} des messages porteurs, ${fmt("int", row.n_roots)} introduction${row.n_roots > 1 ? "s" : ""}.`);
  }
  return lines;
}

function paintDetail(row) {
  const root = document.getElementById("detail");
  const profs = row._profiles.map((id) => PROFILES.find((p) => p.id === id));
  const levelBadges = [
    LEVELS.spatial[row._levels.spatial],
    LEVELS.temporal[row._levels.temporal],
    LEVELS.influence[row._levels.influence],
  ];
  const badgeHtml = [
    row.unresolved ? '<span class="badge">redirection non résolue</span>' : "",
    row.nvar > 1 ? `<span class="badge">${row.nvar} adresses regroupées</span>` : "",
    ...levelBadges.map((p) => `<span class="badge tone" style="--c:${p.color}">${esc(p.label)}</span>`),
    ...profs.map((p) => `<span class="badge tone" style="--c:${p.color}">${esc(p.label)}</span>`),
  ].join("");
  const alias = (row.aliases || []).length
    ? `<p class="note">Adresses regroupées : ${row.aliases.map((item) => esc(item)).join(" · ")}</p>`
    : "";
  root.innerHTML = `
    <p class="kicker">${esc(row.host)}</p>
    <h2 class="url-title"><a href="${esc(row.url)}" target="_blank" rel="noopener">${esc(row.url)}</a></h2>
    <div class="badges">${badgeHtml}</div>
    ${alias}
    <ul class="story">${story(row).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    <div class="mech" id="mech"></div>
    <p class="legend" id="mechLegend"></p>
    <h2>Trajectoire</h2>
    <p class="note">Cercle plein : au moins un lien documenté arrive dans le milieu. Cercle vide : le milieu publie ou relaie l'URL sans lien entrant. Double contour : origine observée. La flèche va du milieu source vers le milieu de l'auteur du RT, du quote ou de la reply.</p>
    <svg class="scheme" id="scheme" role="img" aria-label="Schéma de diffusion par milieux"></svg>
    <p class="note" id="netnote"></p>
    <div class="slider-row">
      <input id="day" type="range" min="0" max="${row.series.new_ad.length - 1}" value="${state.day}">
      <span class="count" id="dayLab"></span>
    </div>
    <div class="charts">
      <svg class="chart" id="cumul" viewBox="0 0 640 150" role="img" aria-label="Adoptants et milieux cumulés"></svg>
      <svg class="chart" id="bars" viewBox="0 0 640 140" role="img" aria-label="RT, quotes et replies par jour"></svg>
    </div>
    <h2>Messages associés</h2>
    <p class="note">Chaque message affiché contient l'URL. « RT corpus » compte les retweets de ce message présents dans le corpus.</p>
    <div id="posts"></div>`;
  paintMech(row);
  paintPosts(row);
  paintGraphics(row);
  document.getElementById("day").addEventListener("input", (event) => {
    state.day = Number(event.target.value);
    paintGraphics(row);
  });
}

function paintMech(row) {
  const parts = SEGS.map(([key, label, color]) => ({ key, label, color, n: metric(row, key) || 0 }));
  const total = parts.reduce((sum, part) => sum + part.n, 0);
  const bar = document.getElementById("mech");
  const legend = document.getElementById("mechLegend");
  if (!total) {
    bar.style.display = "none";
    legend.textContent = "Aucun RT, quote ou reply associé à cette URL dans le corpus.";
    return;
  }
  bar.style.display = "flex";
  bar.innerHTML = parts.filter((part) => part.n).map((part) => {
    const width = (part.n / total) * 100;
    return `<i title="${esc(part.label)} : ${part.n}" style="width:${width}%;background:${part.color}"></i>`;
  }).join("");
  legend.innerHTML = parts.filter((part) => part.n).map((part) => (
    `<span><i class="sw" style="background:${part.color}"></i>${esc(part.label)} ${fmt("int", part.n)}</span>`
  )).join("");
}

function paintPosts(row) {
  const box = document.getElementById("posts");
  const names = { original: "publication", reply: "reply", quote: "quote", retweet: "RT" };
  if (!row.posts.length) {
    box.innerHTML = '<p class="note">Aucun extrait conservé.</p>';
    return;
  }
  box.innerHTML = row.posts.map((post) => {
    const who = post.user ? "@" + post.user : "compte non nommé";
    return `<article class="post"><header>${fmtDate(post.t)} · ${names[post.kind] || post.kind} · ${esc(who)} · ${esc(post.label)} · RT corpus ${fmt("int", post.rt)}${post.lang ? " · " + esc(post.lang) : ""}</header><p>${esc(post.text || "(sans texte)")}</p><a href="https://x.com/i/status/${esc(post.id)}" target="_blank" rel="noopener">ouvrir le statut</a></article>`;
  }).join("");
}

function cum(values) {
  let total = 0;
  return values.map((value) => (total += value));
}

function svgEl(name, attrs) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function paintGraphics(row) {
  const dayMax = state.day;
  const series = row.series;
  const last = series.new_ad.length - 1;
  document.getElementById("dayLab").textContent = fmtDate((series.d0 + dayMax) * 86400);
  const size = new Map();
  row.arrivals.forEach(([day, cid, count]) => {
    if (day <= dayMax) size.set(cid, (size.get(cid) || 0) + count);
  });
  const incoming = new Map();
  const internal = new Map();
  let cross = 0;
  const edges = new Map();
  row.flows.forEach(([day, source, target, rt, qt, rp]) => {
    if (day > dayMax) return;
    const weight = rt + qt + rp;
    if (target === -5) {
      cross += weight;
      return;
    }
    if (source === target) {
      const bag = internal.get(source) || { rt: 0, qt: 0, rp: 0 };
      bag.rt += rt; bag.qt += qt; bag.rp += rp;
      internal.set(source, bag);
      return;
    }
    const key = source + ">" + target;
    const bag = edges.get(key) || { s: source, t: target, rt: 0, qt: 0, rp: 0 };
    bag.rt += rt; bag.qt += qt; bag.rp += rp;
    edges.set(key, bag);
    incoming.set(target, (incoming.get(target) || 0) + weight);
  });
  const nodes = row.nodes.filter((node) => node.first <= dayMax);
  const svg = document.getElementById("scheme");
  svg.replaceChildren();
  const rowH = 54;
  const height = Math.max(180, 28 + nodes.length * rowH + 16);
  svg.setAttribute("viewBox", `0 0 640 ${height}`);
  const plotL = 176;
  const plotR = 616;
  const xOf = (day) => (last === 0 ? (plotL + plotR) / 2 : plotL + (plotR - plotL) * (day / last));
  const yOf = new Map(nodes.map((node, index) => [node.id, 36 + index * rowH + 16]));
  const maxIn = Math.max(1, ...[...edges.values()].map((edge) => Math.max(edge.rt, edge.qt, edge.rp)));
  const maxAd = Math.max(1, ...nodes.map((node) => size.get(node.id) || 0));

  [["arr-rt", PAL.rt], ["arr-qt", PAL.qt], ["arr-rp", PAL.rp]].forEach(([id, color]) => {
    const marker = svgEl("marker", { id, markerWidth: "8", markerHeight: "8", refX: "6", refY: "3", orient: "auto" });
    marker.appendChild(svgEl("path", { d: "M0,0 L7,3 L0,6 Z", fill: color }));
    const defs = svg.querySelector("defs") || svg.appendChild(svgEl("defs", {}));
    defs.appendChild(marker);
  });

  function curve(x1, y1, x2, y2, bend) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const mx = (x1 + x2) / 2 + (-dy / len) * bend;
    const my = (y1 + y2) / 2 + (dx / len) * bend;
    return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  }
  function shorten(x1, y1, x2, y2, gap) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    return [x2 - (dx / len) * gap, y2 - (dy / len) * gap];
  }

  edges.forEach((edge) => {
    if (!yOf.has(edge.s) || !yOf.has(edge.t)) return;
    const x1 = xOf(row.nodes.find((node) => node.id === edge.s).first);
    const y1 = yOf.get(edge.s);
    const target = row.nodes.find((node) => node.id === edge.t);
    const x2 = xOf(target.first);
    const y2 = yOf.get(edge.t);
    const radius = (size.get(edge.t) || 0) > 0 ? 8 + 15 * Math.sqrt((size.get(edge.t) || 0) / maxAd) : 7;
    const [ex, ey] = shorten(x1, y1, x2, y2, radius + 3);
    [["rt", PAL.rt, "arr-rt", 16], ["qt", PAL.qt, "arr-qt", 0], ["rp", PAL.rp, "arr-rp", -16]].forEach(([key, color, marker, bend]) => {
      if (!edge[key]) return;
      const path = svgEl("path", {
        d: curve(x1, y1, ex, ey, bend),
        fill: "none",
        stroke: color,
        "stroke-width": String(0.8 + 2.4 * (edge[key] / maxIn)),
        "stroke-opacity": "0.85",
        "marker-end": `url(#${marker})`,
      });
      const title = svgEl("title", {});
      title.textContent = `${edge.rt} RT, ${edge.qt} quotes, ${edge.rp} replies`;
      path.appendChild(title);
      svg.appendChild(path);
    });
  });

  nodes.forEach((node) => {
    const adop = size.get(node.id) || 0;
    const hollow = !node.origin && !(incoming.get(node.id) > 0);
    const radius = adop > 0 ? 8 + 15 * Math.sqrt(adop / maxAd) : 7;
    const cx = xOf(node.first);
    const cy = yOf.get(node.id);
    const circle = svgEl("circle", {
      cx, cy, r: radius,
      fill: hollow ? PAL.paper : node.color,
      stroke: node.origin ? PAL.ink : node.color,
      "stroke-width": node.origin ? 2.5 : 1.4,
    });
    const bag = internal.get(node.id);
    const title = svgEl("title", {});
    title.textContent = `${node.name} · ${adop} adoptants` + (bag ? ` · interne RT ${bag.rt}, quotes ${bag.qt}, replies ${bag.rp}` : "");
    circle.appendChild(title);
    svg.appendChild(circle);
    const label = svgEl("text", { x: 8, y: cy - 2, "font-size": "12", fill: PAL.ink });
    label.textContent = node.name.length > 24 ? node.name.slice(0, 23) + "…" : node.name;
    svg.appendChild(label);
    const sub = svgEl("text", { x: 8, y: cy + 13, "font-size": "11", fill: PAL.muted });
    sub.textContent = `${adop} adopt.`;
    svg.appendChild(sub);
  });

  const note = document.getElementById("netnote");
  const bits = [];
  if (!nodes.length) bits.push("Aucun milieu n'est encore apparu à cette date.");
  if (cross) bits.push(`${cross.toLocaleString("fr-FR")} liens documentés relient des milieux regroupés dans « Autres milieux » et ne sont pas dessinés.`);
  note.textContent = bits.join(" ");

  drawCumul(row, dayMax);
  drawBars(row, dayMax);
}

function drawCumul(row, dayMax) {
  const svg = document.getElementById("cumul");
  svg.replaceChildren();
  const ad = cum(row.series.new_ad);
  const mil = cum(row.series.new_milieu);
  const n = ad.length;
  const maxAd = Math.max(1, ad[n - 1] || 0);
  const maxMil = Math.max(1, mil[n - 1] || 0);
  const x = (i) => 36 + (590 * i) / Math.max(1, n - 1);
  const yAd = (v) => 118 - (96 * v) / maxAd;
  const yMil = (v) => 118 - (96 * v) / maxMil;
  const axis = svgEl("line", { x1: 36, y1: 118, x2: 626, y2: 118, stroke: PAL.line });
  svg.appendChild(axis);
  const cursor = svgEl("line", { x1: x(dayMax), y1: 16, x2: x(dayMax), y2: 118, stroke: PAL.ink, "stroke-dasharray": "3 3" });
  svg.appendChild(cursor);
  const line = (series, yFn, color) => {
    const d = series.map((value, i) => `${i ? "L" : "M"} ${x(i)} ${yFn(value)}`).join(" ");
    svg.appendChild(svgEl("path", { d, fill: "none", stroke: color, "stroke-width": "2" }));
  };
  line(ad, yAd, PAL.rt);
  line(mil, yMil, PAL.qt);
  const caption = svgEl("text", { x: 36, y: 14, "font-size": "12", fill: PAL.muted });
  caption.textContent = `Adoptants cumulés ${ad[n - 1]} · milieux cumulés ${mil[n - 1]}`;
  svg.appendChild(caption);
  const a = svgEl("text", { x: 36, y: 136, "font-size": "11", fill: PAL.rt });
  a.textContent = "adoptants";
  const b = svgEl("text", { x: 110, y: 136, "font-size": "11", fill: PAL.qt });
  b.textContent = "milieux";
  svg.appendChild(a);
  svg.appendChild(b);
}

function drawBars(row, dayMax) {
  const svg = document.getElementById("bars");
  svg.replaceChildren();
  const n = row.series.rt.length;
  const totals = row.series.rt.map((value, i) => value + row.series.qt[i] + row.series.rp[i]);
  const max = Math.max(1, ...totals);
  const slot = 580 / Math.max(1, n);
  const x0 = 36;
  totals.forEach((total, i) => {
    let y = 112;
    [["rt", PAL.rt], ["qt", PAL.qt], ["rp", PAL.rp]].forEach(([key, color]) => {
      const value = row.series[key][i];
      if (!value) return;
      const h = (92 * value) / max;
      y -= h;
      svg.appendChild(svgEl("rect", {
        x: x0 + i * slot,
        y,
        width: Math.max(0.8, slot - 0.4),
        height: h,
        fill: color,
        opacity: i <= dayMax ? "0.95" : "0.28",
      }));
    });
  });
  svg.appendChild(svgEl("line", {
    x1: x0 + dayMax * slot, y1: 14, x2: x0 + dayMax * slot, y2: 112, stroke: PAL.ink, "stroke-dasharray": "3 3",
  }));
  const caption = svgEl("text", { x: 36, y: 132, "font-size": "11", fill: PAL.muted });
  caption.textContent = "RT, quotes et replies par jour · les jours après le curseur sont atténués";
  svg.appendChild(caption);
}

function exportCsv() {
  const cols = visibleCols();
  const header = ["url", "domaine", "cellule", "croisements", "spatial", "temporel", "influence", ...cols.map((col) => col.label)];
  const lines = [header.join(";")];
  state.view.forEach((row) => {
    const prof = row._profiles.map((id) => PROFILES.find((p) => p.id === id).label).join(", ");
    const cells = [
      row.url,
      row.host,
      cellLabel(row._cell),
      prof || "sans croisement nommé",
      String(row._score.spatial).replace(".", ","),
      String(row._score.temporal).replace(".", ","),
      String(row._score.influence).replace(".", ","),
      ...cols.map((col) => {
      const value = metric(row, col.key);
      if (value == null) return "";
      if (col.kind === "share") return String(value).replace(".", ",");
      if (typeof value === "number") return String(value).replace(".", ",");
      return String(value);
    }),
    ];
    lines.push(cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"));
  });
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "hmpv_diffusion_url.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function boot() {
  if (!DATA || !DATA.urls) {
    document.getElementById("lede").textContent = "Les indicateurs ne sont pas chargés. Relancer build_url_diffusion.py.";
    return;
  }
  annotateAll();
  const meta = DATA.meta;
  document.getElementById("lede").textContent =
    `HMPV fusionné · ${meta.window[0]} – ${meta.window[1]} · ${meta.posts.toLocaleString("fr-FR")} messages · ${meta.analyzed.toLocaleString("fr-FR")} ressources au tableau sur ${meta.resources.toLocaleString("fr-FR")} URL externes.`;
  const body = document.getElementById("methodBody");
  body.innerHTML = meta.method.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
  const columns = `${defsHtml(COLS)}<h3>Indicateurs lus sur la fiche</h3>${defsHtml(FICHE)}<p>La couleur de la heatmap reste un rang ou un min–max parmi les URL affichées. Elle ne sert pas à la typologie.</p>`;
  document.getElementById("glossBody").innerHTML = columns;
  document.getElementById("methodCols").innerHTML = columns;
  document.getElementById("profileRules").innerHTML = `
    <p>Trois axes continus, normalisés par rapport au corpus des ${REF.n.toLocaleString("fr-FR")} URL : spatial (adoptants, milieux), temporel (demi-vie, réactivations), influence (volume RT + quotes + replies). Pour chaque variable, la médiane du corpus vaut 0,5 et le seuil haut max(2 × médiane, 3e quartile) vaut 1.</p>
    <h3>Niveaux exhaustifs</h3>
    <ul>
      <li><b>Spatial.</b> Restreint si adoptants ≤ médiane et milieux ≤ médiane. Large si adoptants ≥ seuil haut ou milieux ≥ seuil haut. Sinon moyen.</li>
      <li><b>Temporel.</b> Bref si demi-vie ≤ médiane et aucune réactivation. Persistant si au moins une réactivation ou demi-vie ≥ seuil haut. Sinon soutenu.</li>
      <li><b>Influence.</b> Faible si le volume d'actes ≤ médiane. Sinon conversation si quotes+replies ≥ 35 % des actes, RT si les RT dominent, mixte si les deux parts dépassent leurs seuils.</li>
    </ul>
    <p>Chaque URL appartient à exactement une cellule spatial × temporel × influence.</p>
    <h3>Croisements nommés</h3>
    <ul>
      <li><b>Virale locale.</b> Influence RT ou mixte, spatial moyen ou large, temporel non persistant, part RT ≥ 50 %, 1er milieu ≥ 35 % des adoptants.</li>
      <li><b>Transcommunautaire.</b> Spatial large et milieux ≥ max(3, seuil haut des milieux).</li>
      <li><b>Conversationnelle.</b> Influence conversation ou mixte.</li>
      <li><b>Persistante.</b> Temporel persistant.</li>
      <li><b>Ponctuelle.</b> Spatial restreint, temporel bref, influence faible.</li>
    </ul>
    <p>Ces croisements peuvent se cumuler. Une URL sans croisement nommé reste visible dans le nuage 3D via sa cellule.</p>`;
  const maxAd = DATA.urls.reduce((max, row) => Math.max(max, row.adopters || 0), 0);
  const slider = document.getElementById("minAd");
  slider.max = String(Math.max(10, maxAd));
  document.getElementById("minAdLab").textContent = "0";
  document.getElementById("q").addEventListener("input", (event) => {
    state.q = event.target.value;
    render();
  });
  slider.addEventListener("input", () => {
    state.minAd = Number(slider.value);
    document.getElementById("minAdLab").textContent = state.minAd.toLocaleString("fr-FR");
    render();
  });
  document.getElementById("profileChips").addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile]");
    if (!button) return;
    const id = button.dataset.profile;
    if (state.profiles.has(id)) state.profiles.delete(id);
    else state.profiles.add(id);
    render();
  });
  document.getElementById("modeBtn").addEventListener("click", () => {
    state.mode = state.mode === "rank" ? "minmax" : "rank";
    document.getElementById("modeBtn").textContent = state.mode === "rank" ? "Rang" : "Min–max";
    render();
  });
  document.getElementById("sheet").addEventListener("click", (event) => {
    const th = event.target.closest("th[data-key]");
    if (th) {
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = -1; }
      render();
      return;
    }
    const tr = event.target.closest("tr[data-i]");
    if (!tr) return;
    const row = state.view[Number(tr.dataset.i)];
    state.selected = row.url;
    state.day = row.series.new_ad.length - 1;
    render();
  });
  document.getElementById("methodBtn").addEventListener("click", () => document.getElementById("method").showModal());
  document.getElementById("exportBtn").addEventListener("click", exportCsv);
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = state.view.findIndex((row) => row.url === state.selected);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    if (!state.view[next]) return;
    state.selected = state.view[next].url;
    state.day = state.view[next].series.new_ad.length - 1;
    render();
    document.querySelector(`tr[data-i="${next}"]`)?.scrollIntoView({ block: "nearest" });
  });
  render();
}

boot();
