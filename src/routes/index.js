import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readJson, writeJson, updateJson } from "../utils/storage.js";
import { requireFields } from "../middleware/validation.js";

export const apiRouter = Router();

const pick = (array) => array[Math.floor(Math.random() * array.length)];
const idOf = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;

apiRouter.get("/", (req, res) => {
  res.json({
    success: true,
    title: "Department of Internet Affairs",
    endpoints: [
      "GET /api/npc-check?name=Rahul",
      "GET /api/broke-meter?balance=42",
      "GET /api/fortune",
      "GET /api/attendance/:id",
      "GET /api/leaderboard",
      "POST /api/heartbreak",
      "POST /api/confessions",
      "GET /api/confessions",
      "DELETE /api/confessions/:id",
      "POST /api/roast",
      "POST /api/touch-grass",
      "POST /api/villains",
      "PATCH /api/villains/:id",
      "DELETE /api/villains/:id",
      "GET /api/profile/:id",
      "PUT /api/profile/:id",
      "PATCH /api/profile/:id",
      "GET /api/secret-society",
      "POST /api/spam",
      "GET /api/chaos",
      "GET /api/success",
      "POST /api/lore",
      "GET /api/invalid",
      "GET /api/vip",
      "GET /api/ghost",
      "GET /api/cooked",
      "GET /api/admin/stats"
    ]
  });
});

// ---------------- GET: Fetching the tea ----------------

apiRouter.get("/npc-check", (req, res) => {
  const name = String(req.query.name || "Unknown NPC").slice(0, 60);
  const npcLevel = Math.floor(Math.random() * 101);

  res.json({
    success: true,
    name,
    npcLevel,
    verdict: npcLevel >= 75 ? "Certified NPC" : npcLevel >= 40 ? "Side character energy" : "Main character detected",
    advice: npcLevel >= 75 ? "Please touch some grass." : "Keep cooking."
  });
});

apiRouter.get("/broke-meter", (req, res) => {
  const balance = Number(req.query.balance);

  if (req.query.balance === undefined || !Number.isFinite(balance) || balance < 0) {
    return res.status(400).json({
      success: false,
      message: "Provide a valid non-negative balance query parameter."
    });
  }

  res.json({
    success: true,
    balance,
    status: balance < 100 ? "Financially cooked" : balance < 1000 ? "Surviving somehow" : "Almost financially stable",
    survivalDays: Math.max(0, Math.floor(balance / 50))
  });
});

apiRouter.get("/fortune", (req, res) => {
  res.json({
    success: true,
    prediction: pick([
      "Your code will work on the first try. (Unlikely.)",
      "You will find the bug after taking a break.",
      "A semicolon will decide your fate.",
      "Your PR will be reviewed. Eventually.",
      "You are going to pass. Your sleep schedule will not."
    ])
  });
});

apiRouter.get("/attendance/:id", async (req, res, next) => {
  try {
    const students = await readJson("attendance.json");
    const student = students.find((item) => item.id.toLowerCase() === req.params.id.toLowerCase());

    if (!student) {
      return res.status(404).json({ success: false, message: "Student ghosted. ID not found." });
    }

    res.json({ success: true, student });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/leaderboard", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "10", 10)));

    if (!Number.isInteger(page) || !Number.isInteger(limit)) {
      return res.status(400).json({ success: false, message: "Page and limit must be integers." });
    }

    const logs = await readJson("requests.json");
    const counts = new Map();

    for (const log of logs) {
      if (log.participant !== "Anonymous") {
        counts.set(log.participant, (counts.get(log.participant) || 0) + 1);
      }
    }

    const ranked = [...counts.entries()]
      .map(([name, requests]) => ({ name, requests }))
      .sort((a, b) => b.requests - a.requests);

    const start = (page - 1) * limit;

    res.json({
      success: true,
      page,
      limit,
      totalParticipants: ranked.length,
      leaderboard: ranked.slice(start, start + limit)
    });
  } catch (error) {
    next(error);
  }
});

// ---------------- POST: Dropping new lore ----------------

apiRouter.post("/heartbreak", requireFields(["name", "reason", "severity"]), (req, res) => {
  const severity = Number(req.body.severity);

  if (!Number.isInteger(severity) || severity < 1 || severity > 10) {
    return res.status(400).json({ success: false, message: "Severity must be an integer from 1 to 10." });
  }

  res.status(201).json({
    success: true,
    certificateId: idOf("BROKEN"),
    name: String(req.body.name).slice(0, 60),
    reason: String(req.body.reason).slice(0, 300),
    severity,
    verdict: severity >= 8 ? "Emotionally unavailable for maintenance" : "Recoverable with snacks"
  });
});

