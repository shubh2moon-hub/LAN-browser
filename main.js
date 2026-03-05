const { app, BrowserWindow, BrowserView, ipcMain, dialog, globalShortcut, session } = require('electron');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const SyncEngine = require('./sync/engine');
const DiscoveryService = require('./sync/discovery');
const HistoryStore = require('./data/history-store');
const BookmarksStore = require('./data/bookmarks-store');
const DownloadsStore = require('./data/downloads-store');

// ── State ────────────────────────────────────────────
let mainWindow = null;
let syncEngine = null;
let discovery = null;
let historyStore = null;
let bookmarksStore = null;
let downloadsStore = null;

const HOME_URL = 'lan://newtab';
let tabs = [];
let activeTabId = null;
const TOOLBAR_HEIGHT = 100;

// Recently closed tabs (for Ctrl+Shift+T)
let recentlyClosed = []; // { url, title }

// ── App Ready ────────────────────────────────────────

app.whenReady().then(() => {
    // Init data stores
    historyStore = new HistoryStore();
    bookmarksStore = new BookmarksStore();
    downloadsStore = new DownloadsStore();

    createMainWindow();
    initSyncEngine();
    initDiscovery();
    registerShortcuts();

    // Setup download interception
    session.defaultSession.on('will-download', (_event, downloadItem) => {
        downloadsStore.trackDownload(downloadItem, null, (type, data) => {
            if (mainWindow) mainWindow.webContents.send(type, data);
        });
    });

    mainWindow.webContents.on('did-finish-load', () => {
        createTab(HOME_URL);
    });
});

// Globally intercept file:// PDF navigation
app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', async (e, navUrl) => {
        if (navUrl.startsWith('file://') && navUrl.toLowerCase().endsWith('.pdf')) {
            e.preventDefault();
            try {
                let filePath = require('url').fileURLToPath(navUrl);
                await handleOpenPdf(filePath);
            } catch (err) { }
        }
    });
    contents.setWindowOpenHandler(({ url: openUrl }) => {
        if (openUrl.startsWith('file://') && openUrl.toLowerCase().endsWith('.pdf')) {
            try {
                let filePath = require('url').fileURLToPath(openUrl);
                handleOpenPdf(filePath);
            } catch (err) { }
            return { action: 'deny' };
        }
        // Open other links in a new tab instead of popup
        if (openUrl && openUrl !== 'about:blank') {
            createTab(openUrl);
        }
        return { action: 'deny' };
    });
});

app.on('window-all-closed', () => {
    if (discovery) discovery.stop();
    if (syncEngine) syncEngine.disconnect();
    app.quit();
});

// ── Window ───────────────────────────────────────────

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        frame: false,
        icon: path.join(__dirname, 'renderer', 'assets', 'logo.png'),
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#111111',
            symbolColor: '#888888',
            height: 36,
        },
        backgroundColor: '#0a0a0a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('resize', () => resizeBrowserView());
    mainWindow.on('maximize', () => setTimeout(resizeBrowserView, 100));
    mainWindow.on('unmaximize', () => setTimeout(resizeBrowserView, 100));
}

// ── Keyboard Shortcuts ───────────────────────────────

