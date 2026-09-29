const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("../server");

async function withServer(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "visual-context-"));
  const server = createServer({ dataFile: path.join(directory, "captures.json") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("stores, sanitizes, and returns a capture", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "site_one",
        capturedAt: "2026-09-28T12:00:00.000Z",
        page: { url: "https://example.com/story", title: "Story" },
        viewport: { width: 1280, height: 720 },
        fragments: [{
          text: "  A rendered heading  ",
          tag: "h1",
          path: "body>main>h1",
          style: { fontSize: "64px", position: "fixed" },
          rect: { x: 20, y: 80, width: 600, height: 90 },
          layoutContext: {
            rootWidth: 800,
            rootHeight: 120,
            crop: { x: 10, y: 5, width: 780, height: 100 },
            backgroundColor: "rgb(255, 255, 255)",
            tree: {
              type: "element",
              tag: "header",
              style: { display: "flex", backgroundImage: "url(evil)" },
              children: [{
                type: "element",
                tag: "button",
                target: true,
                style: { borderRadius: "999px", paddingLeft: "16px" },
                children: [{ type: "text", value: "Bag 0" }],
              }],
            },
          },
          before: { text: "Introduction", tag: "p", style: { color: "red" } },
        }],
      }),
    });

    assert.equal(response.status, 201);
    assert.equal((await response.json()).fragmentCount, 1);

    const list = await fetch(`${baseUrl}/api/captures?projectId=site_one`).then((result) => result.json());
    assert.equal(list.captures.length, 1);
    assert.equal(list.totalCaptureCount, 1);
    assert.equal(list.captures[0].fragments[0].text, "A rendered heading");
    assert.deepEqual(list.captures[0].fragments[0].style, { fontSize: "64px" });
    assert.equal(list.captures[0].fragments[0].before.text, "Introduction");
    assert.equal(list.captures[0].fragments[0].layoutContext.tree.tag, "header");
    assert.deepEqual(list.captures[0].fragments[0].layoutContext.tree.style, { display: "flex" });
    assert.equal(list.captures[0].fragments[0].layoutContext.tree.children[0].children[0].value, "Bag 0");
  });
});

test("rejects invalid and empty capture payloads", async () => {
  await withServer(async (baseUrl) => {
    const invalidProject = await fetch(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "not valid!", fragments: [{ text: "Hello" }] }),
    });
    assert.equal(invalidProject.status, 400);

    const empty = await fetch(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "valid", fragments: [] }),
    });
    assert.equal(empty.status, 400);
  });
});

test("deletes every stored capture", async () => {
  await withServer(async (baseUrl) => {
    for (const projectId of ["site_one", "site_two"]) {
      const response = await fetch(`${baseUrl}/api/captures`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, fragments: [{ text: `Text for ${projectId}` }] }),
      });
      assert.equal(response.status, 201);
    }

    const filtered = await fetch(`${baseUrl}/api/captures?projectId=site_one`).then((result) => result.json());
    assert.equal(filtered.captures.length, 1);
    assert.equal(filtered.totalCaptureCount, 2);

    const response = await fetch(`${baseUrl}/api/captures`, { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deletedCount: 2 });

    const list = await fetch(`${baseUrl}/api/captures`).then((result) => result.json());
    assert.deepEqual(list, { captures: [], totalCaptureCount: 0 });
  });
});

test("serves the snippet and both applications", async () => {
  await withServer(async (baseUrl) => {
    for (const route of ["/snippet.js", "/demo", "/dashboard"]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200, route);
    }
  });
});
