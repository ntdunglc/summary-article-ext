document.addEventListener("DOMContentLoaded", function () {
  const providerSelect = document.getElementById("providerSelect");
  const agyModelSelect = document.getElementById("agyModelSelect");
  const resetBtn = document.getElementById("resetBtn");
  const status = document.getElementById("status");

  const DEFAULTS = {
    service: "antigravity",
    agyModel: "flash"
  };

  function showStatus(message, color = "green") {
    status.textContent = message;
    status.style.color = color;
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("autoreload") === "1") {
    chrome.storage.sync.set({ service: "antigravity", agyModel: "flash", agyMigratedV1: true }, () => {
      providerSelect.value = "antigravity";
      if (agyModelSelect) agyModelSelect.value = "flash";
      showStatus("Updated to Antigravity (AGY Session) & reloaded!");
      setTimeout(() => {
        chrome.runtime.reload();
      }, 250);
    });
    return;
  }

  // Load stored preferences
  chrome.storage.sync.get(DEFAULTS, (data) => {
    providerSelect.value = data.service || DEFAULTS.service;
    if (agyModelSelect) {
      agyModelSelect.value = data.agyModel || DEFAULTS.agyModel;
    }
  });

  // Auto-save provider selection
  providerSelect.addEventListener("change", function () {
    const selectedProvider = providerSelect.value;
    chrome.storage.sync.set({ service: selectedProvider }, () => {
      showStatus(`Saved provider: ${selectedProvider}`);
    });
  });

  if (agyModelSelect) {
    agyModelSelect.addEventListener("change", function () {
      const selectedModel = agyModelSelect.value;
      chrome.storage.sync.set({ agyModel: selectedModel }, () => {
        showStatus(`Saved AGY model: ${selectedModel}`);
      });
    });
  }

  // Reset to default preferences
  resetBtn.addEventListener("click", function () {
    providerSelect.value = DEFAULTS.service;
    if (agyModelSelect) {
      agyModelSelect.value = DEFAULTS.agyModel;
    }
    chrome.storage.sync.set(DEFAULTS, () => {
      showStatus("Reset to default settings", "#ef4444");
    });
  });
});