function registerShortcuts() {
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const ctrl = input.control || input.meta;
        const shift = input.shift;
        const key = input.key.toLowerCase();

        if (input.type !== 'keyDown') return;

        // Ctrl+T → New Tab
        if (ctrl && !shift && key === 't') {
            event.preventDefault();
            createTab(HOME_URL);
        }
        // Ctrl+W → Close Tab
        if (ctrl && !shift && key === 'w') {
            event.preventDefault();
            if (activeTabId) closeTab(activeTabId);
        }
        // Ctrl+L → Focus URL bar
        if (ctrl && !shift && key === 'l') {
            event.preventDefault();
            mainWindow.webContents.send('focus-url-bar');
        }
        // Ctrl+Shift+T → Reopen last closed tab
        if (ctrl && shift && key === 't') {
            event.preventDefault();
            reopenClosedTab();
        }
        // Ctrl+H → Toggle history
        if (ctrl && !shift && key === 'h') {
            event.preventDefault();
            mainWindow.webContents.send('toggle-history');
        }
        // Ctrl+D → Toggle bookmark
        if (ctrl && !shift && key === 'd') {
            event.preventDefault();
            toggleBookmarkActiveTab();
        }
        // Ctrl+F → Find in page
        if (ctrl && !shift && key === 'f') {
            event.preventDefault();
            mainWindow.webContents.send('toggle-find');
        }
        // Ctrl+J → Downloads
        if (ctrl && !shift && key === 'j') {
            event.preventDefault();
            mainWindow.webContents.send('toggle-downloads');
        }
        // F5 → Reload
        if (key === 'f5') {
            event.preventDefault();
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.url !== HOME_URL) tab.view.webContents.reload();
        }
        // Ctrl+R → Reload
        if (ctrl && !shift && key === 'r') {
            event.preventDefault();
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.url !== HOME_URL) tab.view.webContents.reload();
        }
        // Escape → Stop find / stop loading
        if (key === 'escape') {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) tab.view.webContents.stopFindInPage('clearSelection');
            mainWindow.webContents.send('close-find');
        }
        // Ctrl+Plus → Zoom in
        if (ctrl && (key === '=' || key === '+')) {
            event.preventDefault();
            zoomActiveTab(0.1);
        }
        // Ctrl+Minus → Zoom out
        if (ctrl && key === '-') {
            event.preventDefault();
            zoomActiveTab(-0.1);
        }
        // Ctrl+0 → Reset zoom
        if (ctrl && key === '0') {
            event.preventDefault();
            resetZoomActiveTab();
        }
        // Ctrl+Tab → Next tab
        if (ctrl && !shift && key === 'tab') {
            event.preventDefault();
            cycleTab(1);
        }
        // Ctrl+Shift+Tab → Previous tab
        if (ctrl && shift && key === 'tab') {
            event.preventDefault();
            cycleTab(-1);
        }
    });
}

function cycleTab(direction) {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === activeTabId);
    let newIdx = idx + direction;
    if (newIdx >= tabs.length) newIdx = 0;
    if (newIdx < 0) newIdx = tabs.length - 1;
    switchToTab(tabs[newIdx].id);
}

function reopenClosedTab() {
    if (recentlyClosed.length === 0) return;
    const { url, title } = recentlyClosed.pop();
    createTab(url || HOME_URL);
}

function toggleBookmarkActiveTab() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.url === HOME_URL) return;
    if (bookmarksStore.isBookmarked(tab.url)) {
        bookmarksStore.remove(tab.url);
    } else {
        bookmarksStore.add(tab.url, tab.title, tab.favicon || '');
    }
    mainWindow.webContents.send('bookmark-state-changed', {
        url: tab.url,
        isBookmarked: bookmarksStore.isBookmarked(tab.url),
    });
}

function zoomActiveTab(delta) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const current = tab.view.webContents.getZoomFactor();
    const newZoom = Math.min(3, Math.max(0.3, current + delta));
    tab.view.webContents.setZoomFactor(newZoom);
    mainWindow.webContents.send('zoom-changed', { zoom: Math.round(newZoom * 100) });
}

function resetZoomActiveTab() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    tab.view.webContents.setZoomFactor(1);
    mainWindow.webContents.send('zoom-changed', { zoom: 100 });
}

// ── Tabs / BrowserView ───────────────────────────────

