(function () {
  "use strict";

  var script = document.currentScript;
  var base = script && script.getAttribute("data-chat-src");
  if (!base) return;

  function detectTheme() {
    try {
      var raw = window.localStorage.getItem("theme");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed === "dark" || parsed === "light") return parsed;
      }
    } catch (error) {
      // storage bloqueado: cai na preferência do sistema
    }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  var theme = detectTheme();
  var chatSrc = base.replace(/\/+$/, "") + "/?embed=1&theme=" + theme;
  var isDark = theme === "dark";

  var css =
    ".kb-chat-bubble{position:fixed;right:20px;bottom:20px;z-index:2147483646;" +
    "width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;" +
    "background:#0b6b6b;display:flex;align-items:center;justify-content:center;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.25)}" +
    ".kb-chat-bubble:hover{background:#084f4f}" +
    ".kb-chat-bubble[data-theme=dark]{background:#0f766e}" +
    ".kb-chat-bubble[data-theme=dark]:hover{background:#115e59}" +
    ".kb-chat-bubble svg{width:26px;height:26px;fill:#fff}" +
    ".kb-chat-frame{position:fixed;right:20px;bottom:88px;z-index:2147483646;" +
    "width:min(400px,calc(100vw - 32px));height:min(620px,calc(100vh - 160px));" +
    "border:1px solid #e3e7ec;border-radius:16px;background:#fff;" +
    "box-shadow:0 12px 32px rgba(16,24,40,.18)}" +
    "@media(max-width:640px){.kb-chat-frame{left:12px;right:12px;bottom:84px;" +
    "width:auto;height:calc(100dvh - 104px)}.kb-chat-bubble{right:16px;bottom:16px}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "kb-chat-bubble";
  bubble.dataset.theme = theme;
  bubble.setAttribute("aria-label", "Abrir chat");
  bubble.setAttribute("aria-expanded", "false");
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-5 4V4a1 1 0 0 1 1-1z"/>' +
    "</svg>";

  var frame = document.createElement("iframe");
  frame.className = "kb-chat-frame";
  frame.hidden = true;
  frame.title = "Chat base de conhecimento";

  function applyTheme(next) {
    theme = next;
    isDark = theme === "dark";
    chatSrc = base.replace(/\/+$/, "") + "/?embed=1&theme=" + theme;
    bubble.dataset.theme = theme;
    frame.style.background = isDark ? "#171b22" : "#ffffff";
    frame.style.borderColor = isDark ? "#2a303a" : "#e3e7ec";
    frame.style.boxShadow = isDark
      ? "0 12px 32px rgba(0,0,0,.5)"
      : "0 12px 32px rgba(16,24,40,.18)";
  }

  applyTheme(theme);

  var loaded = false;
  bubble.addEventListener("click", function () {
    var open = frame.hidden;
    if (open) {
      var current = detectTheme();
      if (current !== theme) {
        applyTheme(current);
        loaded = false;
        frame.removeAttribute("src");
      }
      if (!loaded) {
        frame.src = chatSrc;
        loaded = true;
      }
    }
    frame.hidden = !open;
    bubble.setAttribute("aria-expanded", String(open));
    bubble.setAttribute("aria-label", open ? "Fechar chat" : "Abrir chat");
  });

  document.body.appendChild(bubble);
  document.body.appendChild(frame);
})();
