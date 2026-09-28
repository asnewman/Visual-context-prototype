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

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        keepalive: true,
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
