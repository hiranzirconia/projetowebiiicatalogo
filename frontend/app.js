"use strict";

/* ==========================================================================
   Catálogo Musical — app.js
   Frontend em Vanilla JS consumindo o backend em http://localhost:3000
   ========================================================================== */

const API_BASE = "http://localhost:3000";

class ApiError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ApiError";
    this.cause = cause;
  }
}

const state = {
  user: null,
  sessionLoading: true,
  sessionError: "",
  connectionToastShown: false,
  activeTab: "explorar",
  results: [],
  lastTerm: "",
  favorites: [],
  favoriteIds: new Set(),
  favoritesLoaded: false,
  favoritesLoading: false,
  favoritesError: "",
  searchLoading: false,
};

const els = {
  auth: document.querySelector("#auth-area"),
  tabList: document.querySelector("#main-tabs"),
  tabs: Array.from(document.querySelectorAll("[data-tab]")),
  panels: {
    explorar: document.querySelector("#panel-explorar"),
    favoritos: document.querySelector("#panel-favoritos"),
  },
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchButton: document.querySelector("#search-button"),
  results: document.querySelector("#results"),
  resultsHead: document.querySelector("#results-head"),
  resultsTitle: document.querySelector("#results-title"),
  resultsMeta: document.querySelector("#results-meta"),
  favorites: document.querySelector("#favorites"),
  favoritesSub: document.querySelector("#favorites-sub"),
  favoritesCount: document.querySelector("#favorites-count"),
  refreshFavorites: document.querySelector("#refresh-favorites"),
  toasts: document.querySelector("#toasts"),
};

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function svgIcon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function hiResCover(url) {
  if (!url || typeof url !== "string") return "";
  return url.replace(/\/\d+x\d+bb\.(jpg|jpeg|png|webp)/i, "/600x600bb.$1");
}

function normalizeTrack(item) {
  return {
    musicaId: item.musicaId ?? "",
    titulo: item.titulo || "Título desconhecido",
    artista: item.artista || "Artista desconhecido",
    album: item.album || "Álbum não informado",
    capa: item.capa || "",
  };
}

function normalizeFavorite(item) {
  return {
    musicaId: item.musicaId ?? "",
    titulo: item.titulo || "Título desconhecido",
    artista: item.artista || "Artista desconhecido",
    album: item.album || "",
    capa: item.capa || "",
  };
}

/* --------------------------------------------------------------------------
   Camada de API
   — Todas as requisições usam credentials: "include" para manter a sessão.
   -------------------------------------------------------------------------- */

async function api(path, options = {}) {
  const { method = "GET", body, headers, ...rest } = options;
  const config = {
    method,
    ...rest,
    credentials: "include",
    headers: { ...(headers || {}) },
  };

  if (body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, config);
  } catch (cause) {
    throw new ApiError(
      "Não foi possível conectar ao servidor. Verifique se o backend está rodando em http://localhost:3000.",
      cause
    );
  }

  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    console.error(`[api] ${method} ${path} respondeu ${response.status}`, data);

    if (response.status === 401) {
      throw new ApiError("Você precisa entrar com o Google para continuar.");
    }

    throw new ApiError("O servidor não conseguiu concluir a operação. Tente novamente.");
  }

  if (data && !Array.isArray(data) && data.error) {
    console.error(`[api] ${method} ${path} retornou um erro`, data.error);
    throw new ApiError("O servidor não conseguiu concluir a operação. Tente novamente.");
  }

  return data;
}

/* --------------------------------------------------------------------------
   Toasts
   -------------------------------------------------------------------------- */

