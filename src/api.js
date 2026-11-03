import express from "express";
import cors from 'cors';
import os from 'os';
import { initializeStorage } from "./utils/storage.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { apiRouter } from "./routes/index.js";


const PORT = 3000;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors());
app.use(requestLogger);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the Department of Internet Affairs.",
    docs: "/api"
  });
});

app.use("/api", apiRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Ghosted. This endpoint does not exist.",
    requestId: req.requestId
  });
});

app.use((err, req, res, next) => {
  console.error(`[${req.requestId || "no-request-id"}]`, err);
  if (res.headersSent) return next(err);

  const status = Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? "Server cooked. Something went wrong." : err.message,
    requestId: req.requestId
  });
});


await initializeStorage();

const LOCAL_IP = getLocalIP();
app.listen(PORT,'0.0.0.0',() => {
    console.log(`Server live on http://localhost:${PORT}`);
    console.log(`Server live on http://${LOCAL_IP}:${PORT}`);
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
        for (const iface of interfaces[interfaceName]) {
            // Skip over internal (i.e. 127.0.0.1) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}