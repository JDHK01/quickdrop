const state = {
  files: [],
  limits: null,
  pendingDelete: null,
  pendingRename: null,
  query: "",
  renaming: false,
  totalBytes: 0,
  uploader: null,
  preview: {
    connected: false,
    dirty: false,
    eventSource: null,
    pendingRemote: null,
    reconnectTimer: null,
    saveTimer: null,
    saving: false,
    text: "",
    version: 0,
  },
};

const elements = {
  deleteDialog: document.querySelector("#delete-dialog"),
  deleteFilename: document.querySelector("#delete-filename"),
  fileCount: document.querySelector("#file-count"),
  fileInput: document.querySelector("#file-input"),
  previewClear: document.querySelector("#preview-clear"),
  previewCopy: document.querySelector("#preview-copy"),
  previewInput: document.querySelector("#preview-input"),
  previewMeta: document.querySelector("#preview-meta"),
  previewStatus: document.querySelector("#preview-status"),
  renameCancel: document.querySelector("#rename-cancel"),
  renameDialog: document.querySelector("#rename-dialog"),
  renameError: document.querySelector("#rename-error"),
  renameForm: document.querySelector("#rename-form"),
  renameInput: document.querySelector("#rename-input"),
  renameSubmit: document.querySelector("#rename-submit"),
  resourceList: document.querySelector("#resource-list"),
  resourceSummary: document.querySelector("#resource-summary"),
  searchInput: document.querySelector("#search-input"),
  storageUsed: document.querySelector("#storage-used"),
  toastRegion: document.querySelector("#toast-region"),
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
  const request = { ...options };
  request.headers = new Headers(request.headers || {});
  if (request.body && !(request.body instanceof FormData)) {
    request.headers.set("content-type", "application/json");
  }
  if (request.method && request.method !== "GET") {
    request.headers.set("x-quickdrop-request", "1");
  }
  return fetch(path, request);
}

async function loadFiles() {
  const response = await api("/api/files");
  if (!response.ok) throw new Error("Unable to load files");
  const payload = await response.json();
  state.files = payload.files;
  state.totalBytes = payload.totalBytes;
  state.limits = payload.limits;
  renderStats();
  renderFiles();
}

function setPreviewStatus(message, kind = "idle") {
  elements.previewStatus.textContent = message;
  elements.previewStatus.dataset.kind = kind;
}

function renderPreviewMeta() {
  const length = Array.from(elements.previewInput.value).length;
  elements.previewMeta.textContent = `${length} 字符`;
}

function applyPreview(preview) {
  state.preview.text = preview.text;
  state.preview.version = preview.version;
  state.preview.pendingRemote = null;
  state.preview.dirty = false;
  elements.previewInput.value = preview.text;
  renderPreviewMeta();
  setPreviewStatus(state.preview.connected ? "已同步" : "已保存", "success");
}

function receivePreview(preview) {
  if (!preview || typeof preview.text !== "string") return;
  if (preview.version <= state.preview.version) return;

  if (state.preview.dirty || state.preview.saving || document.activeElement === elements.previewInput) {
    state.preview.pendingRemote = preview;
    setPreviewStatus("远端有更新", "warning");
    return;
  }

  applyPreview(preview);
}

async function loadPreview() {
  const response = await api("/api/preview");
  if (!response.ok) throw new Error("Unable to load preview");
  const payload = await response.json();
  applyPreview(payload.preview);
}

function connectPreview() {
  if (state.preview.eventSource) return;
  const source = new EventSource("/api/preview/events");
  state.preview.eventSource = source;
  source.onopen = () => {
    state.preview.connected = true;
    setPreviewStatus("实时连接", "success");
  };
  source.addEventListener("preview", (event) => {
    try {
      receivePreview(JSON.parse(event.data));
    } catch (error) {
      console.error("Invalid preview event", error);
    }
  });
  source.onerror = () => {
    if (state.preview.eventSource !== source) return;
    state.preview.connected = false;
    state.preview.eventSource = null;
    source.close();
    setPreviewStatus("重连中...", "warning");
    if (!state.preview.reconnectTimer) {
      state.preview.reconnectTimer = window.setTimeout(() => {
        state.preview.reconnectTimer = null;
        connectPreview();
      }, 3000);
    }
  };
}