apiRouter.post("/confessions", requireFields(["confession"]), async (req, res, next) => {
  try {
    const confession = {
      id: idOf("CONF"),
      confession: String(req.body.confession).slice(0, 1000),
      createdAt: new Date().toISOString()
    };

    const updated = await updateJson("confessions.json", (items) => [...items, confession]);
    res.status(201).json({ success: true, message: "Confession safely exposed.", confession: updated.at(-1) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/confessions", async (req, res, next) => {
  try {
    const confessions = await readJson("confessions.json");
    res.json({ success: true, count: confessions.length, confessions });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/confessions/:id", async (req, res, next) => {
  try {
    let deleted;
    await updateJson("confessions.json", (items) => {
      deleted = items.find((item) => item.id === req.params.id);
      return items.filter((item) => item.id !== req.params.id);
    });

    if (!deleted) return res.status(404).json({ success: false, message: "Confession not found." });
    res.json({ success: true, message: "Confession deleted. The tea is gone." });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/roast", requireFields(["name", "personality"]), (req, res) => {
  const roasts = {
    "always late": "Your clock has filed a missing-person report.",
    "procrastinator": "Your deadlines have trust issues.",
    "sleepy": "You don't need a bed. You need a software update.",
    "overthinker": "You could overthink a loading spinner."
  };

  const personality = String(req.body.personality).toLowerCase();
  res.json({
    success: true,
    target: String(req.body.name).slice(0, 60),
    roast: roasts[personality] || `${req.body.name}, your vibe is still buffering.`
  });
});

apiRouter.post("/touch-grass", requireFields(["hours"]), (req, res) => {
  const hours = Number(req.body.hours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return res.status(400).json({ success: false, message: "Hours must be between 0 and 24." });
  }

  res.json({
    success: true,
    hoursOutside: hours,
    verdict: hours >= 2 ? "Nature knows you personally." : "Please reconnect with the outdoors."
  });
});

// ---------------- Villain CRUD ----------------

apiRouter.post("/villains", requireFields(["name", "superpower", "originStory"]), async (req, res, next) => {
  try {
    const villain = {
      id: idOf("VILLAIN"),
      name: String(req.body.name).slice(0, 60),
      superpower: String(req.body.superpower).slice(0, 100),
      originStory: String(req.body.originStory).slice(0, 1000),
      createdAt: new Date().toISOString()
    };

    await updateJson("villains.json", (items) => [...items, villain]);
    res.status(201).json({ success: true, villain });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/villains", async (req, res, next) => {
  try {
    const villains = await readJson("villains.json");
    res.json({ success: true, count: villains.length, villains });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/villains/:id", async (req, res, next) => {
  try {
    const allowed = ["name", "superpower", "originStory"];
    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))
    );

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: "Send at least one editable field." });
    }

    let updatedVillain;
    await updateJson("villains.json", (items) =>
      items.map((item) => {
        if (item.id !== req.params.id) return item;
        updatedVillain = { ...item, ...updates, updatedAt: new Date().toISOString() };
        return updatedVillain;
      })
    );

    if (!updatedVillain) return res.status(404).json({ success: false, message: "Villain not found." });
    res.json({ success: true, villain: updatedVillain });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/villains/:id", async (req, res, next) => {
  try {
    let deleted;
    await updateJson("villains.json", (items) => {
      deleted = items.find((item) => item.id === req.params.id);
      return items.filter((item) => item.id !== req.params.id);
    });

    if (!deleted) return res.status(404).json({ success: false, message: "Villain not found." });
    res.json({ success: true, message: `${deleted.name} has been defeated.` });
  } catch (error) {
    next(error);
  }
});

// ---------------- Profile: PUT vs PATCH ----------------

apiRouter.get("/profile/:id", async (req, res, next) => {
  try {
    const profiles = await readJson("profiles.json");
    const profile = profiles.find((item) => item.id === req.params.id);
    if (!profile) return res.status(404).json({ success: false, message: "Profile not found." });
    res.json({ success: true, profile });
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/profile/:id", requireFields(["name", "bio", "mood"]), async (req, res, next) => {
  try {
    const replacement = {
      id: req.params.id,
      name: String(req.body.name).slice(0, 60),
      bio: String(req.body.bio).slice(0, 300),
      mood: String(req.body.mood).slice(0, 40),
      updatedAt: new Date().toISOString()
    };

    let found = false;
    await updateJson("profiles.json", (items) => {
      found = items.some((item) => item.id === req.params.id);
      return found
        ? items.map((item) => item.id === req.params.id ? replacement : item)
        : [...items, replacement];
    });

    res.status(found ? 200 : 201).json({ success: true, message: "Profile replaced.", profile: replacement });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/profile/:id", async (req, res, next) => {
  try {
    const allowed = ["name", "bio", "mood"];
    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))
    );

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: "Send at least one editable field." });
    }

    let profile;
    await updateJson("profiles.json", (items) =>
      items.map((item) => {
        if (item.id !== req.params.id) return item;
        profile = { ...item, ...updates, updatedAt: new Date().toISOString() };
        return profile;
      })
    );

    if (!profile) return res.status(404).json({ success: false, message: "Profile not found. Create it with PUT first." });
    res.json({ success: true, message: "Profile patched.", profile });
  } catch (error) {
    next(error);
  }
});

