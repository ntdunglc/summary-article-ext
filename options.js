document.addEventListener("DOMContentLoaded", function () {
  const providerSelect = document.getElementById("providerSelect");
  const autoRunYouTube = document.getElementById("autoRunYouTube");
  const youtubeMinDuration = document.getElementById("youtubeMinDuration");
  const durationSetting = document.getElementById("durationSetting");
  const resetBtn = document.getElementById("resetBtn");
  const status = document.getElementById("status");

  const DEFAULTS = {
    service: "claude",
    autoRunYouTube: true,
    youtubeMinDuration: 10
  };

  function showStatus(message, color = "green") {
    status.textContent = message;
    status.style.color = color;
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }

  function updateDurationVisibility() {
    durationSetting.style.display = autoRunYouTube.checked ? "block" : "none";
  }

  // Load stored preferences
  chrome.storage.sync.get(DEFAULTS, (data) => {
    providerSelect.value = data.service || DEFAULTS.service;
    autoRunYouTube.checked = data.autoRunYouTube !== undefined ? data.autoRunYouTube : DEFAULTS.autoRunYouTube;
    youtubeMinDuration.value = data.youtubeMinDuration || DEFAULTS.youtubeMinDuration;
    updateDurationVisibility();
  });

  // Auto-save provider selection
  providerSelect.addEventListener("change", function () {
    const selectedProvider = providerSelect.value;
    chrome.storage.sync.set({ service: selectedProvider }, () => {
      showStatus(`Saved: ${selectedProvider}`);
    });
  });

  // Auto-save YouTube auto-run toggle
  autoRunYouTube.addEventListener("change", function () {
    updateDurationVisibility();
    chrome.storage.sync.set({ autoRunYouTube: autoRunYouTube.checked }, () => {
      showStatus(`YouTube Auto-Run: ${autoRunYouTube.checked ? "Enabled" : "Disabled"}`);
    });
  });

  // Auto-save YouTube min duration
  youtubeMinDuration.addEventListener("change", function () {
    const duration = parseInt(youtubeMinDuration.value, 10) || 10;
    chrome.storage.sync.set({ youtubeMinDuration: duration }, () => {
      showStatus(`Min Duration: ${duration} minutes`);
    });
  });

  // Reset to default preferences
  resetBtn.addEventListener("click", function () {
    providerSelect.value = DEFAULTS.service;
    autoRunYouTube.checked = DEFAULTS.autoRunYouTube;
    youtubeMinDuration.value = DEFAULTS.youtubeMinDuration;
    updateDurationVisibility();

    chrome.storage.sync.set(DEFAULTS, () => {
      showStatus("Reset to default settings", "red");
    });
  });
});
