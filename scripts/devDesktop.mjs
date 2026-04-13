import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const DEV_URL = "http://127.0.0.1:1430/";
const DEV_SERVER_LOG_PATH = path.join(process.cwd(), ".technica-dev-server.log");

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

function resolveViteCliPath() {
  const candidatePath = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  return fs.existsSync(candidatePath) ? candidatePath : null;
}

function resolveEsbuildBinaryPath() {
  const candidatePaths = process.platform === "win32"
    ? [
        path.join(process.cwd(), "node_modules", "@esbuild", "win32-x64", "esbuild.exe"),
        path.join(process.cwd(), "node_modules", "@esbuild", "win32-arm64", "esbuild.exe"),
        path.join(process.cwd(), "node_modules", "@esbuild", "win32-ia32", "esbuild.exe"),
      ]
    : [];

  return candidatePaths.find((candidatePath) => fs.existsSync(candidatePath)) ?? null;
}

function createDevServerEnv() {
  const env = { ...process.env };
  const esbuildBinaryPath = resolveEsbuildBinaryPath();
  if (esbuildBinaryPath) {
    env.ESBUILD_BINARY_PATH = esbuildBinaryPath;
  }
  return env;
}

function readRecentDevServerLog() {
  try {
    const raw = fs.readFileSync(DEV_SERVER_LOG_PATH, "utf8");
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-20).join("\n");
  } catch {
    return "";
  }
}

function startDetachedDevServer() {
  const viteCliPath = resolveViteCliPath();
  if (!viteCliPath) {
    throw new Error("Could not find Vite CLI at node_modules/vite/bin/vite.js.");
  }

  fs.writeFileSync(
    DEV_SERVER_LOG_PATH,
    `[${new Date().toISOString()}] Starting Technica dev server on port 1430...\n`,
    "utf8"
  );
  const logFileDescriptor = fs.openSync(DEV_SERVER_LOG_PATH, "a");

  const child = spawn(process.execPath, [viteCliPath, "--host", "0.0.0.0", "--port", "1430", "--strictPort"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFileDescriptor, logFileDescriptor],
    env: createDevServerEnv(),
    windowsHide: true
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
      const recentLog = readRecentDevServerLog();
      const diagnosticSuffix = recentLog
        ? `\nRecent frontend log:\n${recentLog}`
        : `\nSee ${DEV_SERVER_LOG_PATH} for the frontend failure log.`;
      throw new Error(
        `Technica dev server did not become ready on http://127.0.0.1:1430.${diagnosticSuffix}`
      );
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
