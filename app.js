/*
  Demo-only client app: API keys entered here are used directly from the browser.
  Do not expose production API keys in frontend code.
  A production system should route requests through a secure backend proxy.
*/

const state = {
  config: {
    provider: "claude",
    apiKey: "",
    model: "",
  },
  messages: [],
  isLoading: false,
};

const defaults = {
  claudeModel: "claude-3-5-sonnet-20241022",
  openaiModel: "gpt-4o-mini",
};

const elements = {
  tabSettings: document.getElementById("tab-settings"),
  tabChat: document.getElementById("tab-chat"),
  panelSettings: document.getElementById("panel-settings"),
  panelChat: document.getElementById("panel-chat"),
  settingsForm: document.getElementById("settings-form"),
  providerSelect: document.getElementById("provider-select"),
  apiKeyInput: document.getElementById("api-key-input"),
  modelInput: document.getElementById("model-input"),
  settingsFeedback: document.getElementById("settings-feedback"),
  chatHistory: document.getElementById("chat-history"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  sendButton: document.getElementById("send-button"),
  chatStatus: document.getElementById("chat-status"),
};

function initializeApp() {
  bindTabEvents();
  bindSettingsEvents();
  bindChatEvents();
  renderEmptyChatMessage();
  syncUiState();
}

function bindTabEvents() {
  elements.tabSettings.addEventListener("click", () => setActiveTab("settings"));
  elements.tabChat.addEventListener("click", () => setActiveTab("chat"));
}

function setActiveTab(tabName) {
  const isSettings = tabName === "settings";

  elements.tabSettings.classList.toggle("active", isSettings);
  elements.tabSettings.setAttribute("aria-selected", String(isSettings));
  elements.panelSettings.classList.toggle("hidden", !isSettings);

  elements.tabChat.classList.toggle("active", !isSettings);
  elements.tabChat.setAttribute("aria-selected", String(!isSettings));
  elements.panelChat.classList.toggle("hidden", isSettings);

  if (!isSettings) {
    elements.chatInput.focus();
  }
}

function bindSettingsEvents() {
  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const provider = elements.providerSelect.value;
    const apiKey = elements.apiKeyInput.value.trim();
    const model = elements.modelInput.value.trim();

    if (!apiKey) {
      setSettingsFeedback("Please enter an API key.", "error");
      syncUiState();
      return;
    }

    state.config = { provider, apiKey, model };
    setSettingsFeedback("Configuration saved for this session.", "success");
    syncUiState();
  });
}

function bindChatEvents() {
  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSendMessage();
  });

  elements.chatInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await handleSendMessage();
    }
  });
}

async function handleSendMessage() {
  const userText = elements.chatInput.value.trim();

  if (!state.config.apiKey) {
    setChatStatus("Please configure your API key in Settings.");
    return;
  }

  if (!userText || state.isLoading) {
    return;
  }

  addMessage("user", userText);
  elements.chatInput.value = "";
  setLoading(true, "Thinking...");

  try {
    const assistantReply = await requestCompletion();
    addMessage("assistant", assistantReply);
  } catch (error) {
    addMessage("assistant", `Error: ${error.message}`);
    setChatStatus(error.message);
  } finally {
    setLoading(false, "");
  }
}

async function requestCompletion() {
  const provider = state.config.provider;

  if (provider === "claude") {
    return requestClaude();
  }

  if (provider === "openai") {
    return requestOpenAi();
  }

  throw new Error("Unsupported provider selected.");
}

async function requestClaude() {
  const model = state.config.model || defaults.claudeModel;

  const body = {
    model,
    max_tokens: 1024,
    messages: state.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": state.config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(extractApiError(data, "Claude request failed."));
  }

  const textParts = (data.content || [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text);

  return textParts.join("\n").trim() || "No response text returned.";
}

async function requestOpenAi() {
  const model = state.config.model || defaults.openaiModel;

  const body = {
    model,
    messages: state.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(extractApiError(data, "OpenAI request failed."));
  }

  return data?.choices?.[0]?.message?.content?.trim() || "No response text returned.";
}

function addMessage(role, content) {
  state.messages.push({ role, content });
  renderMessages();
}

function renderMessages() {
  elements.chatHistory.innerHTML = "";

  if (state.messages.length === 0) {
    renderEmptyChatMessage();
    return;
  }

  for (const message of state.messages) {
    const node = document.createElement("div");
    node.className = `message ${message.role}`;
    node.textContent = message.content;
    elements.chatHistory.appendChild(node);
  }

  elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
}

function renderEmptyChatMessage() {
  const placeholder = document.createElement("div");
  placeholder.className = "message assistant";
  placeholder.textContent = "Start a conversation by sending a message.";
  elements.chatHistory.appendChild(placeholder);
}

function setSettingsFeedback(text, type) {
  elements.settingsFeedback.textContent = text;
  elements.settingsFeedback.className = `feedback ${type}`;
}

function setChatStatus(text) {
  elements.chatStatus.textContent = text;
}

function setLoading(isLoading, statusText) {
  state.isLoading = isLoading;
  setChatStatus(statusText);
  syncUiState();
}

function syncUiState() {
  const canSend = Boolean(state.config.apiKey) && !state.isLoading;
  elements.sendButton.disabled = !canSend;
  elements.chatInput.disabled = state.isLoading;
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractApiError(data, fallback) {
  if (!data) return fallback;
  if (typeof data.error === "string") return data.error;
  if (typeof data.error?.message === "string") return data.error.message;
  if (typeof data.message === "string") return data.message;
  return fallback;
}

initializeApp();