function createTab(url = HOME_URL, fromSync = false) {
    const id = uuidv4();
    const view = new BrowserView({
        webPreferences: {
            preload: path.join(__dirname, 'view-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const tab = { id, view, url, title: 'New Tab', favicon: '' };
    tabs.push(tab);

    // Track favicon
    view.webContents.on('page-favicon-updated', (_e, favicons) => {
        if (favicons && favicons.length > 0) {
            tab.favicon = favicons[0];
            sendTabsToRenderer();
            // Update bookmark favicon if bookmarked
            if (bookmarksStore && bookmarksStore.isBookmarked(tab.url)) {
                const bm = bookmarksStore.getAll().find(b => b.url === tab.url);
                if (bm) bookmarksStore.update(bm.id, { favicon: tab.favicon });
            }
        }
    });

    view.webContents.on('did-navigate', (_e, navUrl) => {
        tab.url = navUrl;
        tab.title = view.webContents.getTitle() || navUrl;
        sendTabsToRenderer();
        if (tab.id === activeTabId) {
            mainWindow.webContents.send('navigated', { url: navUrl });
            // Send bookmark state
            mainWindow.webContents.send('bookmark-state-changed', {
                url: navUrl,
                isBookmarked: bookmarksStore.isBookmarked(navUrl),
            });
        }
        // Add to history
        if (historyStore) {
            historyStore.addEntry(navUrl, tab.title, tab.favicon);
        }
        if (!fromSync) {
            syncEngine.sendState('url-change', { tabId: tab.id, url: navUrl, title: tab.title });
        }
    });

    view.webContents.on('will-navigate', (e, url) => {
        if (url.startsWith('file://') && url.toLowerCase().endsWith('.pdf')) {
            e.preventDefault();
            const filePath = decodeURIComponent(url.replace(/^file:\/\/\//i, '').replace(/\//g, '\\'));
            handleOpenPdf(filePath);
        }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('file://') && url.toLowerCase().endsWith('.pdf')) {
            const filePath = decodeURIComponent(url.replace(/^file:\/\/\//i, '').replace(/\//g, '\\'));
            handleOpenPdf(filePath);
            return { action: 'deny' };
        }
        // Open in new tab
        if (url && url !== 'about:blank') {
            createTab(url);
        }
        return { action: 'deny' };
    });

    view.webContents.on('did-navigate-in-page', (_e, navUrl) => {
        tab.url = navUrl;
        if (tab.id === activeTabId) {
            mainWindow.webContents.send('navigated', { url: navUrl });
        }
        if (!fromSync) {
            syncEngine.sendState('url-change', { tabId: tab.id, url: navUrl, title: tab.title });
        }
    });

    view.webContents.on('page-title-updated', (_e, title) => {
        tab.title = title;
        sendTabsToRenderer();
        // Update history entry title
        if (historyStore && tab.url) {
            historyStore.addEntry(tab.url, title, tab.favicon);
        }
        if (!fromSync && tab.id === activeTabId) {
            syncEngine.sendState('url-change', { tabId: tab.id, url: tab.url, title: tab.title });
        }
    });

    view.webContents.on('did-start-loading', () => {
        mainWindow.webContents.send('loading-state-changed', { loading: true });
    });

    view.webContents.on('did-stop-loading', () => {
        mainWindow.webContents.send('loading-state-changed', { loading: false });
    });

    // Forward find-in-page results
    view.webContents.on('found-in-page', (_e, result) => {
        mainWindow.webContents.send('find-result', {
            activeMatchOrdinal: result.activeMatchOrdinal,
            matches: result.matches,
            finalUpdate: result.finalUpdate,
        });
    });

    switchToTab(id);

    if (url && url !== HOME_URL) {
        view.webContents.loadURL(url);
    }

    if (!fromSync) {
        syncEngine.sendState('tab-create', { tabId: id, url });
    }

    return id;
}

function closeTab(id, fromSync = false) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const tab = tabs[idx];

    // Save to recently closed
    if (tab.url && tab.url !== HOME_URL) {
        recentlyClosed.push({ url: tab.url, title: tab.title });
        if (recentlyClosed.length > 20) recentlyClosed.shift();
    }

    if (activeTabId === id) {
        mainWindow.removeBrowserView(tab.view);
    }

    tab.view.webContents.close();
    tabs.splice(idx, 1);

    if (tabs.length === 0) {
        createTab(HOME_URL);
    } else if (activeTabId === id) {
        const newIdx = Math.min(idx, tabs.length - 1);
        switchToTab(tabs[newIdx].id);
    }

    sendTabsToRenderer();

    if (!fromSync) {
        syncEngine.sendState('tab-close', { tabId: id });
    }
}

function switchToTab(id, fromSync = false) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;

    if (activeTabId) {
        const current = tabs.find((t) => t.id === activeTabId);
        if (current) {
            mainWindow.removeBrowserView(current.view);
        }
    }

    activeTabId = id;
    if (tab.url !== HOME_URL) {
        mainWindow.addBrowserView(tab.view);
        resizeBrowserView();
    }
    sendTabsToRenderer();

    mainWindow.webContents.send('navigated', { url: tab.url || '' });
    // Send bookmark state for new active tab
    if (bookmarksStore) {
        mainWindow.webContents.send('bookmark-state-changed', {
            url: tab.url,
            isBookmarked: bookmarksStore.isBookmarked(tab.url),
        });
    }

    if (!fromSync) {
        syncEngine.sendState('tab-switch', { tabId: id });
    }
}

function resizeBrowserView() {
    if (!mainWindow || !activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const bounds = mainWindow.getContentBounds();
    tab.view.setBounds({
        x: 0,
        y: TOOLBAR_HEIGHT,
        width: bounds.width,
        height: bounds.height - TOOLBAR_HEIGHT,
    });
    tab.view.setAutoResize({ width: true, height: true });
}

function sendTabsToRenderer() {
    if (!mainWindow) return;
    mainWindow.webContents.send('tabs-changed', {
        activeTabId,
        tabs: tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, favicon: t.favicon || '' })),
    });
}

// ── Sync Engine ──────────────────────────────────────

function initSyncEngine() {
    syncEngine = new SyncEngine();

    syncEngine.on('status', (data) => {
        mainWindow.webContents.send('connection-status', data);
    });

    syncEngine.on('peers-changed', (data) => {
        mainWindow.webContents.send('peers-changed', data);
    });

    syncEngine.on('remote-state', (msg) => {
        handleRemoteState(msg);
    });
}

function handleRemoteState(msg) {
    const { type, payload } = msg;

    switch (type) {
        case 'url-change': {
            let tab = tabs.find((t) => t.id === payload.tabId);
            if (!tab && tabs.length > 0) {
                tab = tabs.find((t) => t.id === activeTabId) || tabs[0];
            }
            if (tab && payload.url) {
                if (payload.url === HOME_URL) {
                    mainWindow.removeBrowserView(tab.view);
                    tab.url = HOME_URL;
                    mainWindow.webContents.send('navigated', { url: HOME_URL });
                } else {
                    if (tab.url === HOME_URL || !tab.url) {
                        mainWindow.addBrowserView(tab.view);
                        resizeBrowserView();
                    }
                    tab.view.webContents.loadURL(payload.url);
                }
            }
            break;
        }
        case 'control': {
            const tab = tabs.find((t) => t.id === activeTabId);
            if (tab) {
                if (payload.action === 'back' && tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
                if (payload.action === 'forward' && tab.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
                if (payload.action === 'reload') tab.view.webContents.reload();
                if (payload.action === 'scrollBy') {
                    tab.view.webContents.executeJavaScript(`window.scrollBy({ top: ${payload.delta}, behavior: 'auto' })`);
                }
                if (payload.action === 'toggle-play') {
                    tab.view.webContents.executeJavaScript(`
                        var media = document.querySelector('video, audio');
                        if (media) {
                            if (media.paused) media.play();
                            else media.pause();
                        }
                    `);
                }
            }
            break;
        }
        case 'request-sync': {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && syncEngine) {
                syncEngine.sendState('sync-full-state', {
                    url: tab.url || HOME_URL,
                    title: tab.title || HOME_URL,
                    tabId: tab.id
                });
            } else if (syncEngine) {
                syncEngine.sendState('sync-full-state', { url: HOME_URL });
            }
            break;
        }
        case 'tab-create': {
            if (!tabs.find((t) => t.id === payload.tabId)) {
                createTab(payload.url || HOME_URL, true);
                const lastTab = tabs[tabs.length - 1];
                lastTab.id = payload.tabId;
                sendTabsToRenderer();
            }
            break;
        }
        case 'tab-close': {
            closeTab(payload.tabId, true);
            break;
        }
        case 'tab-switch': {
            const tab = tabs.find((t) => t.id === payload.tabId);
            if (tab) {
                switchToTab(payload.tabId, true);
            }
            break;
        }
        case 'scroll-position': {
            const tab = tabs.find((t) => t.id === payload.tabId);
            if (tab) {
                tab.view.webContents.send('sync-scroll', payload.scrollY);
            }
            break;
        }
        case 'media-state': {
            const tab = tabs.find((t) => t.id === payload.tabId);
            if (tab) {
                tab.view.webContents.send('sync-media', { state: payload.state, currentTime: payload.currentTime });
            }
            break;
        }
        default:
            break;
    }
}

// ── Discovery ────────────────────────────────────────

function initDiscovery() {
    discovery = new DiscoveryService(syncEngine.deviceId);

    discovery.on('discovered', (device) => {
        mainWindow.webContents.send('device-discovered', device);
    });

    discovery.on('lost', (data) => { });

    discovery.startListening();
}

// ── IPC Handlers — Navigation ────────────────────────

ipcMain.on('navigate', (_e, url) => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && url) {
        if (url === HOME_URL) {
            mainWindow.removeBrowserView(tab.view);
            tab.url = HOME_URL;
            mainWindow.webContents.send('navigated', { url: HOME_URL });
        } else {
            if (tab.url === HOME_URL || !tab.url) {
                mainWindow.addBrowserView(tab.view);
                resizeBrowserView();
            }
            tab.view.webContents.loadURL(url);
        }
    }
});

ipcMain.on('go-back', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
});

ipcMain.on('go-forward', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && tab.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
});

