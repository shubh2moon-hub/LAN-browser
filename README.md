# LAN Browser 🌐📱

A synchronized dual-screen browsing experience for your local network.

LAN Browser consists of two parts:
1. **A Desktop Application (Electron):** Acts as the main browser, rendering web pages and handling local media playback.
2. **A Mobile Application (React Native):** Acts as a companion app, keeping tabs synced and acting as a remote control for media playback.

## Features ✨

*   **Real-time Tab Sync:** Your active tab and URLs are instantly synchronized between your laptop and your phone over the local network.
*   **Media Remote Control:** When you play a video (e.g., YouTube) on the desktop browser, the mobile app transforms into a lightweight Remote Control ("Now Playing" card) instead of loading the video itself. This saves your phone's battery and bandwidth, preventing double data usage!
*   **Play on Mobile Mode:** Want to watch the video on your phone instead? Just tap "Play on Mobile", and the roles reverse: the mobile app plays the video, and the desktop browser becomes the remote control!
*   **Local APK Distribution:** No app store needed! The desktop app hosts the mobile app's APK locally. Just scan the QR code on the desktop's "New Tab" page to download and install the mobile app directly.
*   **Offline First:** The sync engine uses local WebSockets (`ws://`) and subnet discovery. It works completely entirely within your local LAN.

## Getting Started 🚀

### 1. Run the Desktop Browser
```bash
# Install dependencies
npm install

# Start the Electron application
npm start
```

### 2. Install the Mobile App
*   When the desktop browser starts, open a New Tab (`Ctrl+T`).
*   Scan the **Sync Mobile** QR code with your phone.
*   Download and install the APK via the local portal page.

### 3. Connect!
*   Open the mobile app.
*   It will automatically scan your local network for the desktop browser.
*   Tap on your desktop in the "Discovered Devices" list to connect.

## Tech Stack 🛠

*   **Desktop:** Node.js, Electron, Express (for APK hosting), ws (WebSockets).
*   **Mobile:** React Native, Expo, React Native WebView.
*   **Build:** Gradle (Local Android APK Build).
