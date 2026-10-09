// content.js - Injected into Google pages to enforce semantic filtering

(function () {
  let lastEvaluatedQuery = null;
  let activeOverlay = null;

  function init() {
    handleGoogleHomePage();
    handleSearchPage();
    observeNavigation();
  }

  // Handle landing on Google home page after being blocked
  function handleGoogleHomePage() {
    const url = new URL(window.location.href);
    const isBlocked = url.searchParams.get("blocked") === "1";

    if (isBlocked) {
      const blockedQuery = url.searchParams.get("query") || "search";
      const task = url.searchParams.get("task") || "active task";

      // Clean URL without reloading
      url.searchParams.delete("blocked");
      url.searchParams.delete("query");
      url.searchParams.delete("task");
      const cleanUrl = url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "");
      window.history.replaceState({}, document.title, cleanUrl);

      // Display warning banner once DOM is ready
      showBlockedNotice(blockedQuery, task);
    }
  }

  function showBlockedNotice(query, task) {
    const renderBanner = () => {
      if (document.getElementById("focus-filter-banner")) return;

      const banner = document.createElement("div");
      banner.id = "focus-filter-banner";
      banner.innerHTML = `
        <div class="ff-banner-content">
          <div class="ff-banner-icon">🎯</div>
          <div class="ff-banner-text">
            <strong>Distraction Blocked!</strong> 
            <span>"<em>${escapeHtml(query)}</em>" was redirected because it doesn't correlate with your task: <strong>${escapeHtml(task)}</strong></span>
          </div>
          <button class="ff-banner-close" aria-label="Close">&times;</button>
        </div>
      `;

      injectStyles();
      document.body.prepend(banner);

      banner.querySelector(".ff-banner-close").addEventListener("click", () => {
        banner.remove();
      });

      // Auto dismiss after 8 seconds
      setTimeout(() => {
        if (banner && banner.parentNode) {
          banner.style.opacity = "0";
          setTimeout(() => banner.remove(), 400);
        }
      }, 8000);
    };

    if (document.body) {
      renderBanner();
    } else {
      document.addEventListener("DOMContentLoaded", renderBanner);
    }
  }

  // Handle Google search results page
  function handleSearchPage() {
    if (!window.location.pathname.startsWith("/search")) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q");

    if (!query || query.trim() === "") {
      return;
    }

    // Don't re-check the same query if already checked or approved in this session
    if (query === lastEvaluatedQuery) {
      return;
    }

    const sessionKey = "__ff_allowed_" + encodeURIComponent(query.trim().toLowerCase());
    if (sessionStorage.getItem(sessionKey)) {
      lastEvaluatedQuery = query;
      return;
    }

    lastEvaluatedQuery = query;
    showCheckingOverlay(query);

    chrome.runtime.sendMessage(
      { action: "CHECK_QUERY", query: query, url: window.location.href },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[FocusFilter] Error contacting background:", chrome.runtime.lastError.message);
          removeOverlay();
          return;
        }

        if (!response) {
          removeOverlay();
          return;
        }

        if (response.warning) {
          removeOverlay();
          showToast(response.warning);
          return;
        }

        if (response.allowed) {
          sessionStorage.setItem(sessionKey, "1");
          removeOverlay();
        } else {
          // Query was blocked: redirect back to google.com
          showBlockedOverlay(query, response.task || "your active task");
        }
      }
    );
  }

  function showCheckingOverlay(query) {
    injectStyles();

    if (activeOverlay) {
      activeOverlay.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "focus-filter-overlay";
    overlay.innerHTML = `
      <div class="ff-dialog">
        <div class="ff-spinner"></div>
        <div class="ff-dialog-title">Semantic Focus Guard</div>
        <div class="ff-dialog-subtitle">Verifying correlation for:</div>
        <div class="ff-query-badge">"${escapeHtml(query)}"</div>
        <div class="ff-dialog-footer">
          <button id="ff-emergency-allow" class="ff-btn-subtle">Allow this search</button>
        </div>
      </div>
    `;

    // Immediately attach to documentElement or body to prevent flashing of results
    (document.documentElement || document.body).appendChild(overlay);
    activeOverlay = overlay;

    // Emergency allow button handler
    const allowBtn = overlay.querySelector("#ff-emergency-allow");
    if (allowBtn) {
      allowBtn.addEventListener("click", () => {
        sessionStorage.setItem("__ff_allowed_" + encodeURIComponent(query.trim().toLowerCase()), "1");
        removeOverlay();
      });
    }
  }

  function showBlockedOverlay(query, task) {
    if (!activeOverlay) {
      showCheckingOverlay(query);
    }

    const dialog = activeOverlay.querySelector(".ff-dialog");
    if (dialog) {
      dialog.className = "ff-dialog ff-dialog-blocked";
      dialog.innerHTML = `
        <div class="ff-blocked-icon">🚫</div>
        <div class="ff-dialog-title ff-blocked-title">Search Blocked</div>
        <div class="ff-dialog-desc">
          "<em>${escapeHtml(query)}</em>" is not correlated with your current task:
        </div>
        <div class="ff-task-badge">${escapeHtml(task)}</div>
        <div class="ff-redirect-msg">Returning to Google homepage...</div>
      `;
    }

    // Redirect to google.com main page with blocked notice
    setTimeout(() => {
      const target = "https://www.google.com/?blocked=1&query=" +
        encodeURIComponent(query) +
        "&task=" +
        encodeURIComponent(task);
      window.location.replace(target);
    }, 1200);
  }

  function removeOverlay() {
    if (activeOverlay) {
      activeOverlay.style.opacity = "0";
      setTimeout(() => {
        if (activeOverlay && activeOverlay.parentNode) {
          activeOverlay.remove();
          activeOverlay = null;
        }
      }, 250);
    }
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "ff-toast";
    toast.textContent = message;
    injectStyles();
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }

  // Handle dynamic Google Search navigation (SPA / AJAX query changes)
  function observeNavigation() {
    let oldHref = window.location.href;

    const checkUrlChange = () => {
      const currentHref = window.location.href;
      if (currentHref !== oldHref) {
        oldHref = currentHref;
        handleSearchPage();
      }
    };

    // Listen to history changes
    window.addEventListener("popstate", checkUrlChange);

    const originalPushState = history.pushState;
    if (originalPushState) {
      history.pushState = function () {
        originalPushState.apply(this, arguments);
        checkUrlChange();
      };
    }

    const originalReplaceState = history.replaceState;
    if (originalReplaceState) {
      history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        checkUrlChange();
      };
    }

    // Periodic check for search input changes
    setInterval(checkUrlChange, 600);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function injectStyles() {
    if (document.getElementById("focus-filter-styles")) return;

    const style = document.createElement("style");
    style.id = "focus-filter-styles";
    style.textContent = `
      #focus-filter-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #f8fafc;
        transition: opacity 0.25s ease;
      }

      .ff-dialog {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 18px;
        padding: 32px 36px;
        max-width: 460px;
        width: 90%;
        text-align: center;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
        animation: ff-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes ff-scale-in {
        from { transform: scale(0.94); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      .ff-spinner {
        width: 36px;
        height: 36px;
        border: 3px solid rgba(99, 102, 241, 0.2);
        border-top-color: #6366f1;
        border-radius: 50%;
        margin: 0 auto 18px auto;
        animation: ff-spin 0.8s linear infinite;
      }

      @keyframes ff-spin {
        to { transform: rotate(360deg); }
      }

      .ff-dialog-title {
        font-size: 20px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 6px;
      }

      .ff-dialog-subtitle {
        font-size: 13px;
        color: #94a3b8;
        margin-bottom: 12px;
      }

      .ff-query-badge {
        display: inline-block;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        color: #38bdf8;
        max-width: 90%;
        word-break: break-word;
        margin-bottom: 20px;
      }

      .ff-dialog-footer {
        border-top: 1px solid #334155;
        padding-top: 14px;
        margin-top: 8px;
      }

      .ff-btn-subtle {
        background: transparent;
        border: none;
        color: #64748b;
        font-size: 12px;
        cursor: pointer;
        text-decoration: underline;
        padding: 4px 8px;
        transition: color 0.2s;
      }

      .ff-btn-subtle:hover {
        color: #94a3b8;
      }

      /* Blocked State */
      .ff-dialog-blocked {
        border-color: #ef4444;
        box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.25);
      }

      .ff-blocked-icon {
        font-size: 42px;
        margin-bottom: 12px;
      }

      .ff-blocked-title {
        color: #f87171;
      }

      .ff-dialog-desc {
        font-size: 14px;
        color: #cbd5e1;
        margin: 10px 0;
      }

      .ff-task-badge {
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid #6366f1;
        border-radius: 8px;
        padding: 8px 14px;
        color: #a5b4fc;
        font-size: 13px;
        font-weight: 600;
        margin: 12px auto;
        display: inline-block;
        max-width: 90%;
        word-break: break-word;
      }

      .ff-redirect-msg {
        font-size: 12px;
        color: #94a3b8;
        font-style: italic;
        margin-top: 14px;
      }

      /* Home Page Banner */
      #focus-filter-banner {
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        background: linear-gradient(90deg, #1e1b4b 0%, #311042 100%);
        border-bottom: 2px solid #818cf8;
        color: #f8fafc;
        z-index: 9999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        transition: opacity 0.4s ease;
      }

      .ff-banner-content {
        max-width: 860px;
        margin: 0 auto;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        gap: 14px;
        font-size: 14px;
      }

      .ff-banner-icon {
        font-size: 20px;
        flex-shrink: 0;
      }

      .ff-banner-text {
        flex: 1;
        line-height: 1.4;
      }

      .ff-banner-text strong {
        color: #a5b4fc;
      }

      .ff-banner-text em {
        color: #fca5a5;
        font-style: normal;
        text-decoration: line-through;
      }

      .ff-banner-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 22px;
        cursor: pointer;
        padding: 0 6px;
        line-height: 1;
      }

      .ff-banner-close:hover {
        color: #ffffff;
      }

      /* Toast Notification */
      .ff-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid #475569;
        border-left: 4px solid #f59e0b;
        padding: 12px 18px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.4);
        z-index: 2147483647;
        transition: opacity 0.3s ease;
      }
    `;
    document.head ? document.head.appendChild(style) : (document.documentElement || document.body).appendChild(style);
  }

  // Run on start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
