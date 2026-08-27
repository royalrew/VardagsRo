import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

const targetUrl = process.argv[2];
const outputPath = process.argv[3];
const nextClicks = Number(process.argv[4] ?? 0);
const viewportWidth = Number(process.argv[5] ?? 1440);
const viewportHeight = Number(process.argv[6] ?? 1000);
if (!targetUrl || !outputPath) throw new Error("usage: visual-audit URL OUTPUT");

const username = process.env.VARDAGSRO_GATE_USERNAME || process.env.ZICKARIS_ADMIN_EMAIL;
const password = process.env.VARDAGSRO_GATE_PASSWORD || process.env.ZICKARIS_ADMIN_PASSWORD;
if (!username || !password) throw new Error("gate credentials missing");

const chromePath = process.env.PROGRAMFILES
  ? join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
  : "chrome";
const profilePath = await mkdtemp(join(tmpdir(), "vardagsro-cdp-"));
const port = await freePort();
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profilePath}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

try {
  const target = await browserTarget(port);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let requestId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(message.error.message));
    else resolver.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await command("Network.enable");
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: viewportWidth < 700,
  });
  await command("Network.setExtraHTTPHeaders", {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
    },
  });
  await command("Page.navigate", { url: targetUrl });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  for (let index = 0; index < nextClicks; index += 1) {
    await command("Runtime.evaluate", {
      expression: 'document.querySelector(".onboarding-actions .button-primary")?.click()',
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const screenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
  socket.close();
} finally {
  chrome.kill();
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("port allocation failed");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function browserTarget(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // Chrome has not opened its debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome did not become ready");
}
