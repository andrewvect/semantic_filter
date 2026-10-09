// background.js - Service worker for Semantic Focus Filter

const CACHE = new Map();
const MAX_CACHE_SIZE = 200;

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    enabled: true,
    currentTask: "",
    groqApiKey: "",
    model: "qwen/qwen3.8-27b",
    strictness: "moderate",
    totalCount: 0,
    blockedCount: 0,
    blockedHistory: []
  };

  const current = await chrome.storage.local.get(Object.keys(defaults));
  const toSet = {};
  for (const [key, val] of Object.entries(defaults)) {
    if (current[key] === undefined) {
      toSet[key] = val;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
  updateBadge();
});

// Update extension icon badge
async function updateBadge() {
  const { enabled, currentTask, blockedCount } = await chrome.storage.local.get([
    "enabled",
    "currentTask",
    "blockedCount"
  ]);

  if (!enabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#6B7280" }); // Gray
  } else if (!currentTask || !currentTask.trim()) {
    chrome.action.setBadgeText({ text: "IDLE" });
    chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" }); // Amber
  } else {
    chrome.action.setBadgeText({ text: blockedCount ? String(blockedCount) : "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#6366F1" }); // Indigo
  }
}

// Listen for storage changes to refresh badge
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled || changes.currentTask || changes.blockedCount) {
    updateBadge();
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CHECK_QUERY") {
    handleCheckQuery(message.query, message.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ allowed: true, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === "TEST_API_KEY") {
    handleTestApiKey(message.apiKey, message.model)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "CLEAR_HISTORY") {
    chrome.storage.local.set({ blockedHistory: [], blockedCount: 0, totalCount: 0 }).then(() => {
      CACHE.clear();
      updateBadge();
      sendResponse({ success: true });
    });
    return true;
  }
});

async function handleCheckQuery(rawQuery, url) {
  if (!rawQuery || typeof rawQuery !== "string") {
    return { allowed: true, reason: "Empty query" };
  }

  const query = rawQuery.trim();
  const settings = await chrome.storage.local.get([
    "enabled",
    "groqApiKey",
    "currentTask",
    "model",
    "strictness",
    "totalCount",
    "blockedCount",
    "blockedHistory"
  ]);

  if (!settings.enabled) {
    return { allowed: true, reason: "Extension disabled" };
  }

  const task = (settings.currentTask || "").trim();
  if (!task) {
    return { allowed: true, reason: "No active task defined" };
  }

  const apiKey = (settings.groqApiKey || "").trim();
  if (!apiKey) {
    return {
      allowed: true,
      warning: "Missing Groq API Key. Configure your key in the extension popup.",
      task
    };
  }

  const model = settings.model || "qwen/qwen3.8-27b";
  const strictness = settings.strictness || "moderate";

  // Check cache
  const cacheKey = `${task.toLowerCase()}:::${query.toLowerCase()}:::${strictness}`;
  if (CACHE.has(cacheKey)) {
    const cached = CACHE.get(cacheKey);
    return {
      allowed: cached.allowed,
      fromCache: true,
      task,
      query,
      reason: cached.reason
    };
  }

  // Call Groq API
  try {
    const allowed = await callGroqEvaluation(apiKey, model, strictness, task, query);

    // Save in cache
    if (CACHE.size >= MAX_CACHE_SIZE) {
      const firstKey = CACHE.keys().next().value;
      CACHE.delete(firstKey);
    }
    CACHE.set(cacheKey, { allowed, reason: allowed ? "Correlated" : "Not correlated" });

    // Update stats
    const totalCount = (settings.totalCount || 0) + 1;
    let blockedCount = settings.blockedCount || 0;
    const blockedHistory = settings.blockedHistory || [];

    if (!allowed) {
      blockedCount += 1;
      blockedHistory.unshift({
        query,
        task,
        timestamp: Date.now()
      });
      if (blockedHistory.length > 20) {
        blockedHistory.pop();
      }
    }

    await chrome.storage.local.set({
      totalCount,
      blockedCount,
      blockedHistory
    });

    updateBadge();

    return {
      allowed,
      task,
      query,
      reason: allowed ? "Search correlates with active task" : "Search is not correlated with active task"
    };
  } catch (error) {
    console.error("[FocusFilter] Groq API evaluation failed:", error);
    // In case of network error, do not trap user in redirect loop; allow query with notification
    return {
      allowed: true,
      error: error.message,
      task,
      query
    };
  }
}

async function callGroqEvaluation(apiKey, model, strictness, task, query) {
  let strictnessGuidance = "";
  if (strictness === "strict") {
    strictnessGuidance = "Be very strict. Only permit searches directly and specifically required to make immediate progress on the task. Any generic browsing, entertainment, trivia, or tangent must be rejected with NO.";
  } else if (strictness === "lenient") {
    strictnessGuidance = "Be generous. If the search could even remotely assist the user, their general workflow, or tooling, answer YES. Only reject obvious time-wasters, entertainment, social media, or completely unrelated distractions.";
  } else {
    // moderate
    strictnessGuidance = "Use common sense. Permit queries that are logically connected, relevant, or supportive of the task or related professional tooling/documentation. Reject searches that are distinct distractions, unrelated shopping, pop culture, news, or off-topic tangents.";
  }

  const systemPrompt = `You are a strict semantic focus filter. A user has specified their current work task.
Evaluate if their search query is correlated or relevant to accomplishing this task.

Evaluation instructions:
${strictnessGuidance}

Response requirements:
- Respond with EXACTLY one word: "YES" or "NO".
- YES = The search query is correlated and relevant to the task.
- NO = The search query is NOT correlated or is a distraction.
- Do NOT provide any explanation, punctuation, markdown, or greetings. Only "YES" or "NO".`;

  const userPrompt = `Current Task: "${task}"
Search Query: "${query}"

Is this search correlated with the task? (YES/NO):`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.0,
        max_tokens: 60
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      // If selected model is not accessible, fallback to qwen/qwen3.8-27b if not already using it
      if (model !== "qwen/qwen3.8-27b" && (errText.includes("does not exist") || errText.includes("access"))) {
        console.warn(`[FocusFilter] Model ${model} not accessible, retrying with qwen/qwen3.8-27b`);
        return await callGroqEvaluation(apiKey, "qwen/qwen3.8-27b", strictness, task, query);
      }
      throw new Error(`Groq API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = (data?.choices?.[0]?.message?.content || "").trim().toUpperCase();

    // Check if reply says YES or NO
    if (content.includes("NO")) {
      return false;
    }
    if (content.includes("YES")) {
      return true;
    }

    // Default to true if ambiguous, to prevent false positive lockouts
    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function handleTestApiKey(apiKey, model) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("API key is required");
  }

  const chosenModel = model || "qwen/qwen3.8-27b";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: "You are a test helper." },
          { role: "user", content: "Reply with the word PONG" }
        ],
        temperature: 0.0,
        max_tokens: 40
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error && parsed.error.message) {
          errorMsg = parsed.error.message;
        }
      } catch (e) {
        errorMsg = errBody;
      }
      throw new Error(errorMsg);
    }

    return { success: true };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