function toast(message, type = "info", duration = 4500) {
  if (!els.toasts) return;

  while (els.toasts.children.length >= 4) {
    els.toasts.firstElementChild.remove();
  }

  const element = document.createElement("div");
  element.className = `toast toast--${type}`;
  element.setAttribute("role", type === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = svgIcon(type === "success" ? "check" : type === "error" ? "alert" : "info");

  const text = document.createElement("p");
  text.textContent = message;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Fechar notificação");
  close.innerHTML = svgIcon("close");

  let timer = 0;

  const dismiss = () => {
    window.clearTimeout(timer);
    if (!element.isConnected || element.classList.contains("is-leaving")) return;
    element.classList.add("is-leaving");
    window.setTimeout(() => element.remove(), 220);
  };

  close.addEventListener("click", dismiss);
  element.append(icon, text, close);
  els.toasts.appendChild(element);

  timer = window.setTimeout(dismiss, duration);
}

/* --------------------------------------------------------------------------
   Autenticação
   -------------------------------------------------------------------------- */

function consumeAuthQuery() {
  const url = new URL(window.location.href);
  const success = url.searchParams.get("login") === "success";

  if (success) {
    url.searchParams.delete("login");
    window.history.replaceState(null, "", url.href);
  }

  return success;
}

function renderAuth() {
  if (!els.auth) return;

  if (state.sessionLoading) {
    els.auth.innerHTML = '<span class="auth-skeleton" aria-label="Verificando sessão"></span>';
    return;
  }

  if (state.user) {
    const name = state.user.displayName || "Usuário";
    const email = state.user.email || "";
    const photo = state.user.photo || "";

    els.auth.innerHTML = `
      <div class="user-chip">
        <span class="avatar" aria-hidden="true">
          <span class="avatar-initials">${escapeHTML(getInitials(name))}</span>
          ${photo ? `<img src="${escapeHTML(photo)}" alt="" referrerpolicy="no-referrer" />` : ""}
        </span>
        <span class="user-meta">
          <strong title="${escapeHTML(name)}">${escapeHTML(name)}</strong>
          ${email ? `<span title="${escapeHTML(email)}">${escapeHTML(email)}</span>` : ""}
        </span>
        <button type="button" class="icon-btn" id="logout-button" aria-label="Sair da conta" title="Sair">
          ${svgIcon("logout")}
        </button>
      </div>`;

    const avatarImage = els.auth.querySelector(".avatar img");
    avatarImage?.addEventListener("error", () => avatarImage.remove(), { once: true });
    els.auth.querySelector("#logout-button")?.addEventListener("click", handleLogout);
    return;
  }

  els.auth.innerHTML = `
    <a class="btn btn-google" href="${API_BASE}/auth/google" aria-label="Entrar com Google" title="Entrar com Google">
      ${svgIcon("google", "icon icon-google")}
      <span class="login-full">Entrar com Google</span>
      <span class="login-short">Entrar</span>
    </a>`;
}

async function checkSession() {
  state.sessionLoading = true;
  state.sessionError = "";
  renderAuth();

  try {
    const data = await api("/api/status");
    state.user = data && data.authenticated ? data.authenticated : null;
  } catch (error) {
    console.error("[sessão] Falha ao verificar a sessão:", error);
    state.user = null;
    state.sessionError = error.message;

    if (!state.connectionToastShown) {
      state.connectionToastShown = true;
      toast(error.message, "error", 6500);
    }
  } finally {
    state.sessionLoading = false;
    renderAuth();
    updateFavoritesCount();
    updateFavoritesSubtitle();

    if (state.user && state.activeTab === "favoritos" && !state.favoritesLoaded && !state.favoritesLoading) {
      loadFavorites();
    }
  }
}

async function handleLogout(event) {
  const button = event.currentTarget;
  button.disabled = true;
  button.classList.add("is-loading");

  try {
    await api("/api/logout");
    state.user = null;
    state.favorites = [];
    state.favoriteIds = new Set();
    state.favoritesLoaded = false;
    state.favoritesError = "";
    updateFavoritesCount();
    updateFavoritesSubtitle();
    syncFavoriteButtons();

    if (state.activeTab === "favoritos") {
      renderFavoritesLoginRequired();
    }

    renderAuth();
    toast("Você saiu da sua conta.", "info");
  } catch (error) {
    console.error("[logout] Falha ao sair:", error);
    button.disabled = false;
    button.classList.remove("is-loading");
    toast(error.message || "Não foi possível sair. Tente novamente.", "error");
  }
}

/* --------------------------------------------------------------------------
   Abas
   -------------------------------------------------------------------------- */

function switchTab(tab, { updateHash = true } = {}) {
  const nextTab = tab === "favoritos" ? "favoritos" : "explorar";
  const changed = state.activeTab !== nextTab;
  state.activeTab = nextTab;

  els.tabs.forEach((button) => {
    const active = button.dataset.tab === nextTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });

  Object.entries(els.panels).forEach(([name, panel]) => {
    panel.hidden = name !== nextTab;
  });

  if (updateHash) {
    const url = new URL(window.location.href);
    url.hash = nextTab === "favoritos" ? "favoritos" : "";
    window.history.replaceState(null, "", url.href);
  }

  if (nextTab === "favoritos") {
    if (!state.user) {
      renderFavoritesLoginRequired();
    } else if (state.favoritesLoaded) {
      renderFavorites();
    } else if (!state.favoritesLoading) {
      loadFavorites();
    }
  }

  if (changed) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/* --------------------------------------------------------------------------
   Busca
   -------------------------------------------------------------------------- */

function setSearchBusy(busy) {
  state.searchLoading = busy;
  els.searchButton.disabled = busy;
  els.searchButton.classList.toggle("is-loading", busy);

  const label = els.searchButton.querySelector(".btn-label");
  if (label) label.textContent = busy ? "Buscando" : "Buscar";

  if (busy) els.results.setAttribute("aria-busy", "true");
  else els.results.removeAttribute("aria-busy");
}

async function handleSearch(rawTerm) {
  const term = String(rawTerm ?? "").trim();

  if (!term) {
    toast("Digite o nome de uma música, artista ou álbum para buscar.", "info");
    els.searchInput.focus();
    return;
  }

  if (state.searchLoading) return;

  state.lastTerm = term;
  els.searchInput.value = term;
  els.panels.explorar.classList.add("is-search-active");
  els.resultsHead.hidden = true;
  setSearchBusy(true);
  renderSkeletons(els.results, 10);

  try {
    const data = await api(`/api/search?termo=${encodeURIComponent(term)}`);

    if (!Array.isArray(data)) {
      throw new ApiError("O servidor retornou uma resposta inesperada.");
    }

    const seen = new Set();

    state.results = data
      .filter((item) => item && typeof item === "object" && (item.musicaId != null || item.titulo))
      .map(normalizeTrack)
      .filter((item) => {
        const key = String(item.musicaId || item.titulo);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    renderResults();
  } catch (error) {
    console.error("[busca] Falha ao pesquisar:", error);
    state.results = [];
    renderSearchError(error.message);
    toast(error.message || "Não foi possível buscar músicas. Tente novamente.", "error");
  } finally {
    setSearchBusy(false);
  }
}

function renderResults() {
  const term = state.lastTerm;
  const count = state.results.length;

  els.resultsHead.hidden = false;
  els.resultsTitle.textContent = `Resultados para “${term}”`;
  els.resultsMeta.textContent = `${count} ${count === 1 ? "música" : "músicas"}`;

  if (!count) {
    renderStateCard(els.results, {
      icon: "search",
      title: "Nenhuma música encontrada",
      text: `Não encontramos resultados para “${term}”. Tente outro termo ou confira a ortografia.`,
    });
    return;
  }

  els.results.innerHTML = state.results.map((track, index) => musicCard(track, index)).join("");
  attachCoverFallbacks(els.results);
}

function renderSearchError(message) {
  els.resultsHead.hidden = true;

  renderStateCard(els.results, {
    type: "error",
    icon: "alert",
    title: "Não foi possível buscar",
    text: message || "Verifique sua conexão com o servidor e tente novamente.",
    action: "retry-search",
    actionLabel: "Tentar novamente",
  });
}

/* --------------------------------------------------------------------------
   Cards
   -------------------------------------------------------------------------- */

function musicCard(track, index = 0) {
  const id = track.musicaId == null ? "" : String(track.musicaId);
  const isFavorite = Boolean(id) && state.favoriteIds.has(id);
  const cover = hiResCover(track.capa);
  const title = track.titulo || "Título desconhecido";
  const artist = track.artista || "Artista desconhecido";
  const album = track.album || "Álbum não informado";
  const disabled = isFavorite || !id;
  const disabledTitle = !id ? ' title="Não foi possível identificar esta música"' : "";

  return `
    <article class="music-card" style="--i:${Math.min(index, 14)}">
      <div class="cover">
        <span class="cover-fallback" aria-hidden="true">${svgIcon("music")}</span>
        ${
          cover
            ? `<img src="${escapeHTML(cover)}" alt="Capa de ${escapeHTML(title)}" loading="lazy" decoding="async" data-cover />`
            : ""
        }
      </div>
      <div class="card-body">
        <h3 class="card-title" title="${escapeHTML(title)}">${escapeHTML(title)}</h3>
        <p class="card-artist" title="${escapeHTML(artist)}">${escapeHTML(artist)}</p>
        <p class="card-album" title="${escapeHTML(album)}">${escapeHTML(album)}</p>
        <button
          type="button"
          class="btn-fav${isFavorite ? " is-fav" : ""}"
          data-action="favorite"
          data-id="${escapeHTML(id)}"
          aria-pressed="${isFavorite ? "true" : "false"}"
          ${disabled ? "disabled" : ""}${disabledTitle}
        >
          ${svgIcon("heart")}
          <span>${isFavorite ? "Favoritada" : "Favoritar"}</span>
        </button>
      </div>
    </article>`;
}

function attachCoverFallbacks(container) {
  container.querySelectorAll("img[data-cover]").forEach((image) => {
    const removeBrokenImage = () => image.remove();

    if (image.complete && image.naturalWidth === 0) {
      removeBrokenImage();
    } else {
      image.addEventListener("error", removeBrokenImage, { once: true });
    }
  });
}

function renderSkeletons(container, count) {
  container.innerHTML = Array.from(
    { length: count },
    () => `
      <div class="music-card skeleton-card" aria-hidden="true">
        <div class="cover skeleton"></div>
        <div class="card-body">
          <div class="skeleton skeleton-line" style="width: 78%"></div>
          <div class="skeleton skeleton-line" style="width: 52%"></div>
          <div class="skeleton skeleton-line" style="width: 64%"></div>
          <div class="skeleton skeleton-btn"></div>
        </div>
      </div>`
  ).join("");
}

function renderStateCard(container, { type = "empty", icon = "music", title, text, action, actionLabel }) {
  container.innerHTML = "";

  const card = document.createElement("div");
  card.className = `state-card${type === "error" ? " state-card--error" : ""}`;

  const iconWrap = document.createElement("span");
  iconWrap.className = "state-icon";
  iconWrap.setAttribute("aria-hidden", "true");
  iconWrap.innerHTML = svgIcon(icon);

  const heading = document.createElement("h2");
  heading.textContent = title;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  card.append(iconWrap, heading, paragraph);

  if (action && actionLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary";
    button.dataset.action = action;
    button.textContent = actionLabel;
    card.appendChild(button);
  }

  container.appendChild(card);
}

/* --------------------------------------------------------------------------
   Favoritos
   -------------------------------------------------------------------------- */

async function loadFavorites({ silent = false } = {}) {
  if (state.favoritesLoading) return false;

  if (!state.user) {
    state.favorites = [];
    state.favoriteIds = new Set();
    state.favoritesLoaded = false;
    state.favoritesError = "";
    updateFavoritesCount();
    updateFavoritesSubtitle();

    if (state.activeTab === "favoritos") {
      renderFavoritesLoginRequired();
    }

    return false;
  }

  state.favoritesLoading = true;
  updateFavoritesSubtitle();

  if (!silent) {
    els.favorites.setAttribute("aria-busy", "true");
    renderSkeletons(els.favorites, 4);
  }

  try {
    const data = await api("/favoritos");

    if (!Array.isArray(data)) {
      throw new ApiError("O servidor retornou uma resposta inesperada.");
    }

    const previous = new Map(state.favorites.map((item) => [String(item.musicaId), item]));
    const seen = new Set();

    state.favorites = data
      .filter((item) => item && item.musicaId != null)
      .map((item) => {
        const favorite = normalizeFavorite(item);
        const previousItem = previous.get(String(favorite.musicaId));

        return {
          ...favorite,
          album: favorite.album || previousItem?.album || "",
          capa: favorite.capa || previousItem?.capa || "",
        };
      })
      .filter((item) => {
        const id = String(item.musicaId);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

    state.favoriteIds = new Set(state.favorites.map((item) => String(item.musicaId)));
    state.favoritesLoaded = true;
    state.favoritesError = "";

    if (!silent || state.activeTab === "favoritos") {
      renderFavorites();
    }

    syncFavoriteButtons();
    return true;
  } catch (error) {
    console.error("[favoritos] Falha ao carregar:", error);
    state.favoritesError = error.message;

    if (!silent) {
      if (state.favorites.length) {
        toast("Não foi possível atualizar seus favoritos. Exibindo a última lista carregada.", "error");
        renderFavorites();
      } else {
        renderFavoritesError();
      }
    }

    return false;
  } finally {
    state.favoritesLoading = false;
    els.favorites.removeAttribute("aria-busy");
    updateFavoritesCount();
    updateFavoritesSubtitle();
  }
}

function renderFavorites() {
  if (!state.user) {
    renderFavoritesLoginRequired();
    return;
  }

  if (!state.favorites.length) {
    if (state.favoritesError) {
      renderFavoritesError();
      return;
    }

    renderStateCard(els.favorites, {
      icon: "heart",
      title: "Sua coleção está vazia",
      text: "Encontre músicas que você ama e toque em “Favoritar” para salvá-las aqui.",
      action: "go-explore",
      actionLabel: "Explorar músicas",
    });
    return;
  }

  els.favorites.innerHTML = state.favorites.map((track, index) => musicCard(track, index)).join("");
  attachCoverFallbacks(els.favorites);
}

function renderFavoritesError() {
  renderStateCard(els.favorites, {
    type: "error",
    icon: "alert",
    title: "Não foi possível carregar seus favoritos",
    text: state.favoritesError || "Verifique sua conexão com o servidor e tente novamente.",
    action: "retry-favorites",
    actionLabel: "Tentar novamente",
  });
}

function renderFavoritesLoginRequired() {
  renderStateCard(els.favorites, {
    icon: "heart",
    title: "Entre para ver seus favoritos",
    text: "Faça login com o Google para salvar músicas e acessar sua coleção.",
    action: "login",
    actionLabel: "Entrar com Google",
  });
}

async function addFavorite(track, button) {
  const id = String(track.musicaId ?? "");
  if (!id || state.favoriteIds.has(id)) return;

  if (!state.user) {
    toast("Entre com o Google para favoritar músicas.", "info");
    return;
  }

  const label = button.querySelector("span");
  const previousLabel = label ? label.textContent : "";

  button.disabled = true;
  button.classList.add("is-loading");
  if (label) label.textContent = "Salvando…";

  try {
    const saved = await api("/favoritos", {
      method: "POST",
      body: {
        musicaId: track.musicaId,
        titulo: track.titulo,
        artista: track.artista,
        album: track.album,
        capa: track.capa,
      },
    });

    state.favoriteIds.add(id);

    if (!state.favorites.some((item) => String(item.musicaId) === id)) {
      const favorite = normalizeFavorite({
        musicaId: saved?.musicaId ?? track.musicaId,
        titulo: saved?.titulo || track.titulo,
        artista: saved?.artista || track.artista,
        album: track.album || saved?.album,
        capa: track.capa || saved?.capa,
      });

      state.favorites = [favorite, ...state.favorites];
    }

    state.favoritesLoaded = true;
    state.favoritesError = "";
    updateFavoritesCount();
    updateFavoritesSubtitle();

    if (state.activeTab === "favoritos") {
      renderFavorites();
    }

    button.classList.remove("is-loading");
    syncFavoriteButtons();
    toast(`“${track.titulo}” foi adicionada aos favoritos.`, "success");

    // Revalida a lista com o backend em segundo plano.
    loadFavorites({ silent: true });
  } catch (error) {
    console.error("[favoritos] Falha ao salvar:", error);
    button.disabled = false;
    button.classList.remove("is-loading");
    if (label) label.textContent = previousLabel || "Favoritar";
    toast(error.message || "Não foi possível adicionar aos favoritos. Tente novamente.", "error");
  }
}

function syncFavoriteButtons() {
  document.querySelectorAll('[data-action="favorite"]').forEach((button) => {
    if (button.classList.contains("is-loading")) return;

    const id = button.dataset.id;
    const isFavorite = Boolean(id) && state.favoriteIds.has(id);

    button.classList.toggle("is-fav", isFavorite);
    button.disabled = isFavorite || !id;
    button.setAttribute("aria-pressed", String(isFavorite));

    const label = button.querySelector("span");
    if (label) label.textContent = isFavorite ? "Favoritada" : "Favoritar";
  });
}

function updateFavoritesCount() {
  if (!els.favoritesCount) return;

  const count = state.user ? state.favorites.length : 0;
  els.favoritesCount.textContent = count > 99 ? "99+" : String(count);
  els.favoritesCount.classList.toggle("is-zero", count === 0);
}

function updateFavoritesSubtitle() {
  if (!els.favoritesSub) return;

  if (!state.user) {
    els.favoritesSub.textContent = state.sessionLoading
      ? "Verificando sua sessão..."
      : "Entre com o Google para ver sua coleção.";
    return;
  }

  const count = state.favorites.length;

  if (state.favoritesLoading && !count) {
    els.favoritesSub.textContent = "Carregando sua coleção...";
    return;
  }

  if (count === 0) {
    els.favoritesSub.textContent = "As músicas que você salvar aparecerão aqui.";
  } else if (count === 1) {
    els.favoritesSub.textContent = "1 música salva na sua coleção.";
  } else {
    els.favoritesSub.textContent = `${count} músicas salvas na sua coleção.`;
  }
}

/* --------------------------------------------------------------------------
   Eventos
   -------------------------------------------------------------------------- */

function handleDelegatedClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const actionElement = target?.closest("[data-action]");

  if (!actionElement) return;

  const { action } = actionElement.dataset;

  if (action === "favorite") {
    const id = actionElement.dataset.id;
    if (!id || state.favoriteIds.has(id)) return;

    const track = [...state.results, ...state.favorites].find((item) => String(item.musicaId) === id);
    if (track) addFavorite(track, actionElement);
    return;
  }

  if (action === "login") {
    window.location.href = `${API_BASE}/auth/google`;
    return;
  }

  if (action === "go-explore") {
    switchTab("explorar");
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => els.searchInput.focus({ preventScroll: true }), 250);
    return;
  }

  if (action === "retry-search") {
    if (state.lastTerm) handleSearch(state.lastTerm);
    return;
  }

  if (action === "retry-favorites") {
    loadFavorites();
  }
}

function bindEvents() {
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSearch(els.searchInput.value);
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  els.tabList.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();

    const currentIndex = els.tabs.findIndex((tab) => tab.dataset.tab === state.activeTab);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + offset + els.tabs.length) % els.tabs.length;
    const nextTab = els.tabs[nextIndex];

    nextTab.focus();
    switchTab(nextTab.dataset.tab);
  });

  document.querySelectorAll("[data-term]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const term = chip.dataset.term;
      els.searchInput.value = term;
      handleSearch(term);
    });
  });

  els.refreshFavorites.addEventListener("click", async () => {
    if (state.favoritesLoading) return;

    els.refreshFavorites.disabled = true;
    els.refreshFavorites.classList.add("is-loading");

    const success = await loadFavorites();

    els.refreshFavorites.disabled = false;
    els.refreshFavorites.classList.remove("is-loading");

    if (success) toast("Favoritos atualizados.", "success", 2600);
  });

  document.querySelector(".brand")?.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab("explorar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.addEventListener("click", handleDelegatedClick);

  window.addEventListener("hashchange", () => {
    const tab = window.location.hash === "#favoritos" ? "favoritos" : "explorar";
    if (tab !== state.activeTab) switchTab(tab, { updateHash: false });
  });
}

/* --------------------------------------------------------------------------
   Inicialização
   -------------------------------------------------------------------------- */

async function init() {
  bindEvents();

  const loginSuccess = consumeAuthQuery();

  renderAuth();
  updateFavoritesCount();
  updateFavoritesSubtitle();

  await checkSession();

  if (window.location.hash === "#favoritos") {
    switchTab("favoritos", { updateHash: false });
  } else if (state.user) {
    loadFavorites({ silent: true });
  }

  if (loginSuccess) {
    if (state.user) {
      const firstName = String(state.user.displayName || "")
        .trim()
        .split(/\s+/)[0];

      toast(
        firstName ? `Bem-vindo(a), ${firstName}! Login realizado com sucesso.` : "Login realizado com sucesso.",
        "success",
        5000
      );
    } else if (!state.sessionError) {
      toast("Não foi possível confirmar o login. Tente novamente.", "error", 6000);
    }
  }
}

init().catch((error) => {
  console.error("[init] Erro inesperado:", error);
  toast("Ocorreu um erro inesperado. Recarregue a página.", "error", 6000);
});
