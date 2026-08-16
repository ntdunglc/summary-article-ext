document.addEventListener("DOMContentLoaded", function () {
  const providerSelect = document.getElementById("providerSelect");
  const resetBtn = document.getElementById("resetBtn");
  const status = document.getElementById("status");

  const DEFAULTS = {
    service: "claude"
  };

  function showStatus(message, color = "green") {
    status.textContent = message;
    status.style.color = color;
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }

  // Load stored preferences
  chrome.storage.sync.get(DEFAULTS, (data) => {
    providerSelect.value = data.service || DEFAULTS.service;
  });

  // Auto-save provider selection
  providerSelect.addEventListener("change", function () {
    const selectedProvider = providerSelect.value;
    chrome.storage.sync.set({ service: selectedProvider }, () => {
      showStatus(`Saved: ${selectedProvider}`);
    });
  });

  // Reset to default preferences
  resetBtn.addEventListener("click", function () {
    providerSelect.value = DEFAULTS.service;
    chrome.storage.sync.set(DEFAULTS, () => {
      showStatus("Reset to default settings", "#ef4444");
    });
  });
});
