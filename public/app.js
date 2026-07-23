const state = {
  files: [],
  limits: null,
  pendingDelete: null,
  queue: [],
  query: "",
  totalBytes: 0,
  uploading: false,
};

const elements = {
  appView: document.querySelector("#app-view"),
  chooseButton: document.querySelector("#choose-button"),
  confirmDelete: document.querySelector("#confirm-delete"),
  deleteDialog: document.querySelector("#delete-dialog"),
  deleteFilename: document.querySelector("#delete-filename"),
  dropZone: document.querySelector("#drop-zone"),
  fileCount: document.querySelector("#file-count"),
  fileInput: document.querySelector("#file-input"),
  fileLimit: document.querySelector("#file-limit"),
  loginButton: document.querySelector("#login-button"),
  loginError: document.querySelector("#login-error"),
  loginForm: document.querySelector("#login-form"),
  loginView: document.querySelector("#login-view"),
  logoutButton: document.querySelector("#logout-button"),
  password: document.querySelector("#password"),
  resourceList: document.querySelector("#resource-list"),
  resourceSummary: document.querySelector("#resource-summary"),
  searchInput: document.querySelector("#search-input"),
  storageUsed: document.querySelector("#storage-used"),
  toastRegion: document.querySelector("#toast-region"),
  togglePassword: document.querySelector("#toggle-password"),
  uploadQueue: document.querySelector("#upload-queue"),
};

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`;
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.kind = kind;
  toast.innerHTML = `<i data-lucide="${kind === "error" ? "circle-alert" : "circle-check"}"></i><span>${escapeHtml(message)}</span>`;
  elements.toastRegion.append(toast);
  refreshIcons();
  window.setTimeout(() => toast.remove(), 3200);
}

async function api(path, options = {}) {
  const request = { credentials: "same-origin", ...options };
  request.headers = new Headers(request.headers || {});
  if (request.body && !(request.body instanceof FormData)) {
    request.headers.set("content-type", "application/json");
  }
  if (request.method && request.method !== "GET") {
    request.headers.set("x-quickdrop-request", "1");
  }

  const response = await fetch(path, request);
  if (response.status === 401 && path !== "/api/login") showLogin();
  return response;
}

function showLogin() {
  elements.appView.hidden = true;
  elements.loginView.hidden = false;
  elements.password.value = "";
  elements.password.focus();
  refreshIcons();
}

function showApp() {
  elements.loginView.hidden = true;
  elements.appView.hidden = false;
  refreshIcons();
}

async function loadFiles() {
  const response = await api("/api/files");
  if (!response.ok) return;
  const payload = await response.json();
  state.files = payload.files;
  state.totalBytes = payload.totalBytes;
  state.limits = payload.limits;
  renderStats();
  renderFiles();
}

function renderStats() {
  elements.fileCount.textContent = String(state.files.length);
  elements.storageUsed.textContent = formatBytes(state.totalBytes);
  elements.fileLimit.textContent = state.limits ? `${state.limits.maxFileSizeMb} MB` : "--";
  elements.resourceSummary.textContent = `${state.files.length} 个文件`;
}

function iconForFile(file) {
  if (file.contentType.startsWith("image/")) return "image";
  if (file.contentType.startsWith("video/")) return "film";
  if (file.contentType.startsWith("audio/")) return "audio-lines";
  if (file.contentType === "application/pdf") return "file-text";
  if (file.contentType.includes("zip") || file.contentType.includes("compressed")) return "archive";
  return "file";
}

function renderFiles() {
  const normalizedQuery = state.query.trim().toLocaleLowerCase("zh-CN");
  const visibleFiles = state.files.filter((file) =>
    file.originalName.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
  );

  if (!visibleFiles.length) {
    const searching = Boolean(normalizedQuery);
    elements.resourceList.innerHTML = `
      <div class="empty-state">
        <div>
          <span class="empty-icon"><i data-lucide="${searching ? "search-x" : "inbox"}"></i></span>
          <h3>${searching ? "没有匹配的资源" : "资源库为空"}</h3>
          <p>${searching ? "试试其他文件名" : "上传后，资源会出现在这里"}</p>
        </div>
      </div>`;
    refreshIcons();
    return;
  }

  elements.resourceList.innerHTML = `
    <div class="resource-header" aria-hidden="true">
      <span>文件</span><span>大小</span><span>上传时间</span><span>操作</span>
    </div>
    ${visibleFiles
      .map((file) => {
        const safeName = escapeHtml(file.originalName);
        const safeUrl = escapeHtml(file.url);
        const preview = file.contentType.startsWith("image/")
          ? `<img src="${safeUrl}" alt="" loading="lazy" />`
          : `<i data-lucide="${iconForFile(file)}"></i>`;
        return `
          <article class="resource-row" data-file-id="${file.id}">
            <div class="file-main">
              <span class="file-preview">${preview}</span>
              <div class="file-copy">
                <a class="file-name" href="${safeUrl}" target="_blank" rel="noopener">${safeName}</a>
                <span class="file-url">${safeUrl}</span>
              </div>
            </div>
            <span class="file-meta file-size">${formatBytes(file.size)}</span>
            <time class="file-meta file-date" datetime="${escapeHtml(file.uploadedAt)}">${formatDate(file.uploadedAt)}</time>
            <div class="row-actions">
              <button class="icon-button copy-action" type="button" data-action="copy" aria-label="复制链接" title="复制链接"><i data-lucide="copy"></i></button>
              <a class="icon-button open-action" href="${safeUrl}" target="_blank" rel="noopener" aria-label="打开资源" title="打开资源"><i data-lucide="external-link"></i></a>
              <button class="icon-button delete-action" type="button" data-action="delete" aria-label="删除资源" title="删除资源"><i data-lucide="trash-2"></i></button>
            </div>
          </article>`;
      })
      .join("")}`;
  refreshIcons();
}

function queueStatus(item) {
  if (item.status === "waiting") return "等待中";
  if (item.status === "done") return "已完成";
  if (item.status === "error") return item.error || "上传失败";
  return `${item.progress}%`;
}

function renderQueue() {
  elements.uploadQueue.hidden = state.queue.length === 0;
  elements.uploadQueue.innerHTML = state.queue
    .map(
      (item) => `
        <div class="queue-row">
          <span class="queue-icon"><i data-lucide="${item.status === "done" ? "check" : item.status === "error" ? "circle-alert" : "file-up"}"></i></span>
          <div class="queue-name">
            <strong>${escapeHtml(item.file.name)}</strong>
            <span>${formatBytes(item.file.size)}</span>
          </div>
          <progress max="100" value="${item.progress}">${item.progress}%</progress>
          <span class="queue-status${item.status === "error" ? " is-error" : ""}">${escapeHtml(queueStatus(item))}</span>
        </div>`,
    )
    .join("");
  refreshIcons();
}

function uploadOne(item) {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("files", item.file, item.file.name);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
    request.setRequestHeader("X-QuickDrop-Request", "1");
    request.withCredentials = true;

    item.status = "uploading";
    renderQueue();

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      item.progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      renderQueue();
    });

    request.addEventListener("load", () => {
      let payload = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }

      if (request.status === 201) {
        item.status = "done";
        item.progress = 100;
        state.files.unshift(...payload.files);
        state.totalBytes += payload.files.reduce((total, file) => total + file.size, 0);
        renderStats();
        renderFiles();
      } else {
        item.status = "error";
        item.error = payload?.error?.message || "上传失败";
        if (request.status === 401) showLogin();
      }
      renderQueue();
      resolve(item.status === "done");
    });

    request.addEventListener("error", () => {
      item.status = "error";
      item.error = "网络连接失败";
      renderQueue();
      resolve(false);
    });

    request.send(form);
  });
}

async function processQueue() {
  if (state.uploading) return;
  state.uploading = true;
  let uploaded = 0;
  for (const item of state.queue.filter((entry) => entry.status === "waiting")) {
    if (await uploadOne(item)) uploaded += 1;
  }
  state.uploading = false;
  if (uploaded) showToast(`已上传 ${uploaded} 个文件`);
  if (state.queue.some((item) => item.status === "waiting")) {
    processQueue();
    return;
  }
  window.setTimeout(() => {
    state.queue = state.queue.filter((item) => item.status !== "done");
    renderQueue();
  }, 2200);
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const maxBytes = state.limits ? state.limits.maxFileSizeMb * 1024 * 1024 : Infinity;
  const accepted = [];
  for (const file of files) {
    if (file.size > maxBytes) {
      showToast(`${file.name} 超过单文件上限`, "error");
      continue;
    }
    accepted.push({
      file,
      id: `${Date.now()}-${Math.random()}`,
      progress: 0,
      status: "waiting",
    });
  }

  state.queue.push(...accepted);
  renderQueue();
  processQueue();
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const temporary = document.createElement("textarea");
    temporary.value = value;
    temporary.setAttribute("readonly", "");
    temporary.className = "sr-only";
    document.body.append(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginError.hidden = true;
  elements.loginButton.disabled = true;
  const response = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ password: elements.password.value }),
  });
  elements.loginButton.disabled = false;

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    elements.loginError.textContent = payload?.error?.message || "登录失败";
    elements.loginError.hidden = false;
    elements.password.select();
    return;
  }

  showApp();
  await loadFiles();
});

elements.togglePassword.addEventListener("click", () => {
  const showing = elements.password.type === "text";
  elements.password.type = showing ? "password" : "text";
  elements.togglePassword.setAttribute("aria-label", showing ? "显示密码" : "隐藏密码");
  elements.togglePassword.setAttribute("title", showing ? "显示密码" : "隐藏密码");
  elements.togglePassword.innerHTML = `<i data-lucide="${showing ? "eye" : "eye-off"}"></i>`;
  refreshIcons();
});

elements.logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showLogin();
});

elements.chooseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", () => {
  addFiles(elements.fileInput.files);
  elements.fileInput.value = "";
});

elements.dropZone.addEventListener("click", (event) => {
  if (!event.target.closest("button")) elements.fileInput.click();
});

elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
}

elements.dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

document.addEventListener("paste", (event) => {
  if (elements.appView.hidden) return;
  const files = event.clipboardData?.files;
  if (files?.length) addFiles(files);
});

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  renderFiles();
});

elements.resourceList.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]");
  const row = event.target.closest("[data-file-id]");
  if (!action || !row) return;
  const file = state.files.find((item) => item.id === row.dataset.fileId);
  if (!file) return;

  if (action.dataset.action === "copy") {
    await copyText(file.url);
    showToast("链接已复制");
  }

  if (action.dataset.action === "delete") {
    state.pendingDelete = file;
    elements.deleteFilename.textContent = file.originalName;
    elements.deleteDialog.showModal();
  }
});

elements.deleteDialog.addEventListener("close", async () => {
  if (elements.deleteDialog.returnValue !== "confirm" || !state.pendingDelete) {
    state.pendingDelete = null;
    return;
  }

  const file = state.pendingDelete;
  state.pendingDelete = null;
  const response = await api(`/api/files/${file.id}`, { method: "DELETE" });
  if (!response.ok) {
    showToast("删除失败", "error");
    return;
  }
  state.files = state.files.filter((item) => item.id !== file.id);
  state.totalBytes = Math.max(0, state.totalBytes - file.size);
  renderStats();
  renderFiles();
  showToast("资源已删除");
});

async function initialize() {
  refreshIcons();
  try {
    const response = await api("/api/session");
    const session = response.ok ? await response.json() : { authenticated: false };
    if (!session.authenticated) return showLogin();
    showApp();
    await loadFiles();
  } catch {
    showLogin();
    elements.loginError.textContent = "无法连接服务器";
    elements.loginError.hidden = false;
  }
}

initialize();
