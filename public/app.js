const state = {
  dashboard: null,
  currentView: "dashboard",
  searchTimer: null,
  libraryQuery: "",
  libraryBrain: "",
  libraryCategory: "",
  libraryPages: [],
  vault: null,
  currentPageId: null,
  quoteIndex: 0,
  selectionText: "",
  appVersion: "",
  updateStatus: { status: "idle", info: null }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatDate(value, withTime = false) {
  if (!value) return "未知";
  return new Intl.DateTimeFormat("zh-CN", withTime
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" }
  ).format(new Date(value));
}

function statusLabel(status) {
  return { active: "活跃", maintenance: "维护", seed: "种子", system: "系统", unregistered: "未注册" }[status] || status;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function renderApp(dashboard) {
  const previousBrain = $("#brain-filter")?.value || state.libraryBrain;
  const previousQuery = $("#library-search")?.value || state.libraryQuery;
  state.dashboard = dashboard;
  renderSidebar();
  if ([...$("#brain-filter").options].some((option) => option.value === previousBrain)) {
    $("#brain-filter").value = previousBrain;
  }
  $("#library-search").value = previousQuery;
  renderDashboard();
  renderHealth();
  runLibrarySearch();
}

function showSetup(message) {
  if (message) $("#setup-message").textContent = message;
  $("#setup-screen").hidden = false;
}

function hideSetup() {
  $("#setup-screen").hidden = true;
}

function openSettings() {
  if (!state.dashboard) return;
  $("#settings-summary").textContent = `${state.dashboard.summary.pages} 篇内容已连接，日常会自动更新`;
  $("#update-detail").textContent = `当前版本 v${state.appVersion || "?"}`;
  renderUpdateStatus(state.updateStatus);
  $("#settings-dialog").classList.add("open");
}

function renderUpdateStatus(status) {
  if (!status) return;
  state.updateStatus = status;
  const detail = $("#update-detail");
  const action = $("#update-action");
  const row = $("#update-row");
  if (!detail || !action || !row) return;
  row.classList.remove("ready");
  switch (status.status) {
    case "checking":
      detail.textContent = "正在检查更新…";
      action.textContent = "…";
      break;
    case "available":
      detail.textContent = `发现新版本 v${status.info?.version || "?"}，正在下载…`;
      action.textContent = "…";
      break;
    case "downloading":
      detail.textContent = `正在下载 ${status.info?.percent ?? 0}%`;
      action.textContent = "…";
      break;
    case "downloaded":
      detail.textContent = `新版本 v${status.info?.version || "?"} 已就绪`;
      action.textContent = "重启安装";
      row.classList.add("ready");
      showToast("新版本已下载，请在设置中重启安装");
      break;
    case "not-available":
      detail.textContent = "已是最新版本";
      action.textContent = "检查";
      break;
    case "error":
      detail.textContent = `检查失败：${status.info?.message || "网络异常"}`;
      action.textContent = "重试";
      break;
    default:
      detail.textContent = `当前版本 v${state.appVersion || "?"}`;
      action.textContent = "检查";
  }
}

function closeSettings() {
  $("#settings-dialog").classList.remove("open");
}

async function connectVault(action) {
  const buttons = $$("#setup-screen button, #settings-dialog button");
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const result = await action();
    if (!result?.dashboard) {
      if (!result?.canceled) {
        if (state.dashboard) showToast("资料位置没有更改");
        else showSetup("还没有找到可用内容。你可以选择 SecondBrain 主文件夹，我们会记住它。");
      }
      return false;
    }
    state.libraryBrain = "";
    state.libraryCategory = "";
    state.libraryQuery = "";
    $("#brain-filter").value = "";
    $("#library-search").value = "";
    state.vault = result;
    hideSetup();
    closeSettings();
    renderApp(result.dashboard);
    showToast("SecondBrain 已准备好");
    return true;
  } catch (error) {
    console.error(error);
    showSetup("暂时无法读取这里的内容。请选择 SecondBrain 主文件夹后重试。");
    return false;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function getJson(url, options) {
  if (window.secondBrain) {
    const target = new URL(url, "https://secondbrain.local");
    if (target.pathname === "/api/dashboard") return window.secondBrain.dashboard();
    if (target.pathname === "/api/search") return window.secondBrain.search(target.searchParams.get("q") || "");
    if (target.pathname === "/api/page") return window.secondBrain.page(target.searchParams.get("id") || "");
    if (target.pathname === "/api/pages") return window.secondBrain.pages(target.searchParams.get("brain") || "");
    if (target.pathname === "/api/issues") return window.secondBrain.issues();
    if (target.pathname === "/api/note" && options?.method === "POST") return window.secondBrain.addNote(JSON.parse(options.body));
    if (target.pathname === "/api/rebuild" && options?.method === "POST") return window.secondBrain.rebuild();
    throw new Error(`Unsupported desktop request: ${target.pathname}`);
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function renderSidebar() {
  const brains = state.dashboard.registry.brains;
  $("#brain-count").textContent = brains.length;
  $("#brain-list").innerHTML = brains.map((brain) => `
    <button class="brain-item" data-brain="${brain.id}">
      <span class="brain-swatch" style="--brain-color:${brain.color}"></span>
      <span class="brain-name">${escapeHtml(brain.short)}</span>
      <span class="brain-pages">${brain.pages}</span>
    </button>
  `).join("");

  $("#brain-filter").innerHTML = `<option value="">全部脑区</option>${brains.map((brain) =>
    `<option value="${brain.id}">${escapeHtml(brain.name)}</option>`
  ).join("")}`;
}

function metric(label, value, tone, note) {
  return `<div class="metric ${tone}">
    <span class="metric-label">${label}</span>
    <strong>${value}</strong>
    <span class="metric-note">${note}</span>
  </div>`;
}

function renderQuote() {
  const quotes = state.dashboard.quotes || [];
  if (!quotes.length) {
    $("#quote-banner").hidden = true;
    return;
  }
  $("#quote-banner").hidden = false;
  const quote = quotes[state.quoteIndex % quotes.length];
  const banner = $("#quote-banner");
  banner.style.setProperty("--brain-color", quote.color);
  $("#quote-kicker").textContent = `${quote.brainName} · 金句`;
  $("#quote-text").textContent = `“${quote.quote}”`;
  $("#quote-source").textContent = `—— 《${quote.title}》`;
  $("#quote-open").dataset.pageId = encodeURIComponent(quote.id);
}

function renderDashboard() {
  const data = state.dashboard;
  const summary = data.summary;
  $("#today-label").textContent = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  }).format(new Date());
  $("#generated-at").textContent = `更新于 ${formatDate(summary.generatedAt, true)}`;
  renderQuote();
  $("#metrics").innerHTML = [
    metric("待处理捕获", summary.captures, summary.captures ? "amber" : "green", "来自收件箱"),
    metric("待归档", summary.pendingRoutes, summary.pendingRoutes ? "cyan" : "green", "来自信息源"),
    metric("可完善", summary.knowledgeGaps, summary.knowledgeGaps ? "amber" : "green", "尚未连接的概念"),
    metric("知识页面", summary.pages, "neutral", `${summary.links} 条有效连接`)
  ].join("");

  const actions = [];
  if (summary.captures) {
    actions.push({
      tone: "amber", title: `处理 ${summary.captures} 条收件箱捕获`,
      detail: data.queues.captures[0]?.title || "检查未编译碎片", meta: "CAPTURE"
    });
  }
  if (summary.pendingRoutes) {
    actions.push({
      tone: "cyan", title: `完成 ${summary.pendingRoutes} 条内容路由`,
      detail: data.queues.routes[0]?.title || "检查信息源路由", meta: "ROUTING"
    });
  }
  if (summary.knowledgeGaps) {
    actions.push({
      tone: "amber", title: `审阅 ${summary.knowledgeGaps} 个待补连接`,
      detail: "这些目标页面尚未创建，不是应用运行错误", meta: "HEALTH", view: "health"
    });
  }
  if (!actions.length) actions.push({ tone: "green", title: "处理队列已清空", detail: "可以开始一次主动查询或知识回顾", meta: "CLEAR" });
  $("#action-count").textContent = actions.length;
  $("#action-list").innerHTML = actions.map((action) => `
    <button class="action-row" ${action.view ? `data-go-view="${action.view}"` : ""}>
      <span class="action-indicator ${action.tone}"></span>
      <span class="action-copy"><strong>${escapeHtml(action.title)}</strong><span>${escapeHtml(action.detail)}</span></span>
      <span class="action-meta">${action.meta}</span><span class="row-arrow">→</span>
    </button>
  `).join("");

  const surfaced = data.resurfacing;
  $("#resurfacing").innerHTML = surfaced ? `
    <button class="resurfacing-content" data-page-id="${encodeURIComponent(surfaced.id)}">
      <span class="brain-tag"><i style="--brain-color:${surfaced.color}"></i>${escapeHtml(surfaced.brainName)}</span>
      <h3>${escapeHtml(surfaced.title)}</h3>
      <p>${escapeHtml(surfaced.snippet || "这是一条值得重新连接的旧知识。")}</p>
      <span class="surface-date">上次更新 ${formatDate(surfaced.updated)}</span>
    </button>` : `<div class="empty-state">还没有适合浮现的知识。</div>`;

  $("#recent-list").innerHTML = data.recent.slice(0, 7).map((page) => `
    <button class="recent-row" data-page-id="${encodeURIComponent(page.id)}">
      <span class="brain-swatch" style="--brain-color:${page.color}"></span>
      <span><strong>${escapeHtml(page.title)}</strong><small>${escapeHtml(page.brainName)}</small></span>
      <time>${formatDate(page.updated)}</time>
    </button>
  `).join("");

  const maxPages = Math.max(...data.registry.brains.map((brain) => brain.pages), 1);
  $("#activity-list").innerHTML = data.registry.brains
    .filter((brain) => brain.status !== "system")
    .sort((a, b) => b.pages - a.pages)
    .slice(0, 9)
    .map((brain) => `
      <button class="activity-row" data-brain="${brain.id}">
        <span class="activity-name"><i style="--brain-color:${brain.color}"></i>${escapeHtml(brain.short)}</span>
        <span class="activity-track"><i style="--width:${Math.max(3, brain.pages / maxPages * 100)}%;--brain-color:${brain.color}"></i></span>
        <span class="activity-value">${brain.pages}<small>${brain.raw}</small></span>
        <span class="lifecycle ${brain.status}">${statusLabel(brain.status)}</span>
      </button>
    `).join("");
}

function renderHealth() {
  const summary = state.dashboard.summary;
  $("#health-summary").innerHTML = `
    <div><strong>${summary.errors}</strong><span>需要修复</span></div>
    <div><strong>${summary.knowledgeGaps}</strong><span>可补充连接</span></div>
    <div><strong>${summary.orphans}</strong><span>较少被引用</span></div>
    <div><strong>${summary.metadataIssues}</strong><span>信息可完善</span></div>`;
  const issues = state.dashboard.issuePreview;
  $("#issue-list").innerHTML = issues.length ? issues.map((issue) => `
    <div class="issue-row">
      <span class="severity ${issue.severity}">${issue.code === "knowledge-gap" ? "缺口" : issue.severity === "error" ? "错误" : "警告"}</span>
      <span><strong>${escapeHtml(issue.message)}</strong><small>${escapeHtml(issue.page || issue.brain || "")}</small></span>
      <code>${escapeHtml(issue.code)}</code>
    </div>
  `).join("") : `<div class="empty-state">没有高优先级问题。</div>`;
}

function switchView(view) {
  state.currentView = view;
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.body.classList.remove("sidebar-open");
  if (view === "library" && !state.libraryQuery) {
    runLibrarySearch();
  }
}

function selectedBrain() {
  return state.dashboard.registry.brains.find((brain) => brain.id === $("#brain-filter").value);
}

function renderBrainOverview() {
  $("#library-title").textContent = "知识库";
  $("#library-description").textContent = "选择一个脑区，直接进入它的页面目录。";
  $("#category-nav").classList.add("hidden");
  $("#result-summary").textContent = `${state.dashboard.registry.brains.length} 个脑区`;
  $("#library-results").innerHTML = `<div class="brain-browser-grid">${
    state.dashboard.registry.brains.map((brain) => `
      <button class="brain-browser-item" data-brain="${brain.id}">
        <span class="brain-browser-top">
          <i style="--brain-color:${brain.color}"></i>
          <span class="lifecycle ${brain.status}">${statusLabel(brain.status)}</span>
        </span>
        <strong>${escapeHtml(brain.name)}</strong>
        <span>${brain.pages} 篇笔记 · ${brain.raw} 份原始资料</span>
        <small>${brain.domains.map(escapeHtml).join(" · ")}</small>
      </button>`).join("")
  }</div>`;
}

function renderPageBrowser() {
  const brain = selectedBrain();
  const categories = [...new Set(state.libraryPages.map((page) => page.path.includes("/") ? page.path.split("/")[0] : "根目录"))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  $("#library-title").textContent = brain?.name || "知识库";
  $("#library-description").textContent = brain
    ? `${brain.pages} 篇笔记，按目录浏览或在当前脑区搜索。`
    : "全部脑区的页面";
  $("#category-nav").classList.remove("hidden");
  $("#category-nav").innerHTML = `
    <button class="${state.libraryCategory ? "" : "active"}" data-category="">
      <span>全部页面</span><b>${state.libraryPages.length}</b>
    </button>
    ${categories.map((category) => {
      const count = state.libraryPages.filter((page) =>
        (page.path.includes("/") ? page.path.split("/")[0] : "根目录") === category
      ).length;
      return `<button class="${state.libraryCategory === category ? "active" : ""}" data-category="${escapeHtml(category)}">
        <span>${escapeHtml(category)}</span><b>${count}</b>
      </button>`;
    }).join("")}`;

  const visible = state.libraryCategory
    ? state.libraryPages.filter((page) =>
        (page.path.includes("/") ? page.path.split("/")[0] : "根目录") === state.libraryCategory
      )
    : state.libraryPages;
  $("#result-summary").textContent = `${visible.length} 篇笔记`;
  $("#library-results").innerHTML = visible.length
    ? visible.map((page) => `
      <button class="browse-row" data-page-id="${encodeURIComponent(page.id)}">
        <span class="browse-type">${escapeHtml(page.type || "page")}</span>
        <span class="browse-main">
          <strong>${escapeHtml(page.title)}</strong>
          <small>${escapeHtml(page.path)}</small>
          ${page.snippet ? `<p>${escapeHtml(page.snippet)}</p>` : ""}
        </span>
        <span class="browse-meta"><b>${page.links}</b> 连接<time>${formatDate(page.updated)}</time></span>
      </button>`).join("")
    : `<div class="empty-state">这个分类下还没有页面。</div>`;
}

async function runLibrarySearch() {
  const query = $("#library-search").value.trim();
  const brain = $("#brain-filter").value;
  state.libraryQuery = query;
  state.libraryBrain = brain;
  if (!query) {
    if (!brain) {
      state.libraryPages = [];
      renderBrainOverview();
      return;
    }
    state.libraryPages = await getJson(`/api/pages?brain=${encodeURIComponent(brain)}`);
    renderPageBrowser();
    return;
  }
  let results = await getJson(`/api/search?q=${encodeURIComponent(query)}`);
  if (brain) results = results.filter((item) => item.brain === brain);
  const brainInfo = selectedBrain();
  $("#library-title").textContent = brainInfo ? `${brainInfo.short} · 搜索` : "全局搜索";
  $("#library-description").textContent = `正在查找“${query}”`;
  $("#category-nav").classList.add("hidden");
  $("#result-summary").textContent = `找到 ${results.length} 条相关知识`;
  $("#library-results").innerHTML = results.length ? results.map(resultCard).join("") : `<div class="empty-state">没有找到相关页面。</div>`;
}

function resultCard(page) {
  return `<button class="result-row" data-page-id="${encodeURIComponent(page.id)}">
    <span class="result-color" style="--brain-color:${page.color}"></span>
    <span class="result-main">
      <span class="result-label">${escapeHtml(page.brainName)} · ${escapeHtml(page.type || "page")}</span>
      <strong>${escapeHtml(page.title)}</strong>
      <p>${escapeHtml(page.snippet || "暂无摘要")}</p>
    </span>
    <time>${formatDate(page.updated)}</time>
  </button>`;
}

async function openPage(id) {
  const page = await getJson(`/api/page?id=${encodeURIComponent(id)}`);
  state.currentPageId = page.id;
  $("#reader-note-input").value = "";
  $("#reader-note-save").disabled = true;
  $("#reader-dot").style.setProperty("--brain-color", page.color);
  $("#reader-brain").textContent = page.brainName;
  $("#reader-meta").innerHTML = `
    <span>${escapeHtml(page.type || "page")}</span>
    <span>更新 ${formatDate(page.updated)}</span>
    <span>${page.outlinks.length} 出链</span>
    <span>${page.backlinks.length} 入链</span>`;
  $("#reader-content").innerHTML = page.html;
  const connections = [...new Set([...page.outlinks, ...page.backlinks])];
  $("#reader-connections").innerHTML = connections.length
    ? connections.slice(0, 20).map((link) => `<button data-page-id="${encodeURIComponent(link)}">${escapeHtml(link.split("/").at(-1))}</button>`).join("")
    : `<span class="quiet-label">暂无连接</span>`;
  $("#reader").classList.add("open");
  $("#reader-backdrop").classList.add("open");
}

function closeReader() {
  $("#reader").classList.remove("open");
  $("#reader-backdrop").classList.remove("open");
}

async function saveNote(text, selection = "") {
  const pageId = state.currentPageId;
  if (!pageId) {
    showToast("请先打开一篇笔记");
    return false;
  }
  try {
    const result = await getJson("/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, text, selection })
    });
    if (result.error) {
      showToast(`保存失败：${result.error}`);
      return false;
    }
    showToast("已存入收件箱");
    return true;
  } catch (error) {
    console.error(error);
    showToast("保存失败，请稍后重试");
    return false;
  }
}

function showSelectionBubble() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || "";
  const bubble = $("#selection-bubble");
  if (text.length < 10 || !state.currentPageId) {
    bubble.hidden = true;
    return;
  }
  try {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const bubbleWidth = 72;
    let left = rect.left + rect.width / 2 - bubbleWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bubbleWidth - 8));
    const top = Math.max(8, rect.top - 42);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.hidden = false;
  } catch {
    bubble.hidden = true;
  }
}

