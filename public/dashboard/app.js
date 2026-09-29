const results = document.querySelector("#results");
const searchInput = document.querySelector("#search");
const captureFilter = document.querySelector("#capture-filter");
const clearButton = document.querySelector("#clear-captures");
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

function safeLayoutStyle(element, style = {}) {
  const keys = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
    "color", "backgroundColor", "textAlign", "textTransform", "textDecoration", "whiteSpace",
    "display", "position", "top", "right", "bottom", "left", "boxSizing", "width", "height",
    "minWidth", "maxWidth", "minHeight", "maxHeight", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
    "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "borderRadius",
    "boxShadow", "overflow", "opacity", "flexDirection", "flexWrap", "alignItems", "alignContent",
    "alignSelf", "justifyContent", "justifyItems", "justifySelf", "gap", "rowGap", "columnGap",
    "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow",
  ];
  keys.forEach((key) => { if (style[key]) element.style[key] = style[key]; });
}

function contextNode(node) {
  if (node.type === "text") return text(node.value);

  const element = document.createElement(node.tag || "div");
  safeLayoutStyle(element, node.style);
  if (node.target) element.classList.add("captured-target");
  if (element.matches("button,a")) {
    element.tabIndex = -1;
    element.style.pointerEvents = "none";
  }
  element.append(...(node.children || []).map(contextNode));
  return element;
}

function spatialContext(fragment) {
  const context = fragment.layoutContext;
  if (!context?.tree) return null;

  const preview = document.createElement("div");
  preview.className = "context-preview has-layout";
  preview.style.backgroundColor = context.backgroundColor || fragment.containerBackground || "white";

  const stage = document.createElement("div");
  stage.className = "context-stage";
  const frame = document.createElement("div");
  frame.className = "context-frame";
  const viewport = document.createElement("div");
  viewport.className = "context-viewport";
  viewport.style.width = `${context.crop.width}px`;
  viewport.style.height = `${context.crop.height}px`;

  const root = contextNode(context.tree);
  root.style.position = "absolute";
  root.style.width = `${context.rootWidth}px`;
  root.style.height = `${context.rootHeight}px`;
  root.style.left = `${-context.crop.x}px`;
  root.style.top = `${-context.crop.y}px`;
  viewport.append(root);
  frame.append(viewport);
  stage.append(frame);
  preview.append(stage);

  requestAnimationFrame(() => {
    const scale = Math.min(1, (preview.clientWidth - 48) / context.crop.width);
    frame.style.width = `${context.crop.width * scale}px`;
    frame.style.height = `${context.crop.height * scale}px`;
    viewport.style.transform = `scale(${scale})`;
  });

  return preview;
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

  const preview = spatialContext(fragment) || document.createElement("div");
  if (fragment.layoutContext) {
    card.append(preview, metadata(fragment));
    return card;
  }

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
    const data = await response.json();
    captures = data.captures;
    const fragmentCount = captures.reduce((total, capture) => total + capture.fragments.length, 0);
    document.querySelector("#fragment-count").textContent = fragmentCount;
    document.querySelector("#capture-count").textContent = captures.length;
    document.querySelector("#capture-run-label").textContent = captures.length === 1 ? "capture run" : "capture runs";
    document.querySelector("#project-count").textContent = fragmentCount;
    document.querySelector("#page-summary").textContent = captures.length ? new URL(captures[0].page.url).pathname : "No pages captured yet";
    document.querySelector("#last-updated").textContent = `Updated ${new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date())}`;
    clearButton.disabled = data.totalCaptureCount === 0;

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

async function clearCaptures() {
  const confirmed = window.confirm("Clear all captured data for every project? This cannot be undone.");
  if (!confirmed) return;

  clearButton.disabled = true;
  clearButton.textContent = "Clearing…";
  try {
    const response = await fetch("/api/captures", { method: "DELETE" });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    searchInput.value = "";
    captureFilter.value = "";
    await load();
  } catch (error) {
    window.alert(`Could not clear captures: ${error.message}`);
    clearButton.disabled = false;
  } finally {
    clearButton.textContent = "Clear captures";
  }
}

document.querySelector("#refresh").addEventListener("click", load);
clearButton.addEventListener("click", clearCaptures);
searchInput.addEventListener("input", render);
captureFilter.addEventListener("change", render);
load();
