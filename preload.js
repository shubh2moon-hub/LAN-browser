const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syncBrowser', {
  // ── Navigation ────────────────────────────────────
  navigate: (url) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),

  // ── Tabs ──────────────────────────────────────────
  newTab: (url) => ipcRenderer.send('new-tab', url),
  closeTab: (id) => ipcRenderer.send('close-tab', id),
  switchTab: (id) => ipcRenderer.send('switch-tab', id),

  // ── Connection / Sync ─────────────────────────────
  createRoom: () => ipcRenderer.send('create-room'),
  joinRoom: (ip, port) => ipcRenderer.send('join-room', ip, port),
  disconnect: () => ipcRenderer.send('disconnect'),
  getApkQrCode: () => ipcRenderer.invoke('get-apk-qrcode'),

  // ── PDF ───────────────────────────────────────────
  openPdf: () => ipcRenderer.send('open-pdf'),
  openPdfFromPath: (filePath) => ipcRenderer.send('open-pdf-path', filePath),
  openPdfFromFile: (file) => {
    const { webUtils } = require('electron');
    const path = webUtils ? webUtils.getPathForFile(file) : file.path;
    if (path) ipcRenderer.send('open-pdf-path', path);
  },

  // ── History ───────────────────────────────────────
  getHistory: () => ipcRenderer.invoke('get-history'),
  getRecentHistory: (count) => ipcRenderer.invoke('get-recent-history', count),
  searchHistory: (query) => ipcRenderer.invoke('search-history', query),
  suggestUrls: (query) => ipcRenderer.invoke('suggest-urls', query),
  deleteHistoryEntry: (id) => ipcRenderer.send('delete-history-entry', id),
  clearHistory: () => ipcRenderer.send('clear-history'),

  // ── Bookmarks ─────────────────────────────────────
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  isBookmarked: (url) => ipcRenderer.invoke('is-bookmarked', url),
  addBookmark: (data) => ipcRenderer.send('add-bookmark', data),
  removeBookmark: (url) => ipcRenderer.send('remove-bookmark', url),
  toggleBookmark: () => ipcRenderer.send('toggle-bookmark'),

  // ── Downloads ─────────────────────────────────────
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  openDownload: (id) => ipcRenderer.send('open-download', id),
  showDownloadInFolder: (id) => ipcRenderer.send('show-download-in-folder', id),
  clearDownloads: () => ipcRenderer.send('clear-downloads'),

  // ── Find in Page ──────────────────────────────────
  findInPage: (text, options) => ipcRenderer.send('find-in-page', text, options),
  stopFindInPage: (action) => ipcRenderer.send('stop-find-in-page', action),

  // ── Zoom ──────────────────────────────────────────
  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  zoomReset: () => ipcRenderer.send('zoom-reset'),

  // ── Listeners ─────────────────────────────────────
  onStateUpdate: (cb) => ipcRenderer.on('state-update', (_e, data) => cb(data)),
  onTabsChanged: (cb) => ipcRenderer.on('tabs-changed', (_e, data) => cb(data)),
  onPeersChanged: (cb) => ipcRenderer.on('peers-changed', (_e, data) => cb(data)),
  onDeviceDiscovered: (cb) => ipcRenderer.on('device-discovered', (_e, data) => cb(data)),
  onConnectionStatus: (cb) => ipcRenderer.on('connection-status', (_e, data) => cb(data)),
  onNavigated: (cb) => ipcRenderer.on('navigated', (_e, data) => cb(data)),
  onPageTitleUpdated: (cb) => ipcRenderer.on('page-title-updated', (_e, data) => cb(data)),
  onLoadingStateChanged: (cb) => ipcRenderer.on('loading-state-changed', (_e, data) => cb(data)),
  onBookmarkStateChanged: (cb) => ipcRenderer.on('bookmark-state-changed', (_e, data) => cb(data)),
  onFindResult: (cb) => ipcRenderer.on('find-result', (_e, data) => cb(data)),
  onZoomChanged: (cb) => ipcRenderer.on('zoom-changed', (_e, data) => cb(data)),
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_e, data) => cb(data)),
  onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (_e, data) => cb(data)),
  onDownloadDone: (cb) => ipcRenderer.on('download-done', (_e, data) => cb(data)),
  onFocusUrlBar: (cb) => ipcRenderer.on('focus-url-bar', () => cb()),
  onToggleHistory: (cb) => ipcRenderer.on('toggle-history', () => cb()),
  onToggleFind: (cb) => ipcRenderer.on('toggle-find', () => cb()),
  onToggleDownloads: (cb) => ipcRenderer.on('toggle-downloads', () => cb()),
  onCloseFind: (cb) => ipcRenderer.on('close-find', () => cb()),
});
