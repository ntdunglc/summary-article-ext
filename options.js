document.addEventListener("DOMContentLoaded", function () {
  const providerSelect = document.getElementById("providerSelect");
  const agyModelSelect = document.getElementById("agyModelSelect");
  const resetBtn = document.getElementById("resetBtn");
  const status = document.getElementById("status");

  const DEFAULT_AGY_MODEL = "MODEL_PLACEHOLDER_M532"; // Gemini 4 Neon (High)
  const DEFAULTS = {
    service: "antigravity",
    agyModel: DEFAULT_AGY_MODEL
  };

  const LEGACY_MODEL_MAP = {
    neon: "MODEL_PLACEHOLDER_M532",
    neon_high: "MODEL_PLACEHOLDER_M532",
    neon_xhigh: "MODEL_PLACEHOLDER_M535",
    neon_medium: "MODEL_PLACEHOLDER_M533",
    neon_low: "MODEL_PLACEHOLDER_M534",
    hydrogen: "MODEL_PLACEHOLDER_M525",
    hydrogen_high: "MODEL_PLACEHOLDER_M525",
    hydrogen_xhigh: "MODEL_PLACEHOLDER_M528",
    hydrogen_medium: "MODEL_PLACEHOLDER_M526",
    hydrogen_low: "MODEL_PLACEHOLDER_M527",
    flash: "MODEL_PLACEHOLDER_M318",
    flash_high: "MODEL_PLACEHOLDER_M318",
    flash_medium: "MODEL_PLACEHOLDER_M319",
    flash_lite: "MODEL_PLACEHOLDER_M320",
    flash_low: "MODEL_PLACEHOLDER_M320"
  };

  function normalizeModelId(val) {
    if (!val) return DEFAULT_AGY_MODEL;
    return LEGACY_MODEL_MAP[val] || val;
  }

  function showStatus(message, color = "green") {
    status.textContent = message;
    status.style.color = color;
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  }

  function populateModelOptions(models, selectedId, defaultId) {
    if (!agyModelSelect || !Array.isArray(models) || models.length === 0) return;
    agyModelSelect.innerHTML = "";
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.id === defaultId ? `${m.label} — Default` : m.label;
      agyModelSelect.appendChild(opt);
    }
    const target = normalizeModelId(selectedId);
    if ([...agyModelSelect.options].some((o) => o.value === target)) {
      agyModelSelect.value = target;
    } else {
      agyModelSelect.value = defaultId || models[0].id;
    }
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("autoreload") === "1") {
    chrome.storage.sync.set(
      {
        service: "antigravity",
        agyModel: DEFAULT_AGY_MODEL,
        agyMigratedV1: true,
        agyHydrogenMigratedV1: true,
        agyNeonMigratedV1: true
      },
      () => {
        providerSelect.value = "antigravity";
        if (agyModelSelect) agyModelSelect.value = DEFAULT_AGY_MODEL;
        showStatus("Updated to Antigravity (Neon 4) & reloaded!");
        setTimeout(() => {
          chrome.runtime.reload();
        }, 250);
      }
    );
    return;
  }

  // Load stored preferences, then refresh dropdown dynamically from AGY sidecar
  chrome.storage.sync.get({ ...DEFAULTS, agyNeonMigratedV1: false }, (data) => {
    providerSelect.value = data.service || DEFAULTS.service;
    let currentModel = data.agyNeonMigratedV1
      ? normalizeModelId(data.agyModel)
      : DEFAULT_AGY_MODEL;
    if (!data.agyNeonMigratedV1) {
      chrome.storage.sync.set({ agyModel: DEFAULT_AGY_MODEL, agyNeonMigratedV1: true });
    }
    if (agyModelSelect) {
      if ([...agyModelSelect.options].some((o) => o.value === currentModel)) {
        agyModelSelect.value = currentModel;
      }
      fetch("http://127.0.0.1:8787/api/models")
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.ok && Array.isArray(res.models) && res.models.length > 0) {
            populateModelOptions(res.models, currentModel, res.defaultModel || DEFAULT_AGY_MODEL);
          }
        })
        .catch(() => {});
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
      const selectedLabel = agyModelSelect.options[agyModelSelect.selectedIndex]?.textContent || selectedModel;
      chrome.storage.sync.set({ agyModel: selectedModel, agyNeonMigratedV1: true }, () => {
        showStatus(`Saved AGY model: ${selectedLabel}`);
      });
    });
  }

  // Reset to default preferences
  resetBtn.addEventListener("click", function () {
    providerSelect.value = DEFAULTS.service;
    if (agyModelSelect) {
      agyModelSelect.value = DEFAULTS.agyModel;
    }
    chrome.storage.sync.set({ ...DEFAULTS, agyNeonMigratedV1: true }, () => {
      showStatus("Reset to default settings", "#ef4444");
    });
  });
});