// ---------------- Middleware / HTTP concepts ----------------

// Simple demo gate: use x-api-key: workshop-secret.
// Replace this static demo key if the API is exposed beyond your local workshop.
apiRouter.get("/secret-society", (req, res) => {
  if (req.get("x-api-key") !== "workshop-secret") {
    return res.status(401).json({ success: false, message: "VIP only. Bring the secret key." });
  }
  res.json({ success: true, message: "Welcome to the secret society. No NPCs allowed." });
});

// In-memory per-IP rate limit demonstration; resets when the server restarts.
const spamHits = new Map();
apiRouter.post("/spam", (req, res) => {
  const key = req.ip;
  const now = Date.now();
  const windowMs = 60_000;
  const current = spamHits.get(key);

  if (!current || now - current.startedAt > windowMs) {
    spamHits.set(key, { startedAt: now, count: 1 });
  } else {
    current.count += 1;
  }

  const state = spamHits.get(key);
  if (state.count > 5) {
    return res.status(429).json({
      success: false,
      message: "Chill. Too many requests. Try again in a minute."
    });
  }

  res.json({ success: true, message: "Request accepted. Don't get too excited.", requestsThisMinute: state.count });
});

// ---------------- Status code demo endpoints ----------------

apiRouter.get("/success", (req, res) => res.status(200).json({ success: true, message: "BIG W." }));
apiRouter.post("/lore", (req, res) => res.status(201).json({ success: true, message: "Lore created." }));
apiRouter.get("/invalid", (req, res) => res.status(400).json({ success: false, message: "Skill issue. Bad request." }));
apiRouter.get("/vip", (req, res) => res.status(401).json({ success: false, message: "VIP only. Unauthorized." }));
apiRouter.get("/ghost", (req, res) => res.status(404).json({ success: false, message: "Ghosted. Resource not found." }));
apiRouter.get("/cooked", (req, res) => res.status(500).json({ success: false, message: "Cooked. Intentional demo server error." }));

apiRouter.get("/chaos", (req, res) => {
  const status = Number(req.query.status || 500);
  const allowed = [400, 401, 403, 404, 429, 500];

  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: "Choose status=400,401,403,404,429 or 500." });
  }

  res.status(status).json({
    success: false,
    message: `Chaos mode activated. Demonstrating HTTP ${status}.`
  });
});

// ---------------- Admin stats (local request log reader) ----------------

apiRouter.get("/admin/stats", async (req, res, next) => {
  try {
    // Optional demo protection. Set ADMIN_KEY in your environment to enable it.
    if (process.env.ADMIN_KEY && req.get("x-admin-key") !== process.env.ADMIN_KEY) {
      return res.status(401).json({ success: false, message: "Admin key required." });
    }

    const logs = await readJson("requests.json");
    const participants = new Set(logs.map((item) => item.participant).filter((name) => name !== "Anonymous"));
    const endpointCounts = {};
    const methodCounts = {};
    const statusBreakdown = {};

    for (const item of logs) {
      endpointCounts[item.endpoint] = (endpointCounts[item.endpoint] || 0) + 1;
      methodCounts[item.method] = (methodCounts[item.method] || 0) + 1;
      statusBreakdown[item.statusCode] = (statusBreakdown[item.statusCode] || 0) + 1;
    }

    const mostUsedEndpoint = Object.entries(endpointCounts).sort((a, b) => b[1] - a[1])[0] || null;
    const mostPopularMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0] || null;

    res.json({
      success: true,
      totalRequests: logs.length,
      uniqueParticipants: participants.size,
      mostUsedEndpoint: mostUsedEndpoint ? { endpoint: mostUsedEndpoint[0], requests: mostUsedEndpoint[1] } : null,
      mostPopularMethod: mostPopularMethod ? { method: mostPopularMethod[0], requests: mostPopularMethod[1] } : null,
      statusBreakdown
    });
  } catch (error) {
    next(error);
  }
});
