const results = document.querySelector("#results");
const searchInput = document.querySelector("#search");
const captureFilter = document.querySelector("#capture-filter");
let captures = [];

function text(value) {
  return document.createTextNode(value || "");
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function safeStyle(element, style = {}) {
  const keys = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "color", "textAlign", "textTransform", "textDecoration", "whiteSpace"];
  keys.forEach((key) => { if (style[key]) element.style[key] = style[key]; });
}

function contextLine(context) {
  if (!context) return null;
  const line = document.createElement("p");
  line.className = "context-line";
  line.append(text(context.text));
  safeStyle(line, context.style);
  return line;
}

function metadata(fragment) {
  const aside = document.createElement("aside");
  aside.className = "fragment-meta";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.append(text(fragment.tag || "text"));
  aside.append(tag);

  const rows = [
    ["Typeface", `${fragment.style.fontFamily || "Unknown"} · ${fragment.style.fontWeight || "—"}`],
    ["Size / line height", `${fragment.style.fontSize || "—"} / ${fragment.style.lineHeight || "—"}`],
    ["Position", `${Math.round(fragment.rect.width || 0)} × ${Math.round(fragment.rect.height || 0)} at y ${Math.round(fragment.rect.y || 0)}`],
    ["DOM path", fragment.path || "—"],
  ];
  const list = document.createElement("dl");
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt"); term.append(text(label));
    const definition = document.createElement("dd"); definition.append(text(value));
    list.append(term, definition);
  });
  aside.append(list);
  return aside;
}

function fragmentCard(fragment) {
  const card = document.createElement("article");
  card.className = "fragment-card";

  const preview = document.createElement("div");
  preview.className = "context-preview";
  preview.style.backgroundColor = fragment.containerBackground || "white";
  const before = contextLine(fragment.before);
  if (before) preview.append(before);

  const target = document.createElement("p");
  target.className = "target-line";
  target.append(text(fragment.text));
  safeStyle(target, fragment.style);
  preview.append(target);

  const after = contextLine(fragment.after);
  if (after) preview.append(after);
  card.append(preview, metadata(fragment));
  return card;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedCapture = captureFilter.value;
  results.replaceChildren();

  const shown = captures
    .filter((capture) => !selectedCapture || capture.id === selectedCapture)
    .map((capture) => ({
      ...capture,
      fragments: capture.fragments.filter((fragment) => fragment.text.toLowerCase().includes(query)),
    }))
    .filter((capture) => capture.fragments.length);

  if (!shown.length) {
    const empty = document.querySelector("#empty-template").content.cloneNode(true);
    if (captures.length) {
      empty.querySelector("h2").textContent = "No matching text";
      empty.querySelector("p").textContent = "Try a different search or capture-run filter.";
      empty.querySelector("a").remove();
    }
    results.append(empty);
    return;
  }

  shown.forEach((capture) => {
    const group = document.createElement("section");
    group.className = "capture-group";
    const heading = document.createElement("div");
    heading.className = "capture-heading";
    const title = document.createElement("h2"); title.append(text(capture.page.title || "Untitled page"));
    const details = document.createElement("span"); details.append(text(`${formatTime(capture.capturedAt)} · ${capture.viewport.width} × ${capture.viewport.height}`));
    heading.append(title, details);
    group.append(heading, ...capture.fragments.map(fragmentCard));
    results.append(group);
  });
}

async function load() {
  const refreshButton = document.querySelector("#refresh");
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/captures?projectId=demo-site", { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    captures = (await response.json()).captures;
    const fragmentCount = captures.reduce((total, capture) => total + capture.fragments.length, 0);
    document.querySelector("#fragment-count").textContent = fragmentCount;
    document.querySelector("#capture-count").textContent = captures.length;
    document.querySelector("#capture-run-label").textContent = captures.length === 1 ? "capture run" : "capture runs";
    document.querySelector("#project-count").textContent = fragmentCount;
    document.querySelector("#page-summary").textContent = captures.length ? new URL(captures[0].page.url).pathname : "No pages captured yet";
    document.querySelector("#last-updated").textContent = `Updated ${new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date())}`;

    const selected = captureFilter.value;
    captureFilter.replaceChildren(new Option("All capture runs", ""));
    captures.forEach((capture) => captureFilter.add(new Option(formatTime(capture.capturedAt), capture.id)));
    captureFilter.value = captures.some((capture) => capture.id === selected) ? selected : "";
    render();
  } catch (error) {
    results.innerHTML = `<div class="empty-state"><span>!</span><h2>Could not load captures</h2><p>${error.message}</p></div>`;
  } finally {
    refreshButton.disabled = false;
  }
}

document.querySelector("#refresh").addEventListener("click", load);
searchInput.addEventListener("input", render);
captureFilter.addEventListener("change", render);
load();
