# Visual Context

Visual Context is a working prototype for collecting the text that a website renders and reviewing how each fragment appeared alongside its surrounding content.

It includes:

- an embeddable, dependency-free browser snippet;
- a collector API with local JSON persistence;
- a sample publisher site; and
- a separate review dashboard that reconstructs typography and neighboring text.

## Run it

Requires Node.js 20 or newer.

```bash
npm start
```

Then open:

- `http://localhost:3000/demo` — example site with the snippet installed
- `http://localhost:3000/dashboard` — captured-text dashboard

Visiting the demo automatically creates a capture. Use **Capture this page** after changing the viewport or page state to capture it again.

## Install the snippet on a site

Add this just before `</body>`:

```html
<script
  async
  src="https://your-collector.example/snippet.js"
  data-project-id="your-project-id"
></script>
```

The snippet posts to the origin serving `snippet.js`. To use a different collector, add `data-endpoint="https://collector.example/api/captures"`.

Add `data-visual-context-ignore` to any element whose subtree should never be captured:

```html
<section data-visual-context-ignore>Private account details</section>
```

The snippet deliberately skips form fields, editable content, hidden elements, scripts, and styles. It limits each page to 100 text fragments and truncates long text. A production deployment should add authentication, retention controls, consent rules, and a database.

## API

- `POST /api/captures` accepts a `{ projectId, page, viewport, capturedAt, fragments }` batch.
- `GET /api/captures?projectId=demo-site` returns newest captures first.

## Test

```bash
npm test
```
