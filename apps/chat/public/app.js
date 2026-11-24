import { renderMarkdown } from "./render.js";

const params = new URLSearchParams(location.search);
const themeParam = params.get("theme");
const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
const theme = themeParam === "dark" || themeParam === "light" ? themeParam : prefersDark ? "dark" : "light";
document.documentElement.dataset.theme = theme;

const form = document.querySelector("#ask-form");
const input = document.querySelector("#question");
const send = document.querySelector("#send");
const conversation = document.querySelector("#conversation");
const emptyState = document.querySelector("#empty-state");
const template = document.querySelector("#turn-template");
const bubble = document.querySelector("#bubble");
const embed = params.get("embed") === "1";

function setOpen(open) {
  document.body.classList.toggle("chat-minimized", !open);
  bubble.setAttribute("aria-expanded", String(open));
  bubble.setAttribute("aria-label", open ? "Minimizar conversa" : "Abrir conversa");
  if (open) input.focus();
}

document.body.classList.toggle("embed", embed);
if (!embed) document.body.classList.add("chat-minimized");

bubble.addEventListener("click", () => {
  setOpen(document.body.classList.contains("chat-minimized"));
});

let busy = false;

function setBusy(value) {
  busy = value;
  send.disabled = value;
  input.disabled = value;
}

function scrollToBottom() {
  conversation.scrollTop = conversation.scrollHeight;
}

function sourceNode(source) {
  const item = document.createElement("li");

  const title = document.createElement(source.url ? "a" : "span");
  title.className = "source-title";
  title.textContent = source.title;
  if (source.url) {
    title.href = source.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
  }
  item.append(title);

  if (typeof source.score === "number") {
    const score = document.createElement("span");
    score.className = "source-score";
    score.textContent = source.score.toFixed(2);
    item.append(score);
  }

  return item;
}

function addTurn(question) {
  if (emptyState && emptyState.isConnected) emptyState.remove();

  const fragment = template.content.cloneNode(true);
  const turn = fragment.querySelector(".turn");
  turn.querySelector(".question").textContent = question;
  turn.querySelector(".answer").textContent = "Consultando a base…";
  conversation.append(fragment);
  scrollToBottom();
  return turn;
}

function renderError(turn, message, question) {
  const answer = turn.querySelector(".answer");
  answer.replaceChildren();

  const text = document.createElement("p");
  text.className = "error";
  text.textContent = message;

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "retry";
  retry.textContent = "Tentar de novo";
  retry.addEventListener("click", () => {
    turn.remove();
    ask(question);
  });

  answer.append(text, retry);
  scrollToBottom();
}

function renderResult(turn, result) {
  const answer = turn.querySelector(".answer");
  const sources = turn.querySelector(".sources");
  answer.replaceChildren();
  sources.replaceChildren();

  if (result.notFound) {
    const text = document.createElement("p");
    text.className = "not-found";
    text.textContent =
      "Não encontrei isso na base de conhecimento. Tente citar o equipamento, o módulo ou a mensagem de erro.";
    answer.append(text);
    scrollToBottom();
    return;
  }

  answer.innerHTML = renderMarkdown(result.answer);

  if (result.sources.length > 0) {
    const heading = document.createElement("p");
    heading.className = "sources-heading";
    heading.textContent = "Fontes";

    const list = document.createElement("ul");
    for (const source of result.sources) list.append(sourceNode(source));

    sources.append(heading, list);
  }

  scrollToBottom();
}

async function ask(question) {
  if (busy) return;

  const turn = addTurn(question);
  setBusy(true);

  try {
    const response = await fetch("ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.message ?? "Não consegui consultar a base agora. Tente de novo.";
      renderError(turn, message, question);
      return;
    }

    renderResult(turn, payload);
  } catch {
    renderError(turn, "Falha de rede ao consultar a base. Verifique a conexão e tente de novo.", question);
  } finally {
    setBusy(false);
    input.focus();
    scrollToBottom();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (question.length < 3) {
    input.focus();
    return;
  }
  input.value = "";
  ask(question);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

if (embed) input.focus();