ipcMain.on('reload', () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab) tab.view.webContents.reload();
});

ipcMain.on('new-tab', (_e, url) => { createTab(url || HOME_URL); });
ipcMain.on('close-tab', (_e, id) => { closeTab(id); });
ipcMain.on('switch-tab', (_e, id) => { switchToTab(id); });

// ── IPC Handlers — Connection ────────────────────────

ipcMain.on('create-room', () => {
    syncEngine.startHost(9777);
    discovery.startAnnouncing(9777);
});

ipcMain.on('join-room', (_e, ip, port) => { syncEngine.joinHost(ip, port); });

ipcMain.on('disconnect', () => {
    syncEngine.disconnect();
    discovery.stopAnnouncing();
});

// ── IPC Handlers — History ───────────────────────────

ipcMain.handle('get-apk-qrcode', async () => {
    const ip = syncEngine ? syncEngine.getLocalIp() : '127.0.0.1';
    const QRCode = require('qrcode');
    const url = `http://${ip}:8080/app-release.apk`;
    try {
        return await QRCode.toDataURL(url, {
            color: { dark: '#000000', light: '#00000000' },
            margin: 2
        });
    } catch (e) {
        return null;
    }
});

ipcMain.handle('get-history', () => {
    return historyStore.getGroupedByDate();
});

