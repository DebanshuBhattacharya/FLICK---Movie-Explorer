/* ═══════════════════════════════════════════════════
   FLICK — script.js
   Vanilla ES6 · async/await · No frameworks
═══════════════════════════════════════════════════ */

"use strict";

/* ─────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────── */
const API_KEY = "65d8b4b8";
const API_BASE = `https://www.omdbapi.com/?apikey=${API_KEY}`;
const MAX_RECENT = 5;

/**
 * Large pool of IMDb IDs — we randomly pick subsets each load
 * so the homepage never shows the same set twice.
 */
const ALL_FEATURE_IDS = [
  "tt1375666", // Inception
  "tt0468569", // The Dark Knight
  "tt0816692", // Interstellar
  "tt0111161", // Shawshank Redemption
  "tt0137523", // Fight Club
  "tt6751668", // Parasite
  "tt4154756", // Avengers: Infinity War
  "tt0120737", // LOTR: Fellowship
  "tt0167260", // LOTR: Return of the King
  "tt0109830", // Forrest Gump
  "tt0133093", // The Matrix
  "tt1745960", // Top Gun: Maverick
  "tt9362722", // Spider-Man: No Way Home
  "tt1160419", // Dune (2021)
  "tt6966692", // Green Book
  "tt0110912", // Pulp Fiction
  "tt0076759", // Star Wars IV
  "tt0102926", // Silence of the Lambs
  "tt0317248", // City of God
  "tt0361748", // Inglourious Basterds
  "tt2096673", // Inside Out
  "tt0482571", // The Prestige
  "tt0407887", // The Departed
  "tt0993846", // The Wolf of Wall Street
  "tt2267998", // Gone Girl
];

/** Fisher-Yates shuffle */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─────────────────────────────────────────────────
   DOM CACHE
───────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const navEl          = document.querySelector(".nav");
const burger         = $("burger");
const drawer         = $("drawer");
const themeBtn       = $("themeBtn");
const themeIcon      = $("themeIcon");
const heroPoster     = $("heroPoster");
const carouselTrack  = $("carouselTrack");
const cPrev          = $("cPrev");
const cNext          = $("cNext");
const carouselDots   = $("carouselDots");
const searchInput    = $("searchInput");
const searchGo       = $("searchGo");
const searchClear    = $("searchClear");
const statusLine     = $("statusLine");
const skeletonGrid   = $("skeletonGrid");
const resultsGrid    = $("resultsGrid");
const favsGrid       = $("favsGrid");
const favsEmpty      = $("favsEmpty");
const watchLaterGrid = $("watchLaterGrid");
const watchLaterEmpty= $("watchLaterEmpty");
const clearWLBtn     = $("clearWatchLater");
const modalBackdrop  = $("modalBackdrop");
const modalBody      = $("modalBody");
const modalClose     = $("modalClose");
const backTop        = $("backTop");

/* ─────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────── */
let carouselMovies = [];
let currentSlide   = 0;
let autoTimer      = null;
let isPaused       = false;
let favs           = readJSON("flick_favs")       || [];
let watchLater     = readJSON("flick_watchlater") || [];
let recents        = readJSON("flick_recents")    || [];

/* ═══════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════ */

function hiResPoster(url) {
  if (!url || url === "N/A") return null;
  return url
    .replace(/_SX\d+/g,       "_SX1200")
    .replace(/_SY\d+/g,       "_SY1200")
    .replace(/_UX\d+/g,       "_UX1200")
    .replace(/_UY\d+/g,       "_UY1200")
    .replace(/_CR[\d,]+_/g,   "_");
}

function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function isFav(imdbID)   { return favs.some(f => f.imdbID === imdbID); }
function isWL(imdbID)    { return watchLater.some(w => w.imdbID === imdbID); }

/* ═══════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════ */

async function fetchByID(id) {
  const r = await fetch(`${API_BASE}&i=${encodeURIComponent(id)}&plot=full`);
  if (!r.ok) throw new Error("Network error");
  const d = await r.json();
  if (d.Response === "False") throw new Error(d.Error || "Not found");
  return d;
}

async function searchOMDb(query) {
  const r = await fetch(`${API_BASE}&s=${encodeURIComponent(query)}&type=movie`);
  if (!r.ok) throw new Error("Network error");
  const d = await r.json();
  if (d.Response === "False") throw new Error(d.Error || "No results found");
  return d.Search;
}