function openAnnotationDialog() {
  const selection = window.getSelection();
  const fresh = selection?.toString().trim();
  if (fresh) state.selectionText = fresh;
  state.selectionText = state.selectionText.replace(/\s+/g, " ").slice(0, 200);
  if (!state.selectionText) return;
  $("#selection-bubble").hidden = true;
  $("#annotation-selection").textContent = state.selectionText;
  $("#annotation-text").value = "";
  $("#annotation-dialog").classList.add("open");
  setTimeout(() => $("#annotation-text").focus(), 20);
}

function closeAnnotationDialog() {
  $("#annotation-dialog").classList.remove("open");
}

function openSearch() {
  $("#search-dialog").classList.add("open");
  $("#command-search").value = "";
  $("#command-results").innerHTML = `<div class="command-empty">输入关键词，直接调用已有知识。</div>`;
  setTimeout(() => $("#command-search").focus(), 20);
}

function closeSearch() {
  $("#search-dialog").classList.remove("open");
}

async function commandSearch() {
  const query = $("#command-search").value.trim();
  if (!query) {
    $("#command-results").innerHTML = `<div class="command-empty">输入关键词，直接调用已有知识。</div>`;
    return;
  }
  const results = await getJson(`/api/search?q=${encodeURIComponent(query)}`);
  $("#command-results").innerHTML = results.length
    ? results.slice(0, 10).map((page) => `
      <button class="command-row" data-page-id="${encodeURIComponent(page.id)}">
        <span class="brain-swatch" style="--brain-color:${page.color}"></span>
        <span><strong>${escapeHtml(page.title)}</strong><small>${escapeHtml(page.brainName)} · ${escapeHtml(page.type)}</small></span>
      </button>`).join("")
    : `<div class="command-empty">没有匹配结果。</div>`;
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-page-id]");
    if (pageButton) {
      event.preventDefault();
      closeSearch();
      openPage(decodeURIComponent(pageButton.dataset.pageId));
      return;
    }
    const viewButton = event.target.closest("[data-view], [data-go-view]");
    if (viewButton) switchView(viewButton.dataset.view || viewButton.dataset.goView);
    const brainButton = event.target.closest("[data-brain]");
    if (brainButton) {
      event.preventDefault();
      switchView("library");
      $("#brain-filter").value = brainButton.dataset.brain;
      $("#library-search").value = "";
      state.libraryCategory = "";
      runLibrarySearch();
      return;
    }
    const categoryButton = event.target.closest("[data-category]");
    if (categoryButton) {
      state.libraryCategory = categoryButton.dataset.category;
      renderPageBrowser();
    }
  });

  $("#search-trigger").addEventListener("click", openSearch);
  $("#menu-button").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  $("#reader-close").addEventListener("click", closeReader);
  $("#reader-backdrop").addEventListener("click", closeReader);
  $("#quote-shuffle").addEventListener("click", () => {
    state.quoteIndex = (state.quoteIndex + 1) % (state.dashboard.quotes?.length || 1);
    renderQuote();
  });
  $("#quote-open").addEventListener("click", () => {
    const id = $("#quote-open").dataset.pageId;
    if (id) openPage(decodeURIComponent(id));
  });
  $("#reader-content").addEventListener("mouseup", showSelectionBubble);
  $("#reader-content").addEventListener("keyup", showSelectionBubble);
  document.addEventListener("mousedown", (event) => {
    if (event.target.closest("#selection-bubble") || event.target.closest("#annotation-dialog")) return;
    $("#selection-bubble").hidden = true;
  });
  $("#selection-bubble").addEventListener("click", openAnnotationDialog);
  $("#annotation-save").addEventListener("click", async () => {
    const note = $("#annotation-text").value.trim();
    if (!note) return;
    if (await saveNote(note, state.selectionText)) {
      closeAnnotationDialog();
      $("#selection-bubble").hidden = true;
      window.getSelection()?.removeAllRanges();
    }
  });
  $("#annotation-cancel").addEventListener("click", closeAnnotationDialog);
  $("#annotation-close").addEventListener("click", closeAnnotationDialog);
  $("#annotation-dialog").addEventListener("click", (event) => { if (event.target === $("#annotation-dialog")) closeAnnotationDialog(); });
  $("#reader-note-input").addEventListener("input", () => {
    $("#reader-note-save").disabled = !$("#reader-note-input").value.trim();
  });
  $("#reader-note-save").addEventListener("click", async () => {
    const note = $("#reader-note-input").value.trim();
    if (!note) return;
    if (await saveNote(note)) {
      $("#reader-note-input").value = "";
      $("#reader-note-save").disabled = true;
    }
  });
  $("#search-dialog").addEventListener("click", (event) => { if (event.target === $("#search-dialog")) closeSearch(); });
  $("#open-resurfacing").addEventListener("click", () => state.dashboard.resurfacing && openPage(state.dashboard.resurfacing.id));
  $("#library-search").addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(runLibrarySearch, 180);
  });
  $("#brain-filter").addEventListener("change", () => {
    state.libraryCategory = "";
    runLibrarySearch();
  });
  $("#command-search").addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(commandSearch, 140);
  });
  $("#settings-button").addEventListener("click", openSettings);
  $("#update-row").addEventListener("click", async () => {
    if (!window.secondBrain) return;
    if (state.updateStatus.status === "downloaded") {
      await window.secondBrain.quitAndInstall();
      return;
    }
    if (state.updateStatus.status === "checking" || state.updateStatus.status === "downloading" || state.updateStatus.status === "available") return;
    renderUpdateStatus({ status: "checking", info: null });
    try {
      await window.secondBrain.checkForUpdate();
    } catch (error) {
      console.error(error);
      renderUpdateStatus({ status: "error", info: { message: error?.message || "网络异常" } });
    }
  });
  $("#settings-close").addEventListener("click", closeSettings);
  $("#settings-dialog").addEventListener("click", (event) => {
    if (event.target === $("#settings-dialog")) closeSettings();
  });
  $("#auto-find-button").addEventListener("click", () => {
    if (window.secondBrain) connectVault(() => window.secondBrain.autoDetectVault());
  });
  $("#choose-folder-button").addEventListener("click", () => {
    if (window.secondBrain) connectVault(() => window.secondBrain.chooseVault());
  });
  $("#change-vault-button").addEventListener("click", () => {
    if (window.secondBrain) connectVault(() => window.secondBrain.chooseVault());
  });
  $("#reveal-vault-button").addEventListener("click", async () => {
    if (window.secondBrain) await window.secondBrain.revealVault();
  });
  $("#refresh-button").addEventListener("click", async () => {
    try {
      renderApp(await getJson("/api/rebuild", { method: "POST" }));
      closeSettings();
      showToast("内容已更新");
    } catch (error) {
      console.error(error);
      showToast("暂时无法更新，请稍后重试");
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
    if (event.key === "Escape") {
      closeSearch();
      closeReader();
      closeSettings();
      closeAnnotationDialog();
      $("#selection-bubble").hidden = true;
    }
  });
}

async function init() {
  bindEvents();
  if (window.secondBrain) {
    const vault = await window.secondBrain.vaultInfo();
    state.vault = vault;
    window.secondBrain.onUpdated((dashboard) => {
      renderApp(dashboard);
      showToast("内容已自动更新");
    });
    state.appVersion = (await window.secondBrain.appVersion()) || "";
    state.updateStatus = (await window.secondBrain.updateStatus()) || state.updateStatus;
    window.secondBrain.onUpdateStatus(renderUpdateStatus);
    if (!vault.configured) {
      showSetup();
      return;
    }
  }
  renderApp(await getJson("/api/dashboard"));
}

init().catch((error) => {
  console.error(error);
  showSetup("暂时无法打开内容。请选择 SecondBrain 主文件夹后重试。");
});
