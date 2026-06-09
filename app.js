function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const els = {
  viewButtons: document.querySelectorAll("[data-view]"),
  select: document.querySelector("#snapshotSelect"),
  search: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  updateBanner: document.querySelector("#updateBanner"),
  title: document.querySelector("#snapshotTitle"),
  freshnessText: document.querySelector("#freshnessText"),
  companyFilters: document.querySelector("#companyFilters"),
  filterStatus: document.querySelector("#filterStatus"),
  companyCount: document.querySelector("#companyCount"),
  itemCount: document.querySelector("#itemCount"),
  sourceCount: document.querySelector("#sourceCount"),
  ipoCount: document.querySelector("#ipoCount"),
  partnershipCount: document.querySelector("#partnershipCount"),
  grid: document.querySelector("#companyGrid"),
  ipoTracker: document.querySelector("#ipoTracker"),
  ipoList: document.querySelector("#ipoList"),
  ipoRaceList: document.querySelector("#ipoRaceList"),
  ipoStageLegend: document.querySelector("#ipoStageLegend"),
  ipoDetail: document.querySelector(".ipo-detail"),
  ipoStage: document.querySelector("#ipoStage"),
  ipoCompany: document.querySelector("#ipoCompany"),
  ipoStatusText: document.querySelector("#ipoStatusText"),
  ipoProcess: document.querySelector("#ipoProcess"),
  ipoUpdated: document.querySelector("#ipoUpdated"),
  ipoConfidence: document.querySelector("#ipoConfidence"),
  ipoArticleLink: document.querySelector("#ipoArticleLink"),
  ipoNote: document.querySelector("#ipoNote"),
  partnershipTracker: document.querySelector("#partnershipTracker"),
  partnershipList: document.querySelector("#partnershipList"),
  partnershipDetail: document.querySelector(".tracker-detail"),
  partnershipType: document.querySelector("#partnershipType"),
  partnershipName: document.querySelector("#partnershipName"),
  partnershipStatusText: document.querySelector("#partnershipStatusText"),
  partnershipCompanies: document.querySelector("#partnershipCompanies"),
  partnershipTerms: document.querySelector("#partnershipTerms"),
  partnershipUpdated: document.querySelector("#partnershipUpdated"),
  partnershipConfidence: document.querySelector("#partnershipConfidence"),
  partnershipArticleLink: document.querySelector("#partnershipArticleLink"),
  partnershipNote: document.querySelector("#partnershipNote"),
  companyTemplate: document.querySelector("#companyCardTemplate"),
  newsTemplate: document.querySelector("#newsItemTemplate"),
  backToTop: document.querySelector("#backToTop")
};

let snapshots = [];
let currentSnapshot = null;
let previousSnapshot = null;
let currentView = "news";
let selectedIpoCompany = null;
let selectedPartnership = null;
let activeFilters = new Set();

const IPO_STAGES = [
  { key: "watchlist", label: "Watchlist" },
  { key: "reported-prep", label: "Reported prep" },
  { key: "confidential-filing", label: "Confidential filing" },
  { key: "public-s1", label: "Public S-1" },
  { key: "roadshow-pricing", label: "Roadshow / pricing" },
  { key: "listed", label: "Listed" }
];

const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

async function loadIndex() {
  const response = await fetch("data/index.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load data/index.json (${response.status})`);
  }
  return response.json();
}

function validateSnapshot(data) {
  if (!Array.isArray(data.companies)) {
    throw new Error("Snapshot is missing the companies array");
  }
  for (const company of data.companies) {
    if (typeof company.name !== "string" || !Array.isArray(company.items)) {
      throw new Error(`Invalid company entry: ${company.name ?? "(unnamed)"}`);
    }
  }
}