function schedulePreviewSave() {
  window.clearTimeout(state.preview.saveTimer);
  state.preview.saveTimer = window.setTimeout(savePreview, 350);
}

async function savePreview() {
  state.preview.saveTimer = null;
  const text = elements.previewInput.value;
  state.preview.saving = true;
  setPreviewStatus("同步中...", "syncing");

  try {
    const response = await api("/api/preview", {
      method: "PUT",
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setPreviewStatus(payload?.error?.message || "同步失败", "error");
      return;
    }

    const preview = (await response.json()).preview;
    if (elements.previewInput.value !== text) {
      state.preview.dirty = true;
      schedulePreviewSave();
      return;
    }

    state.preview.text = preview.text;
    state.preview.version = preview.version;
    state.preview.pendingRemote = null;
    state.preview.dirty = false;
    setPreviewStatus(state.preview.connected ? "已同步" : "已保存", "success");
  } catch (error) {
    console.error(error);
    setPreviewStatus("同步失败", "error");
  } finally {
    state.preview.saving = false;
  }
}

function renderStats() {
  elements.fileCount.textContent = String(state.files.length);
  elements.storageUsed.textContent = formatBytes(state.totalBytes);
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

function markdownForFile(file) {
  const label = file.originalName
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
  const url = file.url.replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `${file.contentType.startsWith("image/") ? "!" : ""}[${label}](${url})`;
}

function setRenameError(message = "") {
  elements.renameError.textContent = message;
  elements.renameError.hidden = !message;
  elements.renameInput.setAttribute("aria-invalid", String(Boolean(message)));
}

function setRenameBusy(busy) {
  state.renaming = busy;
  elements.renameForm.toggleAttribute("aria-busy", busy);
  elements.renameInput.disabled = busy;
  elements.renameCancel.disabled = busy;
  elements.renameSubmit.disabled = busy;
  elements.renameSubmit.textContent = busy ? "保存中..." : "保存";
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
              <button class="icon-button markdown-action" type="button" data-action="copy-markdown" aria-label="复制 Markdown" title="复制 Markdown"><i data-lucide="clipboard-copy"></i></button>
              <a class="icon-button open-action" href="${safeUrl}" target="_blank" rel="noopener" aria-label="打开资源" title="打开资源"><i data-lucide="external-link"></i></a>
              <button class="icon-button rename-action" type="button" data-action="rename" aria-label="重命名资源" title="重命名资源"><i data-lucide="pencil"></i></button>
              <button class="icon-button delete-action" type="button" data-action="delete" aria-label="删除资源" title="删除资源"><i data-lucide="trash-2"></i></button>
            </div>
          </article>`;
      })
      .join("")}`;
  refreshIcons();
}

function handleFilePaste(event) {
  if (!state.uploader) return;
  const items = Array.from(event.clipboardData?.items || []);
  const files = items
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);
  const fallbackFiles = files.length ? files : Array.from(event.clipboardData?.files || []);
  if (!fallbackFiles.length) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  state.uploader.addFiles(fallbackFiles).catch((error) => {
    console.error(error);
    showToast("粘贴上传失败", "error");
  });
}

document.addEventListener("paste", handleFilePaste, true);

function initializeUploader() {
  if (!window.FilePond) {
    throw new Error("FilePond failed to load");
  }

  const maxFiles = state.limits?.maxFiles || 10;
  state.uploader = window.FilePond.create(elements.fileInput, {
    allowBrowse: true,
    allowDrop: true,
    allowMultiple: true,
    allowPaste: true,
    allowRevert: false,
    credits: false,
    instantUpload: true,
    maxFiles,
    maxParallelUploads: 2,
    labelIdle:
      '<span class="filepond-main-label">拖放文件到这里</span><span class="filepond-sub-label">或 <span class="filepond--label-action">选择文件</span>，也支持粘贴</span>',
    labelInvalidField: "包含无效文件",
    labelFileWaitingForSize: "正在读取大小",
    labelFileSizeNotAvailable: "大小不可用",
    labelFileProcessing: "上传中",
    labelFileProcessingComplete: "上传完成",
    labelFileProcessingAborted: "上传已取消",
    labelFileProcessingError: "上传失败",
    labelFileRemoveError: "移除失败",
    labelTapToCancel: "点击取消",
    labelTapToRetry: "点击重试",
    labelButtonRemoveItem: "移除",
    labelButtonAbortItemProcessing: "取消上传",
    labelButtonRetryItemProcessing: "重试上传",
    server: {
      process: {
        url: "/api/files",
        method: "POST",
        headers: { "X-QuickDrop-Request": "1" },
        onload: (response) => {
          const payload = JSON.parse(response);
          return payload.files[0].id;
        },
        onerror: (response) => {
          try {
            return JSON.parse(response).error?.message || "上传失败";
          } catch {
            return "上传失败";
          }
        },
      },
    },
    onprocessfile: async (error, file) => {
      if (error) {
        showToast(error.body || "上传失败", "error");
        return;
      }
      await loadFiles();
      showToast(`${file.filename} 已上传`);
      window.setTimeout(() => state.uploader?.removeFile(file.id, { revert: false }), 1400);
    },
  });
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

elements.previewInput.addEventListener("input", () => {
  state.preview.dirty = true;
  renderPreviewMeta();
  setPreviewStatus("等待同步...", "syncing");
  schedulePreviewSave();
});

elements.previewInput.addEventListener("blur", () => {
  if (state.preview.pendingRemote && !state.preview.dirty && !state.preview.saving) {
    applyPreview(state.preview.pendingRemote);
  }
});

elements.previewCopy.addEventListener("click", async () => {
  await copyText(elements.previewInput.value);
  showToast("预览内容已复制");
});

elements.previewClear.addEventListener("click", () => {
  window.clearTimeout(state.preview.saveTimer);
  state.preview.saveTimer = null;
  elements.previewInput.value = "";
  state.preview.dirty = true;
  renderPreviewMeta();
  void savePreview();
  elements.previewInput.focus();
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
    return;
  }

  if (action.dataset.action === "copy-markdown") {
    await copyText(markdownForFile(file));
    showToast("Markdown 已复制");
    return;
  }

  if (action.dataset.action === "rename") {
    state.pendingRename = file;
    setRenameError();
    setRenameBusy(false);
    elements.renameInput.value = file.originalName;
    elements.renameDialog.returnValue = "";
    elements.renameDialog.showModal();
    elements.renameInput.focus();
    elements.renameInput.select();
  }

  if (action.dataset.action === "delete") {
    state.pendingDelete = file;
    elements.deleteFilename.textContent = file.originalName;
    elements.deleteDialog.returnValue = "";
    elements.deleteDialog.showModal();
  }
});

elements.renameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.renaming || !state.pendingRename) return;

  const originalName = elements.renameInput.value.trim();
  if (!originalName) {
    setRenameError("文件名不能为空");
    elements.renameInput.focus();
    return;
  }

  const file = state.pendingRename;
  setRenameError();
  setRenameBusy(true);

  try {
    const response = await api(`/api/files/${file.id}`, {
      method: "PATCH",
      body: JSON.stringify({ originalName }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setRenameError(payload?.error?.message || "重命名失败，请稍后重试");
      return;
    }

    const updated = (await response.json()).file;
    state.files = state.files.map((item) => (item.id === updated.id ? updated : item));
    renderFiles();
    elements.renameDialog.close("confirm");
    showToast("资源名称和链接已更新");
  } catch (error) {
    console.error(error);
    setRenameError("无法连接服务器，请稍后重试");
  } finally {
    if (elements.renameDialog.open) setRenameBusy(false);
  }
});

elements.renameInput.addEventListener("input", () => setRenameError());

elements.renameCancel.addEventListener("click", () => {
  if (!state.renaming) elements.renameDialog.close("cancel");
});

elements.renameDialog.addEventListener("cancel", (event) => {
  if (state.renaming) event.preventDefault();
});

elements.renameDialog.addEventListener("close", () => {
  state.pendingRename = null;
  setRenameBusy(false);
  setRenameError();
  elements.renameForm.reset();
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
    await loadFiles();
  } catch (error) {
    console.error(error);
    showToast("无法连接服务器", "error");
  }
  try {
    await loadPreview();
    connectPreview();
  } catch (error) {
    console.error(error);
    setPreviewStatus("无法连接", "error");
  }
  try {
    initializeUploader();
  } catch (error) {
    console.error(error);
    showToast("上传组件加载失败", "error");
  }
}

initialize();