ipcMain.handle('get-recent-history', (_e, count) => {
    return historyStore.getRecent(count || 50);
});

ipcMain.handle('search-history', (_e, query) => {
    return historyStore.search(query);
});

ipcMain.handle('suggest-urls', (_e, query) => {
    const fromHistory = historyStore.suggest(query, 5);
    const fromBookmarks = bookmarksStore.search(query).slice(0, 3).map(b => ({
        url: b.url, title: b.title, favicon: b.favicon, isBookmark: true,
    }));
    // Merge, deduplicate
    const seen = new Set();
    const results = [];
    for (const item of [...fromBookmarks, ...fromHistory]) {
        if (!seen.has(item.url)) {
            seen.add(item.url);
            results.push(item);
        }
    }
    return results.slice(0, 8);
});

ipcMain.on('delete-history-entry', (_e, id) => {
    historyStore.deleteEntry(id);
});

ipcMain.on('clear-history', () => {
    historyStore.clearAll();
});

// ── IPC Handlers — Bookmarks ─────────────────────────

ipcMain.handle('get-bookmarks', () => {
    return bookmarksStore.getAll();
});

ipcMain.handle('is-bookmarked', (_e, url) => {
    return bookmarksStore.isBookmarked(url);
});

ipcMain.on('add-bookmark', (_e, { url, title, favicon, folder }) => {
    bookmarksStore.add(url, title, favicon, folder);
    mainWindow.webContents.send('bookmark-state-changed', { url, isBookmarked: true });
});

