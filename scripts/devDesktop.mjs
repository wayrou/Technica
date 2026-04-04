import http from "node:http";
import { spawn } from "node:child_process";
import process from "node:process";

const DEV_URL = "http://127.0.0.1:1430/";

function probeDevServer(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.get(
      DEV_URL,
      {
        timeout: timeoutMs,
        headers: {
          Accept: "text/html"
        }
      },
      (response) => {
        response.resume();
        resolve(Boolean(response.statusCode && response.statusCode < 500));
      }
    );

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForDevServer(maxWaitMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    if (await probeDevServer()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function startDetachedDevServer() {
  const child = spawn("npm run dev", {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
    shell: true
  });
  child.unref();
}

async function main() {
  const serverAlreadyRunning = await probeDevServer();
  if (!serverAlreadyRunning) {
    console.log("Starting Technica dev server on port 1430...");
    startDetachedDevServer();

    const ready = await waitForDevServer();
    if (!ready) {
      throw new Error("Technica dev server did not become ready on http://127.0.0.1:1430.");
    }
  } else {
    console.log("Reusing existing Technica dev server on port 1430...");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
