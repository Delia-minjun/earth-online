// Run after building: node test/review.browser.mjs <build-directory>
// Uses installed Chrome and mocked APIs; never connects to the user's database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const build = resolve(process.argv[2] ?? "dist");
const profile = await mkdtemp(join(tmpdir(), "earth-review-chrome-"));
const chrome = spawn(process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let socket;
let browser;
let nextId = 0;
const pending = new Map();
const errors = [];
// Keep Node alive while Chrome's debugger WebSocket has an outstanding command.
const keepAlive = setInterval(() => {}, 1000);
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
async function until(check) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error("Browser assertion timed out");
}
const waitFor = (expression) => until(() => evaluate(expression));

try {
  let port;
  await until(async () => {
    try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; return true; }
    catch { return false; }
  });
  browser = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails);
    } else if (message.method === "Fetch.requestPaused") {
      void (async () => {
        const { requestId, request } = message.params;
        const path = decodeURIComponent(new URL(request.url).pathname);
        // Only serve the built app. All APIs are replaced in the page below.
        const file = path === "/" ? "index.html" : path.slice(1);
        const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
        try {
          const body = await readFile(join(build, file));
          await send("Fetch.fulfillRequest", { requestId, responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: mime[extname(file)] ?? "application/octet-stream" }],
            body: body.toString("base64") });
        } catch {
          await send("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" });
        }
      })().catch((e) => errors.push(String(e)));
    }
  };
  socket.onclose = () => {
    for (const request of pending.values()) request.reject(new Error("Chrome debugger disconnected"));
    pending.clear();
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.setItem('life.tour.done.v1', '1');
    window.reads = []; window.writes = []; window.reviews = {};
    window.fetch = async (url, init = {}) => {
      const path = new URL(url, location.href).pathname;
      if (path.startsWith('/api/review/')) {
        const week = path.split('/').at(-1);
        if (init.method === 'PUT') {
          const body = JSON.parse(init.body);
          writes.push({ week, body }); reviews[week] = body;
          return Response.json(body);
        }
        return new Promise(resolve => reads.push({ week, release: () => resolve(Response.json(
          reviews[week] ?? { keep: week, improve: '', stop: '', start: '' }
        )) }));
      }
      if (path === '/api/coins') throw new Error('Mock: skip reward dashboard');
      if (path === '/api/meta') return Response.json({ areas: [], categories: [] });
      if (path === '/api/settings/budget') return Response.json({ total: 0, byCategory: {} });
      if (path === '/api/health') return Response.json({ ok: true, version: 'test' });
      if (path === '/api/week/current') return Response.json({ startDate: '2026-11-09', endDate: '2026-11-15' });
      if (path.startsWith('/api/week/')) return Response.json({ tasks: [], blocks: [], courses: [], summary: {} });
      return Response.json([]);
    };
  ` });
  await send("Page.navigate", { url: "http://earth-online.test/" });
  await waitFor("[...document.querySelectorAll('[data-tour=nav] button')].some(b => b.textContent.includes('复盘'))");
  await evaluate("[...document.querySelectorAll('[data-tour=nav] button')].find(b => b.textContent.includes('复盘')).click()");
  await waitFor("reads.length === 1");
  const next = () => evaluate("[...document.querySelectorAll('main button')].find(b => b.textContent.trim() === '›').click()");
  const prev = () => evaluate("[...document.querySelectorAll('main button')].find(b => b.textContent.trim() === '‹').click()");
  const edit = (value) => evaluate(`(() => {
    const node = document.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  await next();
  await waitFor("reads.length === 2");
  const weekB = await evaluate("reads[1].week");
  await evaluate("reads[1].release()");
  await waitFor(`document.querySelector('textarea').value === ${JSON.stringify(weekB)}`);
  await evaluate("reads[0].release()");
  await delay(150);
  assert.equal(await evaluate("document.querySelector('textarea').value"), weekB, "late response must not replace current week");

  await edit("edited B");
  await delay(50);
  await next();
  await waitFor("reads.length === 3 && writes.length === 1");
  await delay(850);
  assert.deepEqual(await evaluate("writes"), [{ week: weekB, body: { keep: "edited B", improve: "", stop: "", start: "" } }]);
  assert.equal(await evaluate("document.querySelector('textarea').disabled"), true);
  assert.equal(await evaluate("document.querySelector('textarea').value"), "");
  const weekC = await evaluate("reads[2].week");
  await evaluate("reads[2].release()");
  await waitFor("!document.querySelector('textarea').disabled");
  assert.equal(await evaluate("document.querySelector('textarea').value"), weekC);

  // Reverting before the debounce must not flush an older, unwanted edit.
  await edit("temporary C"); await delay(50);
  await edit(weekC); await delay(50);
  await prev();
  await waitFor("reads.length === 4");
  await evaluate("reads[3].release()");
  await waitFor("document.querySelector('textarea').value === 'edited B'");
  await delay(850);
  assert.equal(await evaluate("writes.length"), 1);
  assert.deepEqual(errors, []);
  console.log("PASS: late responses ignored; pending edits saved to original week; slow loading cannot cross-write; reverted edits stay reverted");
} finally {
  if (browser) {
    const closing = new WebSocket(browser.webSocketDebuggerUrl);
    await new Promise(resolve => {
      closing.onopen = () => closing.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      closing.onclose = resolve;
      closing.onerror = resolve;
    });
  }
  socket?.close();
  chrome.kill();
  clearInterval(keepAlive);
  await delay(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
