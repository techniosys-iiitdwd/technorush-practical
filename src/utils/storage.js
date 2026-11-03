import fs from "node:fs/promises";
import path from "node:path";

export const STORAGE_DIR = path.resolve("storage");

const defaults = {
  "accounts.json": [],
  "requests.json": [],
  "attendance.json": []
};

// Serializes writes per file within this Node process.
// This is intended for a single local workshop server, not multi-process hosting.
const queues = new Map();

export async function initializeStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });

  for (const [filename, initialValue] of Object.entries(defaults)) {
    const filePath = path.join(STORAGE_DIR, filename);
    try {
      const content = await fs.readFile(filePath, "utf8");
      if (content.trim() === "") {
        console.warn(`Storage file ${filePath} was empty; initializing it with defaults.`);
        await fs.writeFile(filePath, JSON.stringify(initialValue, null, 2) + "\n", "utf8");
      } else {
        JSON.parse(content);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.writeFile(filePath, JSON.stringify(initialValue, null, 2) + "\n", "utf8");
    }
  }

  const logPath = path.join(STORAGE_DIR, "requests.log");
  try {
    await fs.access(logPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(logPath, "", "utf8");
  }
}

export async function readJson(filename) {
  const filePath = path.join(STORAGE_DIR, filename);
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

export function writeJson(filename, data) {
  const previous = queues.get(filename) || Promise.resolve();

  const next = previous.then(async () => {
    const filePath = path.join(STORAGE_DIR, filename);
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    await fs.rename(tempPath, filePath);
  });

  queues.set(filename, next.catch(() => {}));
  return next;
}

export function appendLog(line) {
  const filename = "requests.log";
  const previous = queues.get(filename) || Promise.resolve();

  const next = previous.then(() =>
    fs.appendFile(path.join(STORAGE_DIR, filename), line, "utf8")
  );

  queues.set(filename, next.catch(() => {}));
  return next;
}

export async function updateJson(filename, updater) {
  const previous = queues.get(filename) || Promise.resolve();

  const next = previous.then(async () => {
    const filePath = path.join(STORAGE_DIR, filename);
    const current = JSON.parse(await fs.readFile(filePath, "utf8"));
    const updated = await updater(current);
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
    await fs.rename(tempPath, filePath);
    return updated;
  });

  queues.set(filename, next.catch(() => {}));
  return next;
}