ipcMain.on('remove-bookmark', (_e, url) => {
    bookmarksStore.remove(url);
    mainWindow.webContents.send('bookmark-state-changed', { url, isBookmarked: false });
});

ipcMain.on('toggle-bookmark', () => {
    toggleBookmarkActiveTab();
});

// ── IPC Handlers — Downloads ─────────────────────────

ipcMain.handle('get-downloads', () => {
    return downloadsStore.getAll();
});

ipcMain.on('open-download', (_e, id) => { downloadsStore.openFile(id); });
ipcMain.on('show-download-in-folder', (_e, id) => { downloadsStore.showInFolder(id); });
ipcMain.on('clear-downloads', () => { downloadsStore.clear(); });

// ── IPC Handlers — Find in Page ──────────────────────

ipcMain.on('find-in-page', (_e, text, options) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && text) {
        tab.view.webContents.findInPage(text, options || {});
    }
});

ipcMain.on('stop-find-in-page', (_e, action) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        tab.view.webContents.stopFindInPage(action || 'clearSelection');
    }
});

// ── IPC Handlers — Zoom ─────────────────────────────

ipcMain.on('zoom-in', () => { zoomActiveTab(0.1); });
ipcMain.on('zoom-out', () => { zoomActiveTab(-0.1); });
ipcMain.on('zoom-reset', () => { resetZoomActiveTab(); });

// ── BrowserView Sync Handlers ──────────────────────

ipcMain.on('bv-scroll', (e, scrollY) => {
    const tab = tabs.find(t => t.view.webContents.id === e.sender.id);
    if (tab && syncEngine) {
        syncEngine.sendState('scroll-position', { scrollY, tabId: tab.id });
    }
});

ipcMain.on('bv-media-state', (e, { state, currentTime }) => {
    const tab = tabs.find(t => t.view.webContents.id === e.sender.id);
    if (tab && syncEngine) {
        syncEngine.sendState('media-state', { state, currentTime, tabId: tab.id });
    }
});

// ── PDF Shared Helper ────────────────────────────
async function handleOpenPdf(filePath) {
    if (!filePath) return;

    if (!syncEngine.isHost) {
        await syncEngine.startHost(9777);
        discovery.startAnnouncing(9777);
        await new Promise(r => setTimeout(r, 800));
    }
    syncEngine.setPdfFile(filePath);
    const ip = syncEngine.getLocalIp();
    const pdfUrl = `http://${ip}:9777/api/pdf`;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        if (tab.url === HOME_URL || !tab.url) {
            mainWindow.addBrowserView(tab.view);
            resizeBrowserView();
        }
        tab.view.webContents.loadURL(pdfUrl);
    }
    syncEngine.sendState('url-change', { url: pdfUrl, tabId: activeTabId });
}

ipcMain.on('open-pdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open PDF',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return;
    await handleOpenPdf(result.filePaths[0]);
});

ipcMain.on('open-pdf-path', async (_e, filePath) => {
    await handleOpenPdf(filePath);
});
