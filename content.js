(() => {
  if (window.__LETTER_HEIST_MONKEY__) return;
  window.__LETTER_HEIST_MONKEY__ = true;

  // Default settings
  const DEFAULTS = {
    dailyRotation: true,      // keep same target for the day
    vowelOnly: false,         // only pick vowels
    stealPunctuation: false,  // pick punctuation instead of letters
    mercyMode: true,          // do not modify forms/editables
    intensity: 1.0            // 0.3, 0.6, 1.0
  };

  const SKIP_TAGS_BASE = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME",
    "CODE", "PRE", "KBD", "SAMP",
    "SVG", "CANVAS"
  ]);

  const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON", "LABEL"]);

  const clamp01 = (n) => Math.max(0, Math.min(1, n));

  const isEditableOrForm = (el) => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (FORM_TAGS.has(el.tagName)) return true;

    // Some sites use roles for inputs
    const role = (el.getAttribute && el.getAttribute("role")) || "";
    if (role && /textbox|combobox|searchbox|spinbutton/i.test(role)) return true;

    return false;
  };

  const shouldSkipNode = (node, mercyMode) => {
    if (!node) return true;
    const p = node.parentElement;
    if (!p) return true;

    if (SKIP_TAGS_BASE.has(p.tagName)) return true;

    // Mercy mode: avoid forms / editable areas / password fields
    if (mercyMode) {
      if (isEditableOrForm(p)) return true;

      if (p.tagName === "INPUT") {
        const type = (p.getAttribute("type") || "").toLowerCase();
        if (type === "password" || type === "email" || type === "search" || type === "tel" || type === "url") {
          return true;
        }
      }

      // Also avoid anything inside a form
      if (p.closest && p.closest("form")) return true;
    }

    // Skip hidden stuff
    const style = window.getComputedStyle(p);
    if (style && (style.display === "none" || style.visibility === "hidden")) return true;

    // Don't sabotage our own monkey UI
    if (p.id === "__letter_heist_monkey__") return true;

    return false;
  };

  const pickTarget = (settings) => {
    const vowels = ["a", "e", "i", "o", "u"];
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    const punctuation = [
      ".", ",", "!", "?", ";", ":", "'", "\"", "(", ")", "[", "]", "{", "}", "-", "–", "—"
    ];

    // If punctuation mode is on, we pick from punctuation, otherwise letters (with optional vowel-only bias)
    if (settings.stealPunctuation) {
      return punctuation[Math.floor(Math.random() * punctuation.length)];
    }

    const pool = settings.vowelOnly ? vowels : letters;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const todayKeyUTC = () => {
    const d = new Date();
    // UTC day key to keep it stable across time zones and reloads
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const loadSettings = () =>
    new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (items) => resolve(items || { ...DEFAULTS }));
    });

  const getOrCreateDailyTarget = async (settings) => {
    if (!settings.dailyRotation) return { target: pickTarget(settings), daily: false };

    const key = `dailyTarget:${todayKeyUTC()}`;
    const existing = await new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res && res[key]));
    });

    if (existing && typeof existing === "string") {
      return { target: existing, daily: true };
    }

    const t = pickTarget(settings);
    await new Promise((resolve) => {
      chrome.storage.local.set({ [key]: t }, () => resolve());
    });
    return { target: t, daily: true };
  };

  const makeRegex = (target) => {
    // If target is a letter, remove case-insensitive. If punctuation, literal match.
    const isLetter = /^[a-z]$/i.test(target);
    if (isLetter) return new RegExp(target, "gi");

    // Escape punctuation for regex
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "g");
  };

  // Intensity: remove only some occurrences
  const stealByIntensity = (text, re, intensity) => {
    intensity = clamp01(intensity);

    if (intensity >= 0.999) return text.replace(re, "");

    // Replace occurrence-by-occurrence with a probability
    return text.replace(re, (match) => (Math.random() < intensity ? "" : match));
  };

  const walkAndSteal = (root, re, settings) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (shouldSkipNode(node, settings.mercyMode)) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue) return NodeFilter.FILTER_SKIP;
          return re.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    // Reset global regex state (because /g/)
    re.lastIndex = 0;

    for (const n of nodes) {
      if (!n.nodeValue) continue;
      if (shouldSkipNode(n, settings.mercyMode)) continue;

      const before = n.nodeValue;
      re.lastIndex = 0;

      if (!re.test(before)) {
        re.lastIndex = 0;
        continue;
      }
      re.lastIndex = 0;

      const after = stealByIntensity(before, re, settings.intensity);
      if (after !== before) n.nodeValue = after;

      re.lastIndex = 0;
    }
  };

  const injectMonkey = (target, settings, daily) => {
    const monkey = document.createElement("div");
    monkey.id = "__letter_heist_monkey__";
    monkey.style.cssText = `
      position: fixed;
      left: 20px;
      top: 20px;
      width: 64px;
      height: 64px;
      z-index: 2147483647;
      pointer-events: none;
      transform: translate(0, 0);
      transition: transform 650ms cubic-bezier(.2,1.2,.2,1);
      filter: drop-shadow(0 8px 10px rgba(0,0,0,0.25));
    `;

    const label = document.createElement("div");
    const modeBits = [
      daily ? "daily" : "session",
      settings.vowelOnly ? "vowels" : "letters",
      settings.stealPunctuation ? "punct" : null,
      settings.mercyMode ? "mercy" : "no mercy",
      `${Math.round(settings.intensity * 100)}%`
    ].filter(Boolean).join(" · ");

    label.textContent = `Stealing: "${target}" (${modeBits})`;
    label.style.cssText = `
      position: absolute;
      left: 50%;
      top: -18px;
      transform: translateX(-50%);
      font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      background: rgba(0,0,0,0.75);
      color: white;
      padding: 3px 6px;
      border-radius: 999px;
      white-space: nowrap;
    `;

    const img = document.createElement("img");
    img.alt = "";
    img.src = chrome.runtime.getURL("monkey.svg");
    img.style.cssText = `width: 100%; height: 100%; user-select: none;`;

    monkey.appendChild(label);
    monkey.appendChild(img);
    document.documentElement.appendChild(monkey);

    const style = document.createElement("style");
    style.textContent = `
      @keyframes __monkey_jump__ {
        0%   { transform: translate(var(--x), var(--y)) scale(1); }
        35%  { transform: translate(var(--x), calc(var(--y) - 30px)) scale(1.02); }
        70%  { transform: translate(var(--x), var(--y)) scale(1); }
        100% { transform: translate(var(--x), var(--y)) scale(1); }
      }
      #__letter_heist_monkey__.jump {
        animation: __monkey_jump__ 650ms ease-in-out;
      }
    `;
    document.documentElement.appendChild(style);

    const moveMonkey = () => {
      const pad = 10;
      const w = 64, h = 64;
      const maxX = Math.max(pad, window.innerWidth - w - pad);
      const maxY = Math.max(pad, window.innerHeight - h - pad);

      const x = Math.floor(Math.random() * maxX);
      const y = Math.floor(Math.random() * maxY);

      monkey.style.setProperty("--x", `${x}px`);
      monkey.style.setProperty("--y", `${y}px`);

      monkey.classList.remove("jump");
      void monkey.offsetWidth;
      monkey.classList.add("jump");
    };

    moveMonkey();
    const interval = setInterval(moveMonkey, 1200);
    window.addEventListener("beforeunload", () => clearInterval(interval));
  };

  const main = async () => {
    const settings = await loadSettings();
    // normalize intensity to one of expected values if user typed weirdness
    const intensity = Number(settings.intensity);
    settings.intensity = [0.3, 0.6, 1].includes(intensity) ? intensity : DEFAULTS.intensity;

    const { target, daily } = await getOrCreateDailyTarget(settings);
    const re = makeRegex(target);

    // Initial sweep
    walkAndSteal(document.body || document.documentElement, re, settings);

    // Observe future changes
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") {
          const n = m.target;
          if (!n || n.nodeType !== Node.TEXT_NODE) continue;
          if (shouldSkipNode(n, settings.mercyMode)) continue;
          const v = n.nodeValue || "";
          re.lastIndex = 0;
          if (!re.test(v)) continue;
          re.lastIndex = 0;
          n.nodeValue = stealByIntensity(v, re, settings.intensity);
          re.lastIndex = 0;
        } else if (m.type === "childList") {
          for (const n of m.addedNodes) {
            if (n.nodeType === Node.TEXT_NODE) {
              if (shouldSkipNode(n, settings.mercyMode)) continue;
              const v = n.nodeValue || "";
              re.lastIndex = 0;
              if (!re.test(v)) continue;
              re.lastIndex = 0;
              n.nodeValue = stealByIntensity(v, re, settings.intensity);
              re.lastIndex = 0;
            } else if (n.nodeType === Node.ELEMENT_NODE) {
              if (n.id === "__letter_heist_monkey__") continue;
              walkAndSteal(n, re, settings);
            }
          }
        }
      }
    });

    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true
    });

    // UI last so we don't sabotage our own label
    injectMonkey(target, settings, daily);
  };

  main().catch(() => {});
})();
