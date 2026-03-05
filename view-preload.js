const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendControl: (action) => ipcRenderer.send('bv-remote-control', action),
    loadUrl: (url) => ipcRenderer.send('bv-load-url', url)
});

// ── State Trackers ──
let lastScrollY = 0;
let isSyncingScroll = false;
let isSyncingMedia = false;

// Listen for sync commands FROM the main process
ipcRenderer.on('sync-scroll', (_e, scrollY) => {
    isSyncingScroll = true;
    window.scrollTo({ top: scrollY, behavior: 'auto' });
    // Reset flag after a short delay to allow the scroll event to fire and be ignored
    setTimeout(() => { isSyncingScroll = false; }, 200);
});

ipcRenderer.on('sync-media', (_e, { state, currentTime }) => {
    isSyncingMedia = true;
    document.querySelectorAll('video, audio').forEach(media => {
        // A simple approach: sync all media elements on the page
        if (Math.abs(media.currentTime - currentTime) > 1) {
            media.currentTime = currentTime;
        }
        if (state === 'play') {
            media.play().catch(e => console.error("Autoplay blocked:", e));
        } else if (state === 'pause') {
            media.pause();
        }
    });
    setTimeout(() => { isSyncingMedia = false; }, 500);
});

// ── Event Listeners TO the main process ──

window.addEventListener('scroll', () => {
    if (isSyncingScroll) return; // Prevent infinite feedback loops

    const scrollY = window.scrollY;
    // Throttle scroll events to only send when delta > 50px
    if (Math.abs(scrollY - lastScrollY) > 50) {
        lastScrollY = scrollY;
        ipcRenderer.send('bv-scroll', scrollY);
    }
}, { passive: true });

document.addEventListener('play', (e) => {
    if (isSyncingMedia) return;
    if (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO') {
        ipcRenderer.send('bv-media-state', { state: 'play', currentTime: e.target.currentTime });
    }
}, true); // Use capture phase to catch all media events

document.addEventListener('pause', (e) => {
    if (isSyncingMedia) return;
    if (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO') {
        ipcRenderer.send('bv-media-state', { state: 'pause', currentTime: e.target.currentTime });
    }
}, true);
