/* ═══════════════════════════════════════════════════════════════════════════
   Thailand Fruit Guide — app.js
   Vanilla JS. No frameworks. No dependencies.
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NOW_MONTH = new Date().getMonth() + 1; // 1-based
const NOW_DATE  = new Date();

// Flavor adjacency map for "Similar Fruits" (shared primary flavors or season)
const FLAVOR_GROUPS = {
  sweet:   ['mango','lychee','mangosteen','longan','banana','rambutan','custard-apple','sapodilla','watermelon'],
  sour:    ['tamarind','green-mango','starfruit','santol','salak'],
  creamy:  ['durian','custard-apple','sapodilla','coconut'],
  mild:    ['rose-apple','dragon-fruit','guava','coconut','papaya'],
  cluster: ['longan','lychee','rambutan','langsat'],
};

// ─── State ───────────────────────────────────────────────────────────────────

let FRUITS = [];
let MANIFEST = {};

const state = {
  search: '',
  months: [],
  flavor: [],
  sweetness: 0,
  smell: [],
  difficulty: [],
  where: [],
  tags: [],
  sort: 'default',
  openSlug: null,
};

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  try {
    const [fruitsRes, manifestRes] = await Promise.allSettled([
      fetch('data/fruits.json').then(r => r.json()),
      fetch('images/manifest.json').then(r => r.json()),
    ]);

    FRUITS   = fruitsRes.status   === 'fulfilled' ? fruitsRes.value   : [];
    MANIFEST = manifestRes.status === 'fulfilled' ? manifestRes.value : {};
  } catch (e) {
    console.warn('Data load error:', e);
    FRUITS = [];
    MANIFEST = {};
  }

  buildMonthGrid();
  applyUrlState();
  render();
  bindEvents();
  updateSeasonBadge();
  updateSeasonCount();
}

// ─── URL State ────────────────────────────────────────────────────────────────

function applyUrlState() {
  const p = new URLSearchParams(location.search);
  if (p.get('q'))         state.search     = p.get('q');
  if (p.get('months'))    state.months     = p.get('months').split(',').map(Number).filter(Boolean);
  if (p.get('flavor'))    state.flavor     = p.get('flavor').split(',').filter(Boolean);
  if (p.get('sweetness')) state.sweetness  = Number(p.get('sweetness'));
  if (p.get('smell'))     state.smell      = p.get('smell').split(',').map(Number).filter(Boolean);
  if (p.get('difficulty'))state.difficulty = p.get('difficulty').split(',').map(Number).filter(Boolean);
  if (p.get('where'))     state.where      = p.get('where').split(',').filter(Boolean);
  if (p.get('tags'))      state.tags       = p.get('tags').split(',').filter(Boolean);
  if (p.get('sort'))      state.sort       = p.get('sort');
  if (p.get('open'))      state.openSlug   = p.get('open');

  // Sync inputs
  const s = document.getElementById('search');
  if (s) s.value = state.search;
  const sl = document.getElementById('sweetness-slider');
  if (sl) sl.value = state.sweetness;
  updateSliderLabel();
  const so = document.getElementById('sort-select');
  if (so) so.value = state.sort;
}

function saveUrlState() {
  const p = new URLSearchParams();
  if (state.search)        p.set('q',          state.search);
  if (state.months.length) p.set('months',     state.months.join(','));
  if (state.flavor.length) p.set('flavor',     state.flavor.join(','));
  if (state.sweetness > 0) p.set('sweetness',  state.sweetness);
  if (state.smell.length)  p.set('smell',      state.smell.join(','));
  if (state.difficulty.length) p.set('difficulty', state.difficulty.join(','));
  if (state.where.length)  p.set('where',      state.where.join(','));
  if (state.tags.length)   p.set('tags',       state.tags.join(','));
  if (state.sort !== 'default') p.set('sort',  state.sort);
  if (state.openSlug)      p.set('open',       state.openSlug);

  const url = p.toString() ? `?${p}` : location.pathname;
  history.replaceState(null, '', url);
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────

function fruitMatchesState(fruit) {
  // Search
  if (state.search) {
    const q = state.search.toLowerCase();
    const haystack = [
      fruit.name_en, fruit.name_th, fruit.name_th_roman,
      fruit.slug, ...(fruit.tags || []),
      ...(fruit.flavor_profile?.primary || []),
    ].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  // Month filter
  if (state.months.length) {
    const avail = fruit.seasonality?.available_months || [];
    if (!state.months.some(m => avail.includes(m))) return false;
  }

  // Flavor
  if (state.flavor.length) {
    const primaries = (fruit.flavor_profile?.primary || []).map(s => s.toLowerCase());
    const secondaries = (fruit.flavor_profile?.secondary || []).map(s => s.toLowerCase());
    const allFlavors = [...primaries, ...secondaries].join(' ');
    const flavMap = { sweet: 'sweet', sour: 'sour', bitter: 'bitter', aromatic: 'floral', mild: 'mild' };
    if (!state.flavor.some(f => allFlavors.includes(flavMap[f] || f))) return false;
  }

  // Sweetness
  if (state.sweetness > 0) {
    if ((fruit.flavor_profile?.sweetness || 0) < state.sweetness) return false;
  }

  // Smell (max smell_intensity match)
  if (state.smell.length) {
    if (!state.smell.includes(fruit.smell_intensity)) return false;
  }

  // Difficulty
  if (state.difficulty.length) {
    if (!state.difficulty.includes(fruit.difficulty_to_eat)) return false;
  }

  // Where
  if (state.where.length) {
    const wb = fruit.where_to_buy || {};
    if (state.where.includes('street_vendor') && !wb.street_vendor) return false;
    if (state.where.includes('supermarket') && !wb.supermarket) return false;
  }

  // Tags
  if (state.tags.length) {
    const fruitTags = fruit.tags || [];
    if (!state.tags.some(t => fruitTags.includes(t))) return false;
  }

  return true;
}

function sortedFruits(filtered) {
  const list = [...filtered];
  switch (state.sort) {
    case 'alpha':
      list.sort((a, b) => a.name_en.localeCompare(b.name_en));
      break;
    case 'sweetness-desc':
      list.sort((a, b) => (b.flavor_profile?.sweetness || 0) - (a.flavor_profile?.sweetness || 0));
      break;
    case 'smell-desc':
      list.sort((a, b) => (b.smell_intensity || 0) - (a.smell_intensity || 0));
      break;
    case 'season-start':
      list.sort((a, b) => {
        const am = a.seasonality?.available_months?.[0] || 13;
        const bm = b.seasonality?.available_months?.[0] || 13;
        return am - bm;
      });
      break;
    case 'difficulty':
      list.sort((a, b) => (a.difficulty_to_eat || 1) - (b.difficulty_to_eat || 1));
      break;
    default:
      // In-season first, then default order
      list.sort((a, b) => {
        const aIn = isInSeason(a) ? -1 : 0;
        const bIn = isInSeason(b) ? -1 : 0;
        return aIn - bIn;
      });
  }
  return list;
}

function isInSeason(fruit) {
  return (fruit.seasonality?.available_months || []).includes(NOW_MONTH);
}

function isPeak(fruit) {
  return (fruit.seasonality?.peak_months || []).includes(NOW_MONTH);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const filtered = FRUITS.filter(fruitMatchesState);
  const sorted   = sortedFruits(filtered);

  renderGrid(sorted);
  updateFilterUI();
  updateResultsCount(sorted.length);
  syncPillActive();
  saveUrlState();

  if (state.openSlug) {
    const fruit = FRUITS.find(f => f.slug === state.openSlug);
    if (fruit) openDetail(fruit, false);
  }
}

function renderGrid(fruits) {
  const grid    = document.getElementById('fruit-grid');
  const noRes   = document.getElementById('no-results');

  grid.innerHTML = '';

  if (fruits.length === 0) {
    noRes.hidden = false;
    return;
  }
  noRes.hidden = true;

  // First in-season fruit gets featured treatment
  let featuredSet = false;

  fruits.forEach((fruit, i) => {
    const isFeatured = !featuredSet && isInSeason(fruit) && state.search === '' && state.months.length === 0;
    if (isFeatured) featuredSet = true;

    const card = buildCard(fruit, isFeatured);
    grid.appendChild(card);
  });

  // Setup lazy loading after cards are in DOM
  setupLazyImages();
}

function buildCard(fruit, featured) {
  const manifest = MANIFEST[fruit.slug] || {};
  const thumbs   = manifest.thumbs || [];
  const imgSrc   = thumbs[0] || '';

  const inSeason = isInSeason(fruit);
  const peak     = isPeak(fruit);
  const highSmell = fruit.smell_intensity >= 4;

  const card = document.createElement('article');
  card.className = 'fruit-card' + (featured ? ' featured' : '');
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${fruit.name_en} — click for details`);
  card.dataset.slug = fruit.slug;

  // Season bar html
  const seasonBar = MONTHS.map((_, idx) => {
    const m = idx + 1;
    const avail = (fruit.seasonality?.available_months || []).includes(m);
    const pk    = (fruit.seasonality?.peak_months     || []).includes(m);
    const cur   = m === NOW_MONTH;
    const cls = pk ? 'peak' : avail ? 'active' : '';
    return `<div class="season-seg ${cls} ${cur ? 'current' : ''}" title="${MONTHS[idx]}"></div>`;
  }).join('');

  // Dots
  const sweetnessHtml = dots(fruit.flavor_profile?.sweetness || 0, 5, 'sweet');
  const sourHtml      = dots(fruit.flavor_profile?.sourness  || 0, 5, 'sour');

  // Tags for card
  const tagHtml = (fruit.tags || []).slice(0, 2).map(t =>
    `<span class="meta-tag">${t}</span>`
  ).join('');

  card.innerHTML = `
    <div class="card-img-wrap">
      ${imgSrc ? `
        <div class="img-skeleton"></div>
        <img class="card-img" data-src="${imgSrc}" alt="${fruit.name_en}" loading="lazy" />
      ` : `
        <div class="detail-placeholder-img">${fruitEmoji(fruit.slug)}</div>
      `}
      ${inSeason ? '<div class="card-in-season">In Season</div>' : ''}
      ${highSmell ? '<div class="card-smell-warning">Strong smell</div>' : ''}
    </div>
    <div class="card-body">
      <div>
        <div class="card-name-en">${fruit.name_en}</div>
        <div class="card-name-th">${fruit.name_th} · ${fruit.name_th_roman}</div>
      </div>
      <div class="intensity-row">
        <div class="dot-group">
          <span class="dot-label">Sweet</span>
          ${sweetnessHtml}
        </div>
        <div class="dot-group">
          <span class="dot-label">Sour</span>
          ${sourHtml}
        </div>
      </div>
      <div class="card-season-bar" title="12-month availability">${seasonBar}</div>
      <div class="card-meta">
        ${inSeason ? '<span class="meta-tag tag-season">In season</span>' : ''}
        ${fruit.year_round ? '<span class="meta-tag tag-season">Year-round</span>' : ''}
        ${highSmell ? '<span class="meta-tag tag-smell">Aromatic</span>' : ''}
        ${tagHtml}
      </div>
    </div>
  `;

  card.addEventListener('click', () => openDetail(fruit));
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(fruit); } });

  return card;
}

function dots(val, max, type) {
  return Array.from({ length: max }, (_, i) =>
    `<div class="dot ${i < val ? `filled-${type}` : ''}"></div>`
  ).join('');
}

function fruitEmoji(slug) {
  const map = {
    mango: '🥭', mangosteen: '🟣', rambutan: '🔴', durian: '🌵',
    longan: '🟤', lychee: '🔴', papaya: '🍈', pineapple: '🍍',
    'dragon-fruit': '🐉', jackfruit: '🟡', pomelo: '🍊', 'rose-apple': '🌸',
    tamarind: '🟫', starfruit: '⭐', santol: '🟠', guava: '🍏',
    salak: '🐍', langsat: '🟡', banana: '🍌', coconut: '🥥',
    sapodilla: '🟫', 'custard-apple': '💚', pomegranate: '❤️',
    watermelon: '🍉', 'green-mango': '💚',
  };
  return map[slug] || '🍑';
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function openDetail(fruit, pushState = true) {
  state.openSlug = fruit.slug;
  if (pushState) saveUrlState();

  const overlay = document.getElementById('detail-overlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  populateDetail(fruit);

  // Focus trap
  const panel = document.getElementById('detail-panel');
  const closeBtn = document.getElementById('detail-close');
  closeBtn.focus();

  panel._focusTrap = trapFocus(panel);
}

function closeDetail() {
  const overlay = document.getElementById('detail-overlay');
  overlay.hidden = true;
  document.body.style.overflow = '';
  state.openSlug = null;
  const panel = document.getElementById('detail-panel');
  if (panel._focusTrap) { document.removeEventListener('keydown', panel._focusTrap); panel._focusTrap = null; }
  saveUrlState();
}

function populateDetail(fruit) {
  const manifest = MANIFEST[fruit.slug] || {};
  const processed = manifest.processed || [];
  const thumbs    = manifest.thumbs    || [];

  // Hero image
  const heroImg = document.getElementById('detail-hero-img');
  if (processed[0]) {
    heroImg.src = processed[0];
    heroImg.alt = fruit.name_en;
    heroImg.parentElement.innerHTML = `<img class="detail-hero-img" id="detail-hero-img" src="${processed[0]}" alt="${fruit.name_en}" loading="lazy" />`;
  } else {
    heroImg.parentElement.innerHTML = `<div class="detail-placeholder-img" style="font-size:72px">${fruitEmoji(fruit.slug)}</div>`;
  }

  // Thumb strip
  const strip = document.getElementById('detail-img-strip');
  strip.innerHTML = '';
  if (processed.length > 1) {
    processed.forEach((src, i) => {
      const img = document.createElement('img');
      img.className = 'strip-thumb' + (i === 0 ? ' active' : '');
      img.src = thumbs[i] || src;
      img.alt = `${fruit.name_en} photo ${i+1}`;
      img.loading = 'lazy';
      img.addEventListener('click', () => {
        document.getElementById('detail-hero-img')
          ? (document.getElementById('detail-hero-img').src = src)
          : null;
        strip.querySelectorAll('.strip-thumb').forEach(t => t.classList.remove('active'));
        img.classList.add('active');
      });
      strip.appendChild(img);
    });
  }

  // Names
  document.getElementById('detail-name').textContent       = fruit.name_en;
  document.getElementById('detail-name-th').textContent    = fruit.name_th;
  document.getElementById('detail-name-roman').textContent = `"${fruit.name_th_roman}"`;

  // Season badge
  const seasonBadge = document.getElementById('detail-season-badge');
  if (isPeak(fruit)) {
    seasonBadge.textContent = 'Peak Season Now';
    seasonBadge.style.background = 'rgba(74,222,128,0.12)';
    seasonBadge.style.border = '1px solid rgba(74,222,128,0.3)';
    seasonBadge.style.color = '#4ade80';
  } else if (isInSeason(fruit)) {
    seasonBadge.textContent = 'In Season Now';
    seasonBadge.style.background = 'rgba(74,222,128,0.08)';
    seasonBadge.style.border = '1px solid rgba(74,222,128,0.2)';
    seasonBadge.style.color = '#4ade80';
  } else {
    seasonBadge.textContent = 'Out of Season';
    seasonBadge.style.background = 'rgba(255,255,255,0.04)';
    seasonBadge.style.border = '1px solid rgba(255,255,255,0.08)';
    seasonBadge.style.color = '#888';
  }

  // Smell badge
  const smellBadge = document.getElementById('detail-smell-badge');
  const smellLabels = { 1: 'Mild aroma', 2: 'Moderate aroma', 3: 'Strong aroma', 4: 'Very strong', 5: 'Extreme smell ⚠' };
  smellBadge.textContent = smellLabels[fruit.smell_intensity] || '';
  smellBadge.style.display = fruit.smell_intensity >= 3 ? '' : 'none';

  // Flavor dots
  renderFlavDots('flavor-sweetness', fruit.flavor_profile?.sweetness, 5, 'sweet');
  renderFlavDots('flavor-sourness',  fruit.flavor_profile?.sourness,  5, 'sour');
  renderFlavDots('flavor-intensity', fruit.flavor_profile?.intensity, 5, 'intensity');
  renderFlavDots('flavor-smell',     fruit.smell_intensity,           5, 'smell');

  document.getElementById('flavor-texture-text').textContent = fruit.flavor_profile?.texture || '';

  // Flavor tags
  const tagsRow = document.getElementById('flavor-tags-row');
  tagsRow.innerHTML = (fruit.flavor_profile?.primary || []).concat(fruit.flavor_profile?.secondary || []).slice(0, 5).map(
    t => `<span class="flavor-tag">${t}</span>`
  ).join('');

  // Radar chart
  buildRadar(fruit);

  // Season chart
  buildSeasonChart(fruit);

  // Regions
  const regionsEl = document.getElementById('season-regions');
  regionsEl.innerHTML = `
    <div class="region-item">
      <div class="region-label">North Thailand</div>
      <div class="region-value">${fruit.seasonality?.north_thailand || 'Data unavailable'}</div>
    </div>
    <div class="region-item">
      <div class="region-label">South Thailand</div>
      <div class="region-value">${fruit.seasonality?.south_thailand || 'Data unavailable'}</div>
    </div>
  `;

  // How to eat
  const howList = document.getElementById('how-to-list');
  howList.innerHTML = (fruit.how_to_eat || []).map(step =>
    `<li><span>${step}</span></li>`
  ).join('');

  // Where to buy
  const wb = fruit.where_to_buy || {};
  document.getElementById('buy-info').innerHTML = `
    <div class="buy-item">
      <div class="buy-item-label">Price range</div>
      <div class="buy-item-value">${wb.price_range_baht || '—'}</div>
    </div>
    <div class="buy-item">
      <div class="buy-item-label">Where</div>
      <div class="buy-item-value">
        <div class="buy-avail"><span class="avail-dot ${wb.street_vendor ? 'yes' : 'no'}"></span>Street vendor</div>
        <div class="buy-avail"><span class="avail-dot ${wb.supermarket ? 'yes' : 'no'}"></span>Supermarket</div>
      </div>
    </div>
    <div class="buy-item buy-notes">
      <div class="buy-item-label">Notes</div>
      <div class="buy-item-value">${wb.notes || wb.markets || '—'}</div>
    </div>
  `;

  // Traveler tip
  document.getElementById('traveler-tip').textContent = fruit.traveler_tips || '';

  // Varieties
  const varList = document.getElementById('varieties-list');
  varList.innerHTML = (fruit.common_varieties || []).map(v =>
    `<span class="variety-tag">${v}</span>`
  ).join('');
  document.getElementById('varieties-section').hidden = !fruit.common_varieties?.length;

  // Similar fruits
  buildSimilar(fruit);

  // Scroll to top of panel
  document.getElementById('detail-panel').scrollTop = 0;
}

function renderFlavDots(elId, val, max, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = Array.from({ length: max }, (_, i) =>
    `<div class="fdot ${i < (val || 0) ? `on-${type}` : ''}"></div>`
  ).join('');
}

function buildRadar(fruit) {
  const fp = fruit.flavor_profile || {};
  const sm = fruit.smell_intensity || 1;
  const diff = fruit.difficulty_to_eat || 1;

  // 5 axes: Sweetness, Sourness, Intensity, Smell, Difficulty
  const axes = [
    { label: 'Sweet',     value: (fp.sweetness  || 0) / 5 },
    { label: 'Sour',      value: (fp.sourness   || 0) / 5 },
    { label: 'Intensity', value: (fp.intensity  || 0) / 5 },
    { label: 'Smell',     value: sm / 5 },
    { label: 'Difficulty',value: diff / 3 },
  ];

  const n = axes.length;
  const cx = 100, cy = 100, r = 70;
  const svgEl = document.getElementById('radar-chart');

  const angleStep = (2 * Math.PI) / n;
  const offset    = -Math.PI / 2;

  function pt(radius, idx) {
    const a = offset + idx * angleStep;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  let svgContent = '';

  // Background rings (5 levels)
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(t => {
    const pts = axes.map((_, i) => pt(r * t, i));
    const d   = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
    svgContent += `<path class="radar-bg-hex" d="${d}" />`;
  });

  // Spokes
  axes.forEach((_, i) => {
    const p = pt(r, i);
    svgContent += `<line class="radar-spoke" x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" />`;
  });

  // Data area
  const dataPoints = axes.map((axis, i) => pt(r * axis.value, i));
  const dataPoly = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  svgContent += `<path class="radar-area" d="${dataPoly}" />`;

  // Data dots
  dataPoints.forEach(p => {
    svgContent += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--accent-primary)" />`;
  });

  // Labels
  axes.forEach((axis, i) => {
    const p  = pt(r + 16, i);
    const ta = p.x < cx - 2 ? 'end' : p.x > cx + 2 ? 'start' : 'middle';
    svgContent += `<text class="radar-label" x="${p.x.toFixed(1)}" y="${(p.y + 3).toFixed(1)}" text-anchor="${ta}">${axis.label}</text>`;
  });

  svgEl.innerHTML = svgContent;
}

function buildSeasonChart(fruit) {
  const avail = fruit.seasonality?.available_months || [];
  const peak  = fruit.seasonality?.peak_months     || [];

  const el = document.getElementById('season-chart');
  el.innerHTML = MONTHS.map((m, idx) => {
    const mo  = idx + 1;
    const isA = avail.includes(mo);
    const isP = peak.includes(mo);
    const isCur = mo === NOW_MONTH;
    const cls = isP ? 'peak' : isA ? 'available' : 'none';
    return `
      <div class="season-bar" title="${m}: ${isP ? 'Peak' : isA ? 'Available' : 'Not available'}">
        <div class="season-bar-fill ${cls} ${isCur ? 'current' : ''}"></div>
        <div class="season-bar-label">${m}</div>
      </div>`;
  }).join('');
}

function buildSimilar(fruit) {
  const el = document.getElementById('similar-fruits');
  const matches = new Set();

  // Find shared flavor group members
  Object.values(FLAVOR_GROUPS).forEach(group => {
    if (group.includes(fruit.slug)) {
      group.forEach(slug => { if (slug !== fruit.slug) matches.add(slug); });
    }
  });

  // Find same season
  const availMonths = fruit.seasonality?.available_months || [];
  FRUITS.forEach(f => {
    if (f.slug === fruit.slug) return;
    const sharedMonths = (f.seasonality?.available_months || []).filter(m => availMonths.includes(m));
    if (sharedMonths.length >= 2) matches.add(f.slug);
  });

  const similarFruits = [...matches]
    .map(slug => FRUITS.find(f => f.slug === slug))
    .filter(Boolean)
    .slice(0, 4);

  if (similarFruits.length === 0) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">No similar fruits found.</p>';
    return;
  }

  el.innerHTML = similarFruits.map(f => `
    <div class="similar-card" data-slug="${f.slug}" tabindex="0" role="button" aria-label="View ${f.name_en}">
      <div class="similar-name">${f.name_en}</div>
      <div class="similar-th">${f.name_th}</div>
    </div>
  `).join('');

  el.querySelectorAll('.similar-card').forEach(card => {
    const navigate = () => {
      const f = FRUITS.find(fr => fr.slug === card.dataset.slug);
      if (f) populateDetail(f);
    };
    card.addEventListener('click', navigate);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(); } });
  });
}

// ─── Season Badge / Count ─────────────────────────────────────────────────────

function updateSeasonBadge() {
  const badge = document.getElementById('season-badge');
  if (!badge) return;
  badge.textContent = `${MONTHS[NOW_MONTH - 1]} Season`;
}

function updateSeasonCount() {
  const count = FRUITS.filter(isInSeason).length;
  const el = document.getElementById('in-season-count');
  if (el) el.textContent = count;
}

// ─── Month Grid ───────────────────────────────────────────────────────────────

function buildMonthGrid() {
  const grid = document.getElementById('month-grid');
  if (!grid) return;

  MONTHS.forEach((m, idx) => {
    const mo = idx + 1;
    const btn = document.createElement('button');
    btn.className = 'month-btn' + (mo === NOW_MONTH ? ' current-month' : '');
    btn.textContent = m.slice(0, 1);
    btn.title = m;
    btn.type = 'button';
    btn.dataset.month = mo;
    if (state.months.includes(mo)) btn.classList.add('active');
    btn.addEventListener('click', () => toggleMonth(mo, btn));
    grid.appendChild(btn);
  });
}

function toggleMonth(mo, btn) {
  const idx = state.months.indexOf(mo);
  if (idx === -1) { state.months.push(mo); btn.classList.add('active'); }
  else { state.months.splice(idx, 1); btn.classList.remove('active'); }
  render();
}

// ─── Filter UI helpers ────────────────────────────────────────────────────────

function countActiveFilters() {
  return (
    (state.search ? 1 : 0) +
    state.months.length +
    state.flavor.length +
    (state.sweetness > 0 ? 1 : 0) +
    state.smell.length +
    state.difficulty.length +
    state.where.length +
    state.tags.length
  );
}

function updateFilterUI() {
  const count = countActiveFilters();
  const badge = document.getElementById('active-badge');
  const mob   = document.getElementById('mobile-filter-badge');
  if (badge) {
    badge.textContent = count || '';
    badge.classList.toggle('visible', count > 0);
  }
  if (mob) {
    mob.textContent = count || '';
    mob.classList.toggle('visible', count > 0);
  }
}

function updateResultsCount(n) {
  const el = document.getElementById('visible-count');
  if (el) el.textContent = n;
}

function syncPillActive() {
  document.querySelectorAll('[data-filter]').forEach(btn => {
    const filter = btn.dataset.filter;
    const value  = btn.dataset.value;
    let active = false;

    if (filter === 'flavor')     active = state.flavor.includes(value);
    if (filter === 'smell')      active = state.smell.includes(Number(value));
    if (filter === 'difficulty') active = state.difficulty.includes(Number(value));
    if (filter === 'where')      active = state.where.includes(value);
    if (filter === 'tag')        active = state.tags.includes(value);

    btn.classList.toggle('active', active);
  });

  // Slider
  const sl = document.getElementById('sweetness-slider');
  if (sl) sl.value = state.sweetness;
  updateSliderLabel();
}

function updateSliderLabel() {
  const val = document.getElementById('sweetness-val');
  if (val) val.textContent = state.sweetness === 0 ? 'Any' : state.sweetness;
}

function clearAll() {
  state.search     = '';
  state.months     = [];
  state.flavor     = [];
  state.sweetness  = 0;
  state.smell      = [];
  state.difficulty = [];
  state.where      = [];
  state.tags       = [];

  const searchEl = document.getElementById('search');
  if (searchEl) searchEl.value = '';

  const slider = document.getElementById('sweetness-slider');
  if (slider) slider.value = 0;

  document.querySelectorAll('.month-btn').forEach(btn => btn.classList.remove('active'));

  render();
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function bindEvents() {
  // Search
  const searchEl = document.getElementById('search');
  if (searchEl) {
    searchEl.addEventListener('input', e => {
      state.search = e.target.value.trim();
      render();
    });
  }

  // Pills (flavor, smell, difficulty, where, tags)
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      const value  = btn.dataset.value;

      const toggleStr = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
      const toggleNum = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

      if (filter === 'flavor')     state.flavor     = toggleStr(state.flavor,     value);
      if (filter === 'smell')      state.smell      = toggleNum(state.smell,      Number(value));
      if (filter === 'difficulty') state.difficulty = toggleNum(state.difficulty, Number(value));
      if (filter === 'where')      state.where      = toggleStr(state.where,      value);
      if (filter === 'tag')        state.tags       = toggleStr(state.tags,       value);

      render();
    });
  });

  // Sweetness slider
  const slider = document.getElementById('sweetness-slider');
  if (slider) {
    slider.addEventListener('input', e => {
      state.sweetness = Number(e.target.value);
      updateSliderLabel();
      render();
    });
  }

  // Sort
  const sortSel = document.getElementById('sort-select');
  if (sortSel) {
    sortSel.addEventListener('change', e => {
      state.sort = e.target.value;
      render();
    });
  }

  // Clear all
  const clearBtn = document.getElementById('clear-all');
  if (clearBtn) clearBtn.addEventListener('click', clearAll);

  const noResClear = document.getElementById('no-results-clear');
  if (noResClear) noResClear.addEventListener('click', clearAll);

  // Detail close
  const detailClose = document.getElementById('detail-close');
  if (detailClose) detailClose.addEventListener('click', closeDetail);

  const overlay = document.getElementById('detail-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeDetail();
    });
  }

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.openSlug) { closeDetail(); return; }
      const dn = document.getElementById('design-notes-panel');
      if (dn && !dn.hidden) { closeDN(); return; }
    }
  });

  // Design Notes
  const dnBtn   = document.getElementById('design-notes-btn');
  const dnPanel = document.getElementById('design-notes-panel');
  const dnClose = document.getElementById('design-notes-close');

  if (dnBtn && dnPanel) {
    dnBtn.addEventListener('click', () => {
      const open = dnPanel.hidden;
      dnPanel.hidden = !open;
      dnBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  if (dnClose) dnClose.addEventListener('click', closeDN);

  function closeDN() {
    if (dnPanel) dnPanel.hidden = true;
    if (dnBtn)   dnBtn.setAttribute('aria-expanded', 'false');
  }

  // Mobile filter
  const mobileBtn = document.getElementById('mobile-filter-btn');
  const sidebar   = document.getElementById('sidebar');
  const backdrop  = document.getElementById('sidebar-backdrop');

  if (mobileBtn && sidebar && backdrop) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
    });

    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.hidden = true;
      document.body.style.overflow = '';
    });
  }
}

// ─── Lazy Image Loading ───────────────────────────────────────────────────────

function setupLazyImages() {
  const imgs = document.querySelectorAll('img[data-src]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          img.addEventListener('load', () => {
            img.classList.add('loaded');
            const skel = img.previousElementSibling;
            if (skel && skel.classList.contains('img-skeleton')) {
              skel.style.display = 'none';
            }
          });
          img.addEventListener('error', () => {
            img.style.display = 'none';
          });
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });

    imgs.forEach(img => io.observe(img));
  } else {
    // Fallback: load all immediately
    imgs.forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      img.classList.add('loaded');
    });
  }
}

// ─── Focus Trap ───────────────────────────────────────────────────────────────

function trapFocus(el) {
  const focusable = el.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  const handler = e => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  document.addEventListener('keydown', handler);
  return handler;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', boot);
