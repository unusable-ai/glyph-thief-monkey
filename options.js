const DEFAULTS = {
  dailyRotation: true,
  vowelOnly: false,
  stealPunctuation: false,
  mercyMode: true,
  intensity: 1.0
};

const ids = ["dailyRotation", "vowelOnly", "stealPunctuation", "mercyMode", "intensity"];

const load = () => {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    document.getElementById("dailyRotation").checked = !!items.dailyRotation;
    document.getElementById("vowelOnly").checked = !!items.vowelOnly;
    document.getElementById("stealPunctuation").checked = !!items.stealPunctuation;
    document.getElementById("mercyMode").checked = !!items.mercyMode;
    document.getElementById("intensity").value = String(items.intensity ?? DEFAULTS.intensity);
  });
};

const save = () => {
  const payload = {
    dailyRotation: document.getElementById("dailyRotation").checked,
    vowelOnly: document.getElementById("vowelOnly").checked,
    stealPunctuation: document.getElementById("stealPunctuation").checked,
    mercyMode: document.getElementById("mercyMode").checked,
    intensity: Number(document.getElementById("intensity").value)
  };
  chrome.storage.sync.set(payload);
};

// Simple guardrails:
// If stealPunctuation is on, vowelOnly is irrelevant. We allow it but it does nothing.
document.addEventListener("DOMContentLoaded", () => {
  load();
  ids.forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("change", save);
  });
});
