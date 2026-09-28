const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DEFAULT_DATA_FILE = path.join(ROOT, "data", "captures.json");
const MAX_BODY_BYTES = 1_000_000;
const MAX_FRAGMENTS = 100;

const routes = new Map([
  ["/", "index.html"],
  ["/demo", "demo/index.html"],
  ["/dashboard", "dashboard/index.html"],
  ["/snippet.js", "snippet.js"],
]);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

function cleanString(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStyle(value) {
  if (!value || typeof value !== "object") return {};

  const allowed = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
    "letterSpacing", "color", "backgroundColor", "textAlign",
    "textTransform", "textDecoration", "whiteSpace",
  ];

  return Object.fromEntries(
    allowed
      .filter((key) => typeof value[key] === "string")
      .map((key) => [key, value[key].slice(0, 200)]),
  );
}

function cleanContext(value) {
  if (!value || typeof value !== "object") return null;
  const text = cleanString(value.text);
  if (!text) return null;
  return { text, tag: cleanString(value.tag, 20), style: cleanStyle(value.style) };
}

function validateCapture(body) {
  if (!body || typeof body !== "object") throw new Error("A JSON object is required.");

  const projectId = cleanString(body.projectId, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error("projectId must contain only letters, numbers, underscores, or hyphens.");
  }
  if (!Array.isArray(body.fragments) || body.fragments.length === 0) {
    throw new Error("At least one text fragment is required.");
  }

  const fragments = body.fragments.slice(0, MAX_FRAGMENTS).map((fragment) => {
    const text = cleanString(fragment?.text);
    if (!text) return null;

    const rect = fragment.rect && typeof fragment.rect === "object" ? {
      x: Number(fragment.rect.x) || 0,
      y: Number(fragment.rect.y) || 0,
      width: Math.max(0, Number(fragment.rect.width) || 0),
      height: Math.max(0, Number(fragment.rect.height) || 0),
    } : {};

    return {
      id: randomUUID(),
      text,
      tag: cleanString(fragment.tag, 20),
      path: cleanString(fragment.path, 300),
      style: cleanStyle(fragment.style),
      containerBackground: cleanString(fragment.containerBackground, 100),
      rect,
      before: cleanContext(fragment.before),
      after: cleanContext(fragment.after),
    };
  }).filter(Boolean);

  if (fragments.length === 0) throw new Error("At least one non-empty text fragment is required.");

  return {
    id: randomUUID(),
    projectId,
    capturedAt: Number.isFinite(Date.parse(body.capturedAt))
      ? new Date(body.capturedAt).toISOString()
      : new Date().toISOString(),
    page: {
      url: cleanString(body.page?.url, 1000),
      title: cleanString(body.page?.title, 300),
    },
    viewport: {
      width: Math.max(0, Number(body.viewport?.width) || 0),
      height: Math.max(0, Number(body.viewport?.height) || 0),
    },
    fragments,
  };
}

async function readStore(dataFile) {
  try {
    const captures = JSON.parse(await fs.readFile(dataFile, "utf8"));
    return Array.isArray(captures) ? captures : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeStore(dataFile, captures) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(captures, null, 2));
  await fs.rename(temporaryFile, dataFile);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(response, pathname) {
  const relativePath = routes.get(pathname) || pathname.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) return false;

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": pathname === "/snippet.js" ? "no-cache" : "public, max-age=60",
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return false;
    throw error;
  }
}

function createServer({ dataFile = DEFAULT_DATA_FILE } = {}) {
  let writeQueue = Promise.resolve();

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    try {
      if (request.method === "OPTIONS" && url.pathname === "/api/captures") {
        response.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/captures") {
        const projectId = cleanString(url.searchParams.get("projectId"), 80);
        const captures = (await readStore(dataFile))
          .filter((capture) => !projectId || capture.projectId === projectId)
          .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
        sendJson(response, 200, { captures });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/captures") {
        const capture = validateCapture(await readBody(request));
        writeQueue = writeQueue.then(async () => {
          const captures = await readStore(dataFile);
          captures.push(capture);
          await writeStore(dataFile, captures.slice(-200));
        });
        await writeQueue;
        sendJson(response, 201, { id: capture.id, fragmentCount: capture.fragments.length });
        return;
      }

      if (request.method === "GET" && await serveStatic(response, url.pathname)) return;
      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const isClientError = error instanceof SyntaxError || /required|projectId|too large/.test(error.message);
      sendJson(response, isClientError ? 400 : 500, {
        error: isClientError ? error.message : "The server could not complete the request.",
      });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`Visual Context is running at http://localhost:${port}`);
  });
}

module.exports = { createServer, validateCapture };
