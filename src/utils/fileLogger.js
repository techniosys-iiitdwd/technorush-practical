import fs from "fs/promises";
import path from "path";

const STORAGE = path.resolve("storage");

let writeQueue = Promise.resolve();

export async function initializeLogs() {
  await fs.mkdir(STORAGE, { recursive: true });

  for (const file of ["requests.json", "requests.log"]) {
    const filePath = path.join(STORAGE, file);

    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(
        filePath,
        file.endsWith(".json") ? "[]" : "",
        "utf8"
      );
    }
  }
}

export function saveRequest(record) {
  writeQueue = writeQueue.then(async () => {
    const jsonPath = path.join(STORAGE, "requests.json");
    const logPath = path.join(STORAGE, "requests.log");

    const existing = await fs.readFile(jsonPath, "utf8");
    const records = JSON.parse(existing);

    records.push(record);

    await fs.writeFile(
      jsonPath,
      JSON.stringify(records, null, 2),
      "utf8"
    );

    const logLine =
      `[${record.timestamp}] ${record.participant} | ` +
      `${record.method} ${record.endpoint} | ` +
      `${record.statusCode} | ${record.responseTime}ms\n`;

    await fs.appendFile(logPath, logLine, "utf8");
  });

  return writeQueue;
}