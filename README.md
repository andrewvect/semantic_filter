# 🎯 FocusFilter - Semantic Focus Filter for Google Search

A Google Chrome browser extension that semantically filters your Google search queries against the specific task you are working on right now. If a search query is off-topic or unrelated, it blocks the search and redirects you straight back to the [google.com](https://www.google.com) home page.

Powered by ultra-fast inference on **Groq Cloud** (`llama-3.1-8b-instant` or `llama-3.3-70b-versatile`).

---

## ✨ Features

- **Semantic Task Verification**: Checks search queries against your current objective instead of using rigid keyword lists.
- **Instant Groq LPU Evaluation**: Blazing fast decisions (~150ms) using Groq's low-latency API.
- **Smart Distraction Redirection**: Unrelated searches immediately redirect you back to `google.com` with a clear reminder of your current task.
- **Zero-Flicker Shield**: Seamless loading overlay prevents distracting search results from flashing before evaluation finishes.
- **Emergency Override**: In a pinch, an "Allow this search" button lets you bypass the filter without changing settings.
- **Configurable Strictness**: Choose between *Strict*, *Moderate* (default), or *Lenient*.
- **Local Cache**: Approved searches are cached to keep pagination and navigation lightning fast.
- **Productivity Metrics**: View total searches checked, total distractions blocked, and a recent history of blocked queries.

---

## 🚀 Installation Guide

### Step 1: Open Chrome Extensions
1. Open Google Chrome (or any Chromium browser like Brave, Arc, Edge).
2. Navigate to `chrome://extensions` in the address bar.
3. Toggle the **"Developer mode"** switch in the top-right corner.

### Step 2: Load the Extension
1. Click the **"Load unpacked"** button in the top-left corner.
2. Select the `/Users/andrew/Projects/semantic_filter` folder.
3. The **"Semantic Focus Filter for Google Search"** extension will appear in your extension list.
4. (Optional) Click the puzzle piece icon in the Chrome toolbar and pin **FocusFilter** for quick access.

---

## 🔑 Groq API Setup

1. Create a free account at [console.groq.com](https://console.groq.com/keys).
2. Generate an API Key (starts with `gsk_...`). Free tier gives you ample requests with virtually zero latency.
3. Click the extension icon in Chrome.
4. Expand **⚙️ Groq API & Configuration**.
5. Paste your API Key and click **Test** to verify connection.

---

## 🛠️ How to Use

1. **Set Your Focus Task**:
   - Open the extension popup.
   - In the text box, describe what you are working on right now (e.g., *"Building a Python FastAPI backend with JWT authentication"*).
2. **Click "Save & Apply"**.
3. **Try Searching Google**:
   - Search: `fastapi oauth2 bearer token documentation` ➔ **Approved** (Allowed through immediately).
   - Search: `best action movies 2024` or `cheap flights to tokyo` ➔ **Blocked** (Groq returns `NO` ➔ Displays distraction warning and redirects back to `google.com`).

---

## 📁 File Structure

```
semantic_filter/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── background.js         # Service worker handling Groq API evaluation & caching
├── content.js            # Content script intercepting Google search queries
├── icons/                # Extension icons (16, 32, 48, 128 px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── popup/                # Extension popup UI
│   ├── popup.html        # Task form & settings layout
│   ├── popup.css         # Dark theme styling
│   └── popup.js          # Form state and event handling
└── README.md             # Project documentation
```
