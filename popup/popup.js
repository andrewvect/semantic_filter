// popup.js - Controller for extension popup UI

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const toggleEnabled = document.getElementById("toggle-enabled");
  const inputTask = document.getElementById("input-task");
  const inputApiKey = document.getElementById("input-api-key");
  const btnToggleKey = document.getElementById("btn-toggle-key");
  const btnTestKey = document.getElementById("btn-test-key");
  const keyTestStatus = document.getElementById("key-test-status");
  const selectModel = document.getElementById("select-model");
  const selectStrictness = document.getElementById("select-strictness");
  const statTotal = document.getElementById("stat-total");
  const statBlocked = document.getElementById("stat-blocked");
  const historyList = document.getElementById("history-list");
  const btnClearHistory = document.getElementById("btn-clear-history");
  const btnSave = document.getElementById("btn-save");
  const saveToast = document.getElementById("save-toast");
  const presetButtons = document.querySelectorAll(".btn-preset");

  // Load existing settings
  const settings = await chrome.storage.local.get([
    "enabled",
    "currentTask",
    "groqApiKey",
    "model",
    "strictness",
    "totalCount",
    "blockedCount",
    "blockedHistory"
  ]);

  toggleEnabled.checked = settings.enabled !== false;
  inputTask.value = settings.currentTask || "";
  inputApiKey.value = settings.groqApiKey || "";
  if (settings.model) {
    const validOptions = Array.from(selectModel.options).map((opt) => opt.value);
    if (validOptions.includes(settings.model)) {
      selectModel.value = settings.model;
    } else {
      selectModel.value = "qwen/qwen3.8-27b";
    }
  } else {
    selectModel.value = "qwen/qwen3.8-27b";
  }
  if (settings.strictness) selectStrictness.value = settings.strictness;

  statTotal.textContent = settings.totalCount || 0;
  statBlocked.textContent = settings.blockedCount || 0;

  renderHistory(settings.blockedHistory || []);

  // Preset button click handlers
  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      inputTask.value = btn.dataset.preset;
      inputTask.focus();
    });
  });

  // Toggle API key visibility
  btnToggleKey.addEventListener("click", () => {
    if (inputApiKey.type === "password") {
      inputApiKey.type = "text";
      btnToggleKey.textContent = "🔒";
    } else {
      inputApiKey.type = "password";
      btnToggleKey.textContent = "👁️";
    }
  });

  // Test Groq API Key
  btnTestKey.addEventListener("click", async () => {
    const key = inputApiKey.value.trim();
    if (!key) {
      setTestStatus("Enter an API key first", "error");
      return;
    }

    setTestStatus("Testing key with Groq...", "loading");

    chrome.runtime.sendMessage(
      { action: "TEST_API_KEY", apiKey: key, model: selectModel.value },
      (response) => {
        if (chrome.runtime.lastError) {
          setTestStatus("Error: " + chrome.runtime.lastError.message, "error");
          return;
        }

        if (response && response.success) {
          setTestStatus("✓ Key verified & active", "success");
        } else {
          setTestStatus("✗ Failed: " + (response?.error || "Unknown error"), "error");
        }
      }
    );
  });

  function setTestStatus(text, statusClass) {
    keyTestStatus.textContent = text;
    keyTestStatus.className = "test-status " + statusClass;
  }

  // Toggle enabled/disabled switch auto-saves
  toggleEnabled.addEventListener("change", async () => {
    await chrome.storage.local.set({ enabled: toggleEnabled.checked });
    showToast(toggleEnabled.checked ? "Filter Enabled" : "Filter Paused");
  });

  // Clear History
  btnClearHistory.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "CLEAR_HISTORY" }, () => {
      statTotal.textContent = 0;
      statBlocked.textContent = 0;
      renderHistory([]);
      showToast("History Cleared");
    });
  });

  // Save Settings
  btnSave.addEventListener("click", async () => {
    const dataToSave = {
      enabled: toggleEnabled.checked,
      currentTask: inputTask.value.trim(),
      groqApiKey: inputApiKey.value.trim(),
      model: selectModel.value,
      strictness: selectStrictness.value
    };

    await chrome.storage.local.set(dataToSave);
    showToast("Saved & Applied!");
  });

  function showToast(msg) {
    saveToast.textContent = msg;
    saveToast.classList.add("visible");
    setTimeout(() => {
      saveToast.classList.remove("visible");
    }, 2000);
  }

  function renderHistory(items) {
    historyList.innerHTML = "";
    if (!items || items.length === 0) {
      const li = document.createElement("li");
      li.className = "history-empty";
      li.textContent = "No blocked searches yet.";
      historyList.appendChild(li);
      return;
    }

    items.slice(0, 10).forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const timeAgo = formatTimeAgo(item.timestamp);
      li.innerHTML = `
        <span class="history-item-query">"${escapeHtml(item.query)}"</span>
        <span class="history-item-meta">Task: ${escapeHtml(item.task)} • ${timeAgo}</span>
      `;
      historyList.appendChild(li);
    });
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "just now";
    const elapsedSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (elapsedSeconds < 60) return "just now";
    const minutes = Math.floor(elapsedSeconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
});
