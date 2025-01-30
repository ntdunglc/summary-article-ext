document.addEventListener("DOMContentLoaded", function () {
  const providerSelect = document.getElementById("providerSelect");
  const resetBtn = document.getElementById("resetBtn");
  const status = document.getElementById("status");

  const defaultProvider = "claude"; // Default provider

  // Load stored provider preference
  chrome.storage.sync.get("service", (data) => {
    providerSelect.value = data.service || defaultProvider;
  });

  // Auto-save provider selection when changed
  providerSelect.addEventListener("change", function () {
    const selectedProvider = providerSelect.value;
    chrome.storage.sync.set({ service: selectedProvider }, () => {
      status.textContent = `Saved: ${selectedProvider}`;
      status.style.color = "green";
      setTimeout(() => (status.textContent = ""), 2000);
    });
  });

  // Reset to default provider
  resetBtn.addEventListener("click", function () {
    providerSelect.value = defaultProvider;
    chrome.storage.sync.set({ service: defaultProvider }, () => {
      status.textContent = "Reset to default (Claude AI)";
      status.style.color = "red";
      setTimeout(() => (status.textContent = ""), 2000);
    });
  });
});
