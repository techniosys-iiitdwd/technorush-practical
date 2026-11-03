import { randomUUID } from "node:crypto";
import { appendLog, updateJson } from "../utils/storage.js";

export function requestLogger(req, res, next) {
  const startedAt = Date.now();
  req.requestId = randomUUID();

  res.setHeader("X-Request-Id", req.requestId);

  res.on("finish", () => {
    const participantName = String(req.get("participant-name") || "Anonymous")
      .trim()
      .slice(0, 60);

    const record = {
      requestId: req.requestId,
      participant: participantName || "Anonymous",
      method: req.method,
      endpoint: req.originalUrl.split("?")[0],
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    };

    // Log failures too. Logging is intentionally fire-and-forget so it
    // doesn't delay the API response. A logging error is printed to console.
    updateJson("requests.json", (records) => {
      records.push(record);
      return records;
    })
      .then(() => {
        const line =
          `[${record.timestamp}] ${record.participant} | ` +
          `${record.method} ${record.endpoint} | ` +
          `${record.statusCode} | ${record.responseTimeMs}ms | ` +
          `${record.requestId}\n`;
        return appendLog(line);
      })
      .catch((error) => console.error("Request logging failed:", error));
  });

  next();
}