async function loadSnapshot(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${path} (${response.status})`);
  }
  const data = await response.json();
  validateSnapshot(data);
  return data;
}

function formatDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatFreshness(generatedAt) {
  if (!generatedAt) return null;
  const diffMs = Date.now() - new Date(generatedAt).getTime();
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return "Generated less than an hour ago";
  if (hours < 24) return `Generated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Generated ${days} day${days === 1 ? "" : "s"} ago`;
}

function matchesQuery(company, query) {
  if (!query) return true;
  const haystack = [
    company.name,
    company.category,
    company.summary,
    ...company.items.flatMap((item) => [
      item.headline,
      item.detail,
      item.sourceTitle,
      item.sourceUrl
    ])
  ].join(" ").toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function ipoMatchesQuery(entry, query) {
  if (!query) return true;
  const haystack = [
    entry.company,
    entry.status,
    entry.stage,
    entry.process,
    entry.note,
    entry.latestArticle && entry.latestArticle.title,
    entry.latestArticle && entry.latestArticle.source,
    entry.latestArticle && entry.latestArticle.url
  ].join(" ").toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function partnershipMatchesQuery(entry, query) {
  if (!query) return true;
  const haystack = [
    entry.relationship,
    entry.type,
    entry.status,
    entry.terms,
    entry.note,
    entry.confidence,
    ...(entry.companies || []),
    entry.latestArticle && entry.latestArticle.title,
    entry.latestArticle && entry.latestArticle.source,
    entry.latestArticle && entry.latestArticle.url
  ].join(" ").toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function sourceCount(companies, ipoEntries, partnershipEntries) {
  const urls = [
    ...companies.flatMap((company) => company.items.map((item) => item.sourceUrl)),
    ...ipoEntries.map((entry) => entry.latestArticle && entry.latestArticle.url),
    ...partnershipEntries.map((entry) => entry.latestArticle && entry.latestArticle.url)
  ].filter(Boolean);

  return new Set(urls).size;
}

function setMetric(el, value, total) {
  if (total !== undefined && value !== total) {
    el.textContent = "";
    el.append(String(value));
    const small = document.createElement("small");
    small.className = "metric-total";
    small.textContent = ` / ${total}`;
    el.append(small);
  } else {
    el.textContent = value;
  }
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function getIpoStageIndex(entry) {
  const stage = normalizeText(entry.stage);
  const status = normalizeText(entry.status);
  const process = normalizeText(entry.process);
  const text = [stage, status, process].join(" ");

  if (text.includes("listed") || text.includes("public company") || text.includes("ipo completed")) {
    return 5;
  }
  if (text.includes("roadshow") || text.includes("pricing")) {
    return 4;
  }
  if (text.includes("public s-1") || text.includes("public filing") || text.includes("unveils filing")) {
    return 3;
  }
  if (text.includes("confidential")) {
    return 2;
  }
  if (
    text.includes("reported prep") ||
    text.includes("prospectus") ||
    text.includes("preparing") ||
    text.includes("preparation") ||
    text.includes("reported") ||
    text.includes("unverified filing claim")
  ) {
    return 1;
  }
  return 0;
}

function getIpoConfidenceTone(entry) {
  const confidence = normalizeText(entry.confidence);
  const status = normalizeText(entry.status);

  if (confidence.includes("confirmed") || status.includes("confirmed")) {
    return "confirmed";
  }
  if (
    confidence.includes("low") ||
    confidence.includes("unverified") ||
    status.includes("unverified") ||
    status.includes("conflicting")
  ) {
    return "unverified";
  }
  return "reported";
}

function selectIpoCompany(company) {
  selectedIpoCompany = company;
  els.ipoList.querySelectorAll(".ipo-row").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.company === company));
  });
  els.ipoRaceList.querySelectorAll(".ipo-race-row").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.company === company));
  });
}

function buildIpoStageLegend() {
  if (els.ipoStageLegend.childElementCount) return;

  const start = document.createElement("span");
  start.className = "ipo-stage-edge start";
  start.textContent = "Start";
  els.ipoStageLegend.append(start);

  IPO_STAGES.forEach((stage, index) => {
    const item = document.createElement("span");
    item.className = "ipo-stage-stop";
    item.style.setProperty("--stage-index", index);
    const label = document.createElement("span");
    label.className = "ipo-stage-stop-label";
    label.textContent = stage.label;
    item.append(label);
    els.ipoStageLegend.append(item);
  });

  const finish = document.createElement("span");
  finish.className = "ipo-stage-edge finish";
  finish.textContent = "Finish";
  els.ipoStageLegend.append(finish);
}

function buildCompanyFilters(snapshot) {
  els.companyFilters.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "filter-chip" + (activeFilters.size === 0 ? " active" : "");
  allBtn.type = "button";
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    activeFilters.clear();
    updateFilterChips();
    if (currentSnapshot) renderSnapshot(currentSnapshot);
  });
  els.companyFilters.append(allBtn);

  snapshot.companies.forEach((company) => {
    const chip = document.createElement("button");
    chip.className = "filter-chip" + (activeFilters.has(company.name) ? " active" : "");
    chip.type = "button";
    chip.textContent = company.name;
    chip.dataset.company = company.name;
    chip.addEventListener("click", () => {
      if (activeFilters.has(company.name)) {
        activeFilters.delete(company.name);
      } else {
        activeFilters.add(company.name);
      }
      updateFilterChips();
      if (currentSnapshot) renderSnapshot(currentSnapshot);
    });
    els.companyFilters.append(chip);
  });
}

function updateFilterChips() {
  els.companyFilters.querySelectorAll(".filter-chip").forEach((chip) => {
    const company = chip.dataset.company;
    if (!company) {
      chip.classList.toggle("active", activeFilters.size === 0);
    } else {
      chip.classList.toggle("active", activeFilters.has(company));
    }
  });
}

function setView(view) {
  currentView = view;
  els.viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  els.grid.classList.toggle("active", view === "news");
  els.ipoTracker.classList.toggle("active", view === "ipo");
  els.partnershipTracker.classList.toggle("active", view === "partnerships");
}

function renderSnapshot(snapshot) {
  currentSnapshot = snapshot;
  const query = els.search.value.trim();

  let companies = snapshot.companies.filter((company) => matchesQuery(company, query));
  if (activeFilters.size > 0) {
    companies = companies.filter((company) => activeFilters.has(company.name));
  }

  const ipoEntries = (snapshot.ipoTracker || []).filter((entry) => ipoMatchesQuery(entry, query));
  const partnershipEntries = (snapshot.partnershipTracker || []).filter((entry) => partnershipMatchesQuery(entry, query));
  const itemCount = companies.reduce((sum, company) => sum + company.items.length, 0);

  const totalCompanies = snapshot.companies.length;
  const totalItemCount = snapshot.companies.reduce((sum, c) => sum + c.items.length, 0);
  const totalIpo = (snapshot.ipoTracker || []).length;
  const totalPartnerships = (snapshot.partnershipTracker || []).length;

  els.title.textContent = `${formatDate(snapshot.date)} - ${snapshot.title || "AI news"}`;
  els.freshnessText.textContent = formatFreshness(snapshot.generatedAt) || "";

  setMetric(els.companyCount, companies.length, totalCompanies);
  setMetric(els.itemCount, itemCount, totalItemCount);
  els.sourceCount.textContent = sourceCount(companies, ipoEntries, partnershipEntries);
  setMetric(els.ipoCount, ipoEntries.length, totalIpo);
  setMetric(els.partnershipCount, partnershipEntries.length, totalPartnerships);

  const isFiltered = query || activeFilters.size > 0;
  els.filterStatus.textContent = (isFiltered && companies.length !== totalCompanies)
    ? `Showing ${companies.length} of ${totalCompanies} companies`
    : "";

  els.grid.innerHTML = "";
  renderIpoTracker(snapshot, ipoEntries);
  renderPartnershipTracker(snapshot, partnershipEntries);

  if (!companies.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No companies match the current search.";
    els.grid.append(empty);
    return;
  }

  companies.forEach((company) => {
    const prevCompany = previousSnapshot && previousSnapshot.companies.find((c) => c.name === company.name);
    const prevHeadlines = new Set((prevCompany && prevCompany.items || []).map((i) => i.headline));

    const card = els.companyTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".category").textContent = company.category;
    card.querySelector("h3").textContent = company.name;
    card.querySelector(".summary").textContent = company.summary;
    card.querySelector(".badge").textContent = company.items.length;

    const list = card.querySelector(".news-list");
    company.items.forEach((item) => {
      const row = els.newsTemplate.content.firstElementChild.cloneNode(true);
      const headline = row.querySelector("h4");
      headline.textContent = item.headline;

      if (previousSnapshot && !prevHeadlines.has(item.headline)) {
        const badge = document.createElement("span");
        badge.className = "new-badge";
        badge.textContent = "NEW";
        headline.prepend(badge);
      }

      row.querySelector("p").textContent = item.detail;
      const link = row.querySelector("a");
      link.href = item.sourceUrl;
      link.textContent = item.sourceTitle || "Source";
      list.append(row);
    });

    els.grid.append(card);
  });
}

function renderIpoTracker(snapshot, entries) {
  els.ipoList.innerHTML = "";
  els.ipoRaceList.innerHTML = "";
  buildIpoStageLegend();

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No IPO tracker entries match the current search.";
    els.ipoList.append(empty);
    els.ipoRaceList.append(empty.cloneNode(true));
    renderIpoDetail(null);
    return;
  }

  if (!selectedIpoCompany || !entries.some((entry) => entry.company === selectedIpoCompany)) {
    selectedIpoCompany = entries[0].company;
  }

  entries.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "ipo-row";
    button.type = "button";
    button.dataset.company = entry.company;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(entry.company === selectedIpoCompany));

    const label = document.createElement("span");
    const companyName = document.createElement("strong");
    const stage = document.createElement("small");
    const status = document.createElement("em");

    companyName.textContent = entry.company;
    stage.textContent = entry.stage;
    status.textContent = entry.status;
    label.append(companyName, stage);
    button.append(label, status);

    button.addEventListener("click", () => {
      selectIpoCompany(entry.company);
      renderIpoDetail(entry);
      if (isMobile()) {
        els.ipoDetail.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    els.ipoList.append(button);

    const raceRow = document.createElement("button");
    raceRow.className = `ipo-race-row ${getIpoConfidenceTone(entry)}`;
    raceRow.type = "button";
    raceRow.dataset.company = entry.company;
    raceRow.setAttribute("role", "option");
    raceRow.setAttribute("aria-selected", String(entry.company === selectedIpoCompany));

    const laneHeader = document.createElement("div");
    laneHeader.className = "ipo-race-header";
    const company = document.createElement("strong");
    const meta = document.createElement("span");
    company.textContent = entry.company;
    meta.textContent = `${entry.stage} • ${entry.confidence || "Confidence pending"}`;
    laneHeader.append(company, meta);

    const lane = document.createElement("div");
    lane.className = "ipo-race-lane";
    lane.style.setProperty("--stage-count", IPO_STAGES.length);
    lane.style.setProperty("--progress-stage", getIpoStageIndex(entry));

    IPO_STAGES.forEach((stage, index) => {
      const stop = document.createElement("span");
      stop.className = "ipo-stop";
      stop.style.setProperty("--stage-index", index);
      stop.dataset.label = stage.label;
      if (index < getIpoStageIndex(entry)) {
        stop.classList.add("passed");
      } else if (index === getIpoStageIndex(entry)) {
        stop.classList.add("current");
      }
      lane.append(stop);
    });

    const statusText = document.createElement("p");
    statusText.className = "ipo-race-status";
    statusText.textContent = entry.status;

    raceRow.append(laneHeader, lane, statusText);
    raceRow.addEventListener("click", () => {
      selectIpoCompany(entry.company);
      renderIpoDetail(entry);
      if (isMobile()) {
        els.ipoDetail.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    els.ipoRaceList.append(raceRow);
  });

  const selectedEntry = entries.find((entry) => entry.company === selectedIpoCompany);
  selectIpoCompany(selectedIpoCompany);
  renderIpoDetail(selectedEntry);
}

function renderPartnershipTracker(snapshot, entries) {
  els.partnershipList.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No partnership tracker entries match the current search.";
    els.partnershipList.append(empty);
    renderPartnershipDetail(null);
    return;
  }

  if (!selectedPartnership || !entries.some((entry) => entry.relationship === selectedPartnership)) {
    selectedPartnership = entries[0].relationship;
  }

  entries.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "tracker-row";
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(entry.relationship === selectedPartnership));

    const label = document.createElement("span");
    const relationship = document.createElement("strong");
    const companies = document.createElement("small");
    const type = document.createElement("em");

    relationship.textContent = entry.relationship;
    companies.textContent = (entry.companies || []).join(" + ");
    type.textContent = entry.type;
    label.append(relationship, companies);
    button.append(label, type);

    button.addEventListener("click", () => {
      els.partnershipList.querySelectorAll(".tracker-row").forEach((b) => b.setAttribute("aria-selected", "false"));
      button.setAttribute("aria-selected", "true");
      selectedPartnership = entry.relationship;
      renderPartnershipDetail(entry);
      if (isMobile()) {
        els.partnershipDetail.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    els.partnershipList.append(button);
  });

  renderPartnershipDetail(entries.find((entry) => entry.relationship === selectedPartnership));
}

function renderPartnershipDetail(entry) {
  if (!entry) {
    els.partnershipType.textContent = "No selection";
    els.partnershipName.textContent = "Partnerships";
    els.partnershipStatusText.textContent = "Choose a relationship to see the contract type, companies involved, and latest source.";
    els.partnershipCompanies.textContent = "-";
    els.partnershipTerms.textContent = "-";
    els.partnershipUpdated.textContent = "-";
    els.partnershipConfidence.textContent = "-";
    els.partnershipArticleLink.removeAttribute("href");
    els.partnershipArticleLink.textContent = "No source available";
    els.partnershipNote.textContent = "";
    return;
  }

  els.partnershipType.textContent = entry.type;
  els.partnershipName.textContent = entry.relationship;
  els.partnershipStatusText.textContent = entry.status;
  els.partnershipCompanies.textContent = (entry.companies || []).join(", ");
  els.partnershipTerms.textContent = entry.terms || "-";
  els.partnershipUpdated.textContent = entry.lastChecked || (currentSnapshot && currentSnapshot.date) || "-";
  els.partnershipConfidence.textContent = entry.confidence || "-";
  els.partnershipNote.textContent = entry.note || "";

  if (entry.latestArticle && entry.latestArticle.url) {
    els.partnershipArticleLink.href = entry.latestArticle.url;
    els.partnershipArticleLink.textContent = entry.latestArticle.title || "Open latest source";
  } else {
    els.partnershipArticleLink.removeAttribute("href");
    els.partnershipArticleLink.textContent = "No source available";
  }
}

function renderIpoDetail(entry) {
  if (!entry) {
    els.ipoStage.textContent = "No selection";
    els.ipoCompany.textContent = "IPO Tracker";
    els.ipoStatusText.textContent = "Choose a company to see its current IPO status, process stage, and latest article.";
    els.ipoProcess.textContent = "-";
    els.ipoUpdated.textContent = "-";
    els.ipoConfidence.textContent = "-";
    els.ipoArticleLink.removeAttribute("href");
    els.ipoArticleLink.textContent = "No article available";
    els.ipoNote.textContent = "";
    return;
  }

  els.ipoStage.textContent = entry.stage;
  els.ipoCompany.textContent = entry.company;
  els.ipoStatusText.textContent = entry.status;
  els.ipoProcess.textContent = entry.process;
  els.ipoUpdated.textContent = entry.lastChecked || (currentSnapshot && currentSnapshot.date) || "-";
  els.ipoConfidence.textContent = entry.confidence || "-";
  els.ipoNote.textContent = entry.note || "";

  if (entry.latestArticle && entry.latestArticle.url) {
    els.ipoArticleLink.href = entry.latestArticle.url;
    els.ipoArticleLink.textContent = entry.latestArticle.title || "Open latest IPO article";
  } else {
    els.ipoArticleLink.removeAttribute("href");
    els.ipoArticleLink.textContent = "No article available";
  }
}

async function handleSnapshotChange() {
  const selected = snapshots.find((snapshot) => snapshot.date === els.select.value);
  if (!selected) return;
  document.body.classList.add("loading");
  try {
    const currentIdx = snapshots.findIndex((s) => s.date === selected.date);
    const prevEntry = currentIdx < snapshots.length - 1 ? snapshots[currentIdx + 1] : null;

    const [snap, prev] = await Promise.all([
      loadSnapshot(selected.path),
      prevEntry ? loadSnapshot(prevEntry.path).catch(() => null) : Promise.resolve(null)
    ]);

    previousSnapshot = prev;
    activeFilters.clear();
    buildCompanyFilters(snap);
    renderSnapshot(snap);
  } finally {
    document.body.classList.remove("loading");
  }
}

function addListboxKeyNav(container, rowSelector) {
  container.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [...container.querySelectorAll(rowSelector)];
    const idx = rows.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
    var target = rows[Math.max(0, Math.min(next, rows.length - 1))];
    if (target) target.focus();
  });
}

async function boot() {
  try {
    const index = await loadIndex();
    snapshots = [...index.snapshots].sort((a, b) => b.date.localeCompare(a.date));

    els.select.innerHTML = "";
    snapshots.forEach(function(snapshot) {
      const option = document.createElement("option");
      option.value = snapshot.date;
      option.textContent = snapshot.label || formatDate(snapshot.date);
      els.select.appendChild(option);
    });

    els.select.value = index.latest || (snapshots[0] && snapshots[0].date);
    await handleSnapshotChange();
  } catch (error) {
    els.title.textContent = "Dashboard data could not be loaded";
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = error.message;
    const retry = document.createElement("button");
    retry.className = "retry-button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => boot());
    els.grid.innerHTML = "";
    els.grid.appendChild(p);
    els.grid.appendChild(retry);
  }
}

els.select.addEventListener("change", handleSnapshotChange);
els.search.addEventListener("input", debounce(() => {
  if (currentSnapshot) renderSnapshot(currentSnapshot);
}, 150));
els.viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
addListboxKeyNav(els.ipoList, ".ipo-row");
addListboxKeyNav(els.ipoRaceList, ".ipo-race-row");
addListboxKeyNav(els.partnershipList, ".tracker-row");

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
    e.preventDefault();
    els.search.focus();
    els.search.select();
  }
});

window.addEventListener("scroll", () => {
  els.backToTop.classList.toggle("visible", window.scrollY > 400);
}, { passive: true });

els.backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// --- Refresh button ---

function setUpdateState(running) {
  els.refreshButton.disabled = running;
  els.refreshButton.textContent = running ? "Updating…" : "Refresh";
  els.updateBanner.hidden = !running;
  els.updateBanner.classList.remove("done");
  if (running) els.updateBanner.textContent = "Fetching latest AI news — this may take a minute…";
}

function showUpdateDone() {
  els.updateBanner.hidden = false;
  els.updateBanner.classList.add("done");
  els.updateBanner.textContent = "Update complete — new snapshot loaded.";
  setTimeout(() => { els.updateBanner.hidden = true; }, 5000);
}

if (els.refreshButton) els.refreshButton.addEventListener("click", async () => {
  setUpdateState(true);
  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUpdateState(false);
      els.updateBanner.hidden = false;
      els.updateBanner.textContent = body.error || "Refresh request failed.";
    }
  } catch {
    setUpdateState(false);
  }
});

// --- Server-Sent Events: live update notifications ---

function connectSSE() {
  const evtSource = new EventSource("/api/events");

  evtSource.addEventListener("status", (e) => {
    const { running } = JSON.parse(e.data);
    setUpdateState(running);
  });

  evtSource.addEventListener("snapshot", async () => {
    // New snapshot written — reload the index and switch to latest
    try {
      const index = await loadIndex();
      const updated = [...index.snapshots].sort((a, b) => b.date.localeCompare(a.date));
      const latestDate = updated[0] && updated[0].date;

      if (latestDate && latestDate !== (snapshots[0] && snapshots[0].date)) {
        snapshots = updated;
        const option = document.createElement("option");
        option.value = latestDate;
        option.textContent = updated[0].label || formatDate(latestDate);
        els.select.prepend(option);
      }

      els.select.value = index.latest || (snapshots[0] && snapshots[0].date);
      await handleSnapshotChange();
      showUpdateDone();
    } catch {
      // Silent — user can manually select latest
    }
  });

  evtSource.onerror = () => {
    // Browser will auto-reconnect; nothing to do
  };
}

// Only connect SSE when served from the Node.js server
if (window.location.protocol !== 'file:') connectSSE();

boot();
