(function visualContextSnippet() {
  "use strict";

  const script = document.currentScript;
  if (!script) return;

  const projectId = script.dataset.projectId;
  if (!projectId) {
    console.warn("Visual Context: data-project-id is required.");
    return;
  }

  const endpoint = script.dataset.endpoint || new URL("/api/captures", script.src).href;
  const textSelector = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,button,a,label,small,dt,dd";
  const styleKeys = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
    "letterSpacing", "color", "backgroundColor", "textAlign",
    "textTransform", "textDecoration", "whiteSpace",
  ];
  const layoutStyleKeys = [
    ...styleKeys, "display", "position", "top", "right", "bottom", "left",
    "boxSizing", "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "marginTop", "marginRight", "marginBottom", "marginLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
    "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
    "borderRadius", "boxShadow", "overflow", "opacity",
    "flexDirection", "flexWrap", "alignItems", "alignContent", "alignSelf",
    "justifyContent", "justifyItems", "justifySelf", "gap", "rowGap", "columnGap",
    "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow",
  ];

  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function canCapture(element) {
    return !element.closest("[data-visual-context-ignore],form,[contenteditable='true']") &&
      isVisible(element) && normalizeText(element.innerText || "");
  }

  function readStyle(element) {
    const computed = getComputedStyle(element);
    return Object.fromEntries(styleKeys.map((key) => [key, computed[key]]));
  }

  function readLayoutStyle(element) {
    const computed = getComputedStyle(element);
    return Object.fromEntries(layoutStyleKeys.map((key) => [key, computed[key]]));
  }

  function elementPath(element) {
    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 5) {
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current.tagName)
        : [];
      const position = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : "";
      parts.unshift(`${tag}${position}`);
      current = current.parentElement;
    }
    return `body>${parts.join(">")}`;
  }

  function contextFor(element) {
    if (!element) return null;
    return {
      text: normalizeText(element.innerText || ""),
      tag: element.tagName.toLowerCase(),
      style: readStyle(element),
    };
  }

  function opaqueBackground(element) {
    let current = element;
    while (current) {
      const color = getComputedStyle(current).backgroundColor;
      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
      current = current.parentElement;
    }
    return "rgb(255, 255, 255)";
  }

  function contextRootFor(element) {
    let root = element.parentElement || element;
    let best = root;

    for (let depth = 0; depth < 4 && root && root !== document.body; depth += 1) {
      const count = [...root.querySelectorAll(textSelector)].filter(canCapture).length;
      if (count <= 15) best = root;
      if (count >= 4 && count <= 15) break;
      root = root.parentElement;
    }

    return best;
  }

  function serializeNode(node, target, state, depth = 0) {
    if (depth > 7 || state.count >= 80) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent.replace(/\s+/g, " ").slice(0, 500);
      return value.trim() ? { type: "text", value } : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches("script,style,noscript,svg")) return null;
    if (node !== target && !isVisible(node)) return null;

    state.count += 1;
    return {
      type: "element",
      tag: node.tagName.toLowerCase(),
      target: node === target,
      style: readLayoutStyle(node),
      children: [...node.childNodes]
        .map((child) => serializeNode(child, target, state, depth + 1))
        .filter(Boolean),
    };
  }

  function layoutContextFor(element) {
    const root = contextRootFor(element);
    const rootRect = root.getBoundingClientRect();
    const relevant = [...(root.matches(textSelector) ? [root] : []), ...root.querySelectorAll(textSelector)]
      .filter(canCapture)
      .map((candidate) => candidate.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);

    const padding = 24;
    const left = Math.max(0, Math.min(...relevant.map((rect) => rect.left)) - rootRect.left - padding);
    const top = Math.max(0, Math.min(...relevant.map((rect) => rect.top)) - rootRect.top - padding);
    const right = Math.min(rootRect.width, Math.max(...relevant.map((rect) => rect.right)) - rootRect.left + padding);
    const bottom = Math.min(rootRect.height, Math.max(...relevant.map((rect) => rect.bottom)) - rootRect.top + padding);

    return {
      rootWidth: Math.round(rootRect.width),
      rootHeight: Math.round(rootRect.height),
      crop: {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.max(1, Math.round(right - left)),
        height: Math.max(1, Math.round(bottom - top)),
      },
      backgroundColor: opaqueBackground(root),
      tree: serializeNode(root, element, { count: 0 }),
    };
  }

  function collect() {
    const elements = [...document.querySelectorAll(textSelector)].filter(canCapture).slice(0, 100);
    const fragments = elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        text: normalizeText(element.innerText),
        tag: element.tagName.toLowerCase(),
        path: elementPath(element),
        style: readStyle(element),
        containerBackground: opaqueBackground(element),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        layoutContext: layoutContextFor(element),
        before: contextFor(elements[index - 1]),
        after: contextFor(elements[index + 1]),
      };
    });

    if (!fragments.length) return null;
    return {
      projectId,
      capturedAt: new Date().toISOString(),
      page: { url: location.href, title: document.title },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      fragments,
    };
  }

  async function capture() {
    const payload = collect();
    if (!payload) return;
    const body = JSON.stringify(payload);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        credentials: "omit",
        keepalive: body.length < 60_000,
      });
      if (!response.ok) throw new Error(`Collector returned ${response.status}`);
      const detail = await response.json();
      window.dispatchEvent(new CustomEvent("visual-context:captured", { detail }));
    } catch (error) {
      console.warn("Visual Context: capture failed.", error);
      window.dispatchEvent(new CustomEvent("visual-context:error", { detail: error.message }));
    }
  }

  window.VisualContext = { capture };
  if (document.readyState === "complete") capture();
  else window.addEventListener("load", capture, { once: true });
}());