async function fetchMany(ids) {
  const results = await Promise.allSettled(ids.map(fetchByID));
  return results.filter(r => r.status === "fulfilled").map(r => r.value);
}

/* ═══════════════════════════════════════════════════
   HERO POSTER SHOWCASE
═══════════════════════════════════════════════════ */

function renderHeroPosters(movies) {
  heroPoster.innerHTML = "";
  const slots = [
    { cls: "poster-card--left",  movie: movies[1] || movies[0] },
    { cls: "poster-card--main",  movie: movies[0] },
    { cls: "poster-card--right", movie: movies[2] || movies[0] },
  ];
  slots.forEach(({ cls, movie }) => {
    const url  = hiResPoster(movie.Poster);
    const card = document.createElement("div");
    card.className = `poster-card ${cls}`;
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", movie.Title);
    card.innerHTML = url
      ? `<img src="${esc(url)}" alt="${esc(movie.Title)} poster" loading="eager" />`
      : `<div class="poster-placeholder">🎬</div>`;
    if (cls === "poster-card--main") {
      const label = document.createElement("div");
      label.className = "poster-label";
      label.textContent = movie.Title;
      card.appendChild(label);
    }
    card.addEventListener("click",   ()    => openModal(movie));
    card.addEventListener("keydown", (e)   => { if (e.key === "Enter") openModal(movie); });
    heroPoster.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════
   CAROUSEL
═══════════════════════════════════════════════════ */

function buildCarousel(movies) {
  carouselMovies = movies;
  carouselTrack.innerHTML  = "";
  carouselDots.innerHTML   = "";

  movies.forEach((m, i) => {
    const url    = hiResPoster(m.Poster);
    const slide  = document.createElement("div");
    slide.className = "c-slide";
    slide.setAttribute("role", "tabpanel");
    slide.setAttribute("aria-label", m.Title);
    slide.innerHTML = url
      ? `<img src="${esc(url)}" alt="${esc(m.Title)}" loading="${i === 0 ? "eager" : "lazy"}" />`
      : `<div style="width:100%;height:100%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:3rem;opacity:.3">🎬</div>`;
    slide.addEventListener("click", () => openModal(m));
    carouselTrack.appendChild(slide);

    const dot = document.createElement("button");
    dot.className = `c-dot${i === 0 ? " active" : ""}`;
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Slide ${i + 1}: ${m.Title}`);
    dot.setAttribute("aria-selected", i === 0 ? "true" : "false");
    dot.addEventListener("click", () => { goTo(i); resetTimer(); });
    carouselDots.appendChild(dot);
  });
  goTo(0);
  startTimer();
}

function goTo(idx) {
  const total = carouselMovies.length;
  currentSlide = (idx + total) % total;
  const slides = carouselTrack.querySelectorAll(".c-slide");
  const dots   = carouselDots.querySelectorAll(".c-dot");

  slides.forEach((slide, i) => {
    slide.className = "c-slide";
    const offset = (i - currentSlide + total) % total;
    if      (offset === 0)          slide.classList.add("center");
    else if (offset === 1)          slide.classList.add("right");
    else if (offset === total - 1)  slide.classList.add("left");
    else if (offset === 2)          slide.classList.add("far-right");
    else if (offset === total - 2)  slide.classList.add("far-left");
    else                            slide.classList.add("hidden");
  });

  dots.forEach((d, i) => {
    d.classList.toggle("active", i === currentSlide);
    d.setAttribute("aria-selected", i === currentSlide ? "true" : "false");
  });
}

function startTimer() { stopTimer(); autoTimer = setInterval(() => { if (!isPaused) goTo(currentSlide + 1); }, 3000); }
function stopTimer()  { clearInterval(autoTimer); }
function resetTimer() { stopTimer(); startTimer(); }

cPrev.addEventListener("click", () => { goTo(currentSlide - 1); resetTimer(); });
cNext.addEventListener("click", () => { goTo(currentSlide + 1); resetTimer(); });

const carouselEl = document.querySelector(".carousel");
if (carouselEl) {
  carouselEl.addEventListener("mouseenter", () => { isPaused = true; });
  carouselEl.addEventListener("mouseleave", () => { isPaused = false; });
}

let tsX = 0;
$("carousel")?.addEventListener("touchstart", (e) => { tsX = e.changedTouches[0].screenX; }, { passive: true });
$("carousel")?.addEventListener("touchend",   (e) => {
  const diff = tsX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 40) { diff > 0 ? goTo(currentSlide + 1) : goTo(currentSlide - 1); resetTimer(); }
}, { passive: true });

/* ═══════════════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════════════ */

async function doSearch(query) {
  query = query.trim();
  if (!query) return;

  recents = [query, ...recents.filter(q => q.toLowerCase() !== query.toLowerCase())].slice(0, MAX_RECENT);
  writeJSON("flick_recents", recents);

  document.getElementById("discover").scrollIntoView({ behavior: "smooth", block: "start" });

  resultsGrid.innerHTML = "";
  skeletonGrid.hidden   = false;
  statusLine.innerHTML  = `<span class="spinner"></span> Searching for "<strong>${esc(query)}</strong>"…`;

  try {
    const hits     = await searchOMDb(query);
    const detailed = await fetchMany(hits.slice(0, 9).map(h => h.imdbID));
    skeletonGrid.hidden  = true;
    statusLine.innerHTML = `<span>${detailed.length} result${detailed.length !== 1 ? "s" : ""} for "<em>${esc(query)}</em>"</span>`;
    renderGrid(detailed, resultsGrid);
  } catch (err) {
    skeletonGrid.hidden  = true;
    statusLine.innerHTML = `<span class="err">⚠ ${esc(err.message)}</span>`;
  }
}

searchGo.addEventListener("click",   () => doSearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(searchInput.value); });
searchInput.addEventListener("input",   () => { searchClear.hidden = !searchInput.value; });
searchClear.addEventListener("click",   () => { searchInput.value = ""; searchClear.hidden = true; searchInput.focus(); });

/* ═══════════════════════════════════════════════════
   RENDER: GRID + CARD
═══════════════════════════════════════════════════ */

function renderGrid(movies, container) {
  container.innerHTML = "";
  if (!movies?.length) {
    container.innerHTML = `<p style="color:var(--txt-3);grid-column:1/-1;text-align:center;padding:32px">Nothing to show.</p>`;
    return;
  }
  movies.forEach(m => container.appendChild(makeCard(m)));
}

function makeCard(movie) {
  const url    = hiResPoster(movie.Poster);
  const genre  = movie.Genre  ? movie.Genre.split(",")[0].trim() : "";
  const rating = movie.imdbRating && movie.imdbRating !== "N/A" ? movie.imdbRating : null;
  const faved  = isFav(movie.imdbID);
  const wled   = isWL(movie.imdbID);
  const plot   = movie.Plot && movie.Plot !== "N/A" ? movie.Plot : "";

  const card = document.createElement("div");
  card.className = "movie-card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "article");
  card.setAttribute("aria-label", `${movie.Title}, ${movie.Year}`);
  card.dataset.id = movie.imdbID;

  card.innerHTML = `
    <div class="card__poster">
      ${url
        ? `<img src="${esc(url)}" alt="${esc(movie.Title)} poster" loading="lazy" />`
        : `<div class="no-poster-box"><span>🎬</span><span>No poster</span></div>`}
      ${rating ? `<div class="card__rating">⭐ ${esc(rating)}</div>` : ""}
      <div class="card__actions">
        <button class="card__fav ${faved ? "on" : ""}" data-id="${esc(movie.imdbID)}" aria-label="${faved ? "Remove from favourites" : "Add to favourites"}">${faved ? "♥" : "♡"}</button>
        <button class="card__wl ${wled ? "on" : ""}" data-id="${esc(movie.imdbID)}" aria-label="${wled ? "Remove from Watch Later" : "Add to Watch Later"}">${wled ? "🕐" : "🕐"}</button>
      </div>
      <div class="card__overlay">${plot ? `<p>${esc(plot)}</p>` : ""}</div>
    </div>
    <div class="card__body">
      <h3 class="card__title">${esc(movie.Title)}</h3>
      <div class="card__row">
        <span class="card__year">${esc(movie.Year || "")}</span>
        ${genre ? `<span class="card__genre">${esc(genre)}</span>` : ""}
      </div>
    </div>
  `;

  card.addEventListener("click",   (e) => { if (!e.target.closest(".card__fav") && !e.target.closest(".card__wl")) openModal(movie); });
  card.addEventListener("keydown", (e) => { if (e.key === "Enter") openModal(movie); });
  card.querySelector(".card__fav").addEventListener("click", (e) => { e.stopPropagation(); toggleFav(movie); });
  card.querySelector(".card__wl").addEventListener("click",  (e) => { e.stopPropagation(); toggleWatchLater(movie); });

  return card;
}

function syncButtons(imdbID) {
  const on  = isFav(imdbID);
  const wl  = isWL(imdbID);

  document.querySelectorAll(`.card__fav[data-id="${imdbID}"]`).forEach(btn => {
    btn.classList.toggle("on", on);
    btn.textContent = on ? "♥" : "♡";
    btn.setAttribute("aria-label", on ? "Remove from favourites" : "Add to favourites");
  });
  document.querySelectorAll(`.card__wl[data-id="${imdbID}"]`).forEach(btn => {
    btn.classList.toggle("on", wl);
    btn.setAttribute("aria-label", wl ? "Remove from Watch Later" : "Add to Watch Later");
  });
}

/* ═══════════════════════════════════════════════════
   FAVOURITES
═══════════════════════════════════════════════════ */

function toggleFav(movie) {
  const idx = favs.findIndex(f => f.imdbID === movie.imdbID);
  if (idx === -1) favs.push(movie); else favs.splice(idx, 1);
  writeJSON("flick_favs", favs);
  renderFavs();
  syncButtons(movie.imdbID);
  syncModalButtons(movie.imdbID);
}

function renderFavs() {
  if (!favs.length) { favsGrid.innerHTML = ""; favsEmpty.hidden = false; return; }
  favsEmpty.hidden = true;
  renderGrid(favs, favsGrid);
}

/* ═══════════════════════════════════════════════════
   WATCH LATER
═══════════════════════════════════════════════════ */

function toggleWatchLater(movie) {
  const idx = watchLater.findIndex(w => w.imdbID === movie.imdbID);
  if (idx === -1) watchLater.push(movie); else watchLater.splice(idx, 1);
  writeJSON("flick_watchlater", watchLater);
  renderWatchLater();
  syncButtons(movie.imdbID);
  syncModalButtons(movie.imdbID);
}

function renderWatchLater() {
  if (!watchLater.length) {
    watchLaterGrid.innerHTML = "";
    watchLaterEmpty.hidden   = false;
    clearWLBtn.hidden        = true;
    return;
  }
  watchLaterEmpty.hidden = true;
  clearWLBtn.hidden      = false;
  renderGrid(watchLater, watchLaterGrid);
}

clearWLBtn.addEventListener("click", () => {
  watchLater = [];
  writeJSON("flick_watchlater", watchLater);
  renderWatchLater();
  // refresh all wl button states
  document.querySelectorAll(".card__wl.on").forEach(btn => {
    btn.classList.remove("on");
    btn.setAttribute("aria-label", "Add to Watch Later");
  });
});

/* ═══════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════ */

async function openModal(movie) {
  let m = movie;
  if (!movie.Plot || movie.Plot === "N/A") {
    try { m = await fetchByID(movie.imdbID); } catch { /* use what we have */ }
  }
  renderModal(m);
  modalBackdrop.hidden       = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => modalClose.focus(), 80);
}

function closeModal() {
  modalBackdrop.hidden         = true;
  document.body.style.overflow = "";
}

function renderModal(m) {
  const url   = hiResPoster(m.Poster);
  const faved = isFav(m.imdbID);
  const wled  = isWL(m.imdbID);
  const rating = m.imdbRating && m.imdbRating !== "N/A" ? m.imdbRating : null;

  modalBody.innerHTML = `
    <div class="modal__layout">
      <div class="modal__poster">
        ${url
          ? `<img src="${esc(url)}" alt="${esc(m.Title)} poster" loading="lazy" />`
          : `<div class="no-poster-box" style="height:100%;min-height:260px"><span>🎬</span><span>No poster</span></div>`}
      </div>
      <div class="modal__details">
        <h2 class="modal__title">${esc(m.Title)}</h2>
        <div class="modal__chips">
          ${rating ? `<span class="chip chip-gold">⭐ ${esc(rating)} IMDb</span>` : ""}
          ${m.Year ? `<span class="chip chip-blue">📅 ${esc(m.Year)}</span>` : ""}
          ${m.Rated && m.Rated !== "N/A" ? `<span class="chip chip-grey">${esc(m.Rated)}</span>` : ""}
        </div>
        <div class="modal__meta">
          ${row("Genre",    m.Genre)}
          ${row("Runtime",  m.Runtime)}
          ${row("Director", m.Director)}
          ${row("Cast",     m.Actors)}
          ${row("Language", m.Language)}
          ${row("Country",  m.Country)}
          ${m.Awards && m.Awards !== "N/A" ? `<div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Awards</span><span class="meta-val">🏆 ${esc(m.Awards)}</span></div>` : ""}
        </div>
        ${m.Plot && m.Plot !== "N/A" ? `<p class="modal__plot">${esc(m.Plot)}</p>` : ""}
        <div class="modal__actions">
          <button class="modal__fav ${faved ? "on" : ""}" id="modalFavBtn" data-id="${esc(m.imdbID)}">
            ${faved ? "♥ Saved" : "♡ Add to Favourites"}
          </button>
          <button class="modal__wl ${wled ? "on" : ""}" id="modalWLBtn" data-id="${esc(m.imdbID)}">
            ${wled ? "🕐 In Watch Later" : "🕐 Watch Later"}
          </button>
        </div>
      </div>
    </div>
  `;

  $("modalFavBtn").addEventListener("click", () => toggleFav(m));
  $("modalWLBtn").addEventListener("click",  () => toggleWatchLater(m));
}

function syncModalButtons(imdbID) {
  const favBtn = $("modalFavBtn");
  const wlBtn  = $("modalWLBtn");
  if (favBtn && favBtn.dataset.id === imdbID) {
    const on = isFav(imdbID);
    favBtn.classList.toggle("on", on);
    favBtn.textContent = on ? "♥ Saved" : "♡ Add to Favourites";
  }
  if (wlBtn && wlBtn.dataset.id === imdbID) {
    const on = isWL(imdbID);
    wlBtn.classList.toggle("on", on);
    wlBtn.textContent = on ? "🕐 In Watch Later" : "🕐 Watch Later";
  }
}

function row(label, val) {
  if (!val || val === "N/A") return "";
  return `<div class="meta-item"><span class="meta-label">${label}</span><span class="meta-val">${esc(val)}</span></div>`;
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalBackdrop.hidden) closeModal(); });

/* ═══════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════ */

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  themeIcon.textContent = t === "dark" ? "☀" : "☾";
  writeJSON("flick_theme", t);
}

themeBtn.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

/* ═══════════════════════════════════════════════════
   HAMBURGER
═══════════════════════════════════════════════════ */

burger.addEventListener("click", () => {
  const open = burger.classList.toggle("open");
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden",    open ? "false" : "true");
  burger.setAttribute("aria-expanded",  open ? "true"  : "false");
});
document.querySelectorAll(".drawer__link").forEach(l => {
  l.addEventListener("click", () => {
    burger.classList.remove("open");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden",   "true");
    burger.setAttribute("aria-expanded", "false");
  });
});

/* ═══════════════════════════════════════════════════
   SCROLL — navbar + back to top (fixed logic)
═══════════════════════════════════════════════════ */

window.addEventListener("scroll", () => {
  navEl.classList.toggle("stuck", window.scrollY > 30);
  // Use .visible class — no [hidden] conflict with display:flex
  backTop.classList.toggle("visible", window.scrollY > 500);
}, { passive: true });

backTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
});

// Smooth scroll for nav anchors
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth" }); }
  });
});

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */

async function init() {
  /* 1. Theme */
  applyTheme(readJSON("flick_theme") || "dark");

  /* 2. Favourites + Watch Later from storage */
  renderFavs();
  renderWatchLater();

  /* 3. Fetch a fresh random selection of movies each load */
  statusLine.innerHTML = `<span class="spinner"></span> Loading movies…`;
  skeletonGrid.hidden  = false;

  try {
    // Shuffle the full pool and pick 12 IDs each load for variety
    const shuffled = shuffle(ALL_FEATURE_IDS);
    const movies   = await fetchMany(shuffled.slice(0, 12));

    // Hero: first 3 of this session's random set
    renderHeroPosters(movies.slice(0, 3));

    // Carousel: up to 8
    buildCarousel(movies.slice(0, 8));

    // Default discover grid: up to 9
    skeletonGrid.hidden  = true;
    statusLine.innerHTML = "<span>🎬 Popular picks — search above for any movie</span>";
    renderGrid(movies.slice(0, 9), resultsGrid);
  } catch (err) {
    skeletonGrid.hidden  = true;
    statusLine.innerHTML = `<span class="err">⚠ Could not load movies — check your API key in script.js</span>`;
    heroPoster.innerHTML = `<div class="poster-card poster-card--main"><div class="poster-placeholder">🎬</div></div>`;
  }
}

init();

console.info("%cFLICK 🎬", "font:bold 20px monospace;color:#e8c547");