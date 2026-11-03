import express, { Router } from "express";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readJson, updateJson, writeJson } from "../utils/storage.js";

export const apiRouter = Router();
const accountRouter = Router();

apiRouter.use(express.json({ limit: "10kb" }));

const scryptAsync = promisify(scrypt);
const accountsFile = "accounts.json";
const attendanceFile = "attendance.json";
const sessionCookieName = "session";
const sessionDurationSeconds = 60 * 60;
const sessions = new Map();
const sessionCookieAttributes = [
  "HttpOnly",
  "Path=/api",
  "SameSite=Lax",
  `Max-Age=${sessionDurationSeconds}`,
  ...(process.env.NODE_ENV === "production" ? ["Secure"] : [])
].join("; ");

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${sessionCookieName}=${token}; ${sessionCookieAttributes}`);
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=; ${sessionCookieAttributes.replace(`Max-Age=${sessionDurationSeconds}`, "Max-Age=0")}`
  );
}

accountRouter.use((req, res, next) => {
  if (!req.get("authorization")) {
    const cookie = (req.get("cookie") || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${sessionCookieName}=`));
    const token = cookie?.slice(sessionCookieName.length + 1);
    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      req.headers.authorization = `Bearer ${token}`;
    }
  }
  next();
});

async function ensureFile(filename) {
  try {
    await readJson(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeJson(filename, []);
  }
}

function validateObject(body, requiredFields, allowedFields = requiredFields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Please send the details as a JSON object.";
  }

  const unexpected = Object.keys(body).filter((key) => !allowedFields.includes(key));
  if (unexpected.length) {
    return `Unexpected field(s): ${unexpected.join(", ")}. The form is shorter on purpose.`;
  }

  const missing = requiredFields.filter((key) => !Object.hasOwn(body, key));
  if (missing.length) {
    return `Please add ${missing.join(" and ")}. The server can't fill those in for you.`;
  }

  return null;
}

function validateName(name) {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 60;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = await scryptAsync(password, salt, 64);
  return { passwordSalt: salt, passwordHash: derived.toString("hex") };
}

async function passwordMatches(password, account) {
  const derived = await scryptAsync(password, account.passwordSalt, 64);
  const expected = Buffer.from(account.passwordHash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function createSession(accountId) {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }

  const accessToken = randomBytes(32).toString("hex");
  sessions.set(accessToken, { accountId, expiresAt: now + 60 * 60 * 1000 });
  return accessToken;
}

function getSession(req) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
  if (!match) return null;

  const session = sessions.get(match[1]);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return { ...session, token: match[1] };
}

function publicAccount(account) {
  return { id: account.id, name: account.name, email: account.email };
}

apiRouter.get("/", (req, res) => {
  res.json({
    success: true,
    title: "Department of Internet Affairs",
    requestExamples: {
      attendanceRegistration: {
        method: "POST",
        path: "/api/attendance/register",
        headers: { "Content-Type": "application/json" },
        body: { name: "Your name", rollNo: "ROLL-123" },
        description: "rollNo can be a string or a non-negative integer."
      }
    },
    endpoints: {
      attendance: "GET /api/attendance",
      registerAttendance: "POST /api/attendance/register — name, rollNo",
      account: "GET /api/account — account endpoints",
      register: "POST /api/account/register — name, email, password",
      login: "POST /api/account/login — email, password; sets an HttpOnly session cookie",
      me: "GET /api/account/me — returns the logged-in account",
      logout: "POST /api/account/logout — revokes the session and clears its cookie",
      updateInfo: "PATCH /api/updateinfo — Bearer token; name, email, or password",
      deleteAccount: "DELETE /api/deleteAccount — Bearer token",
    },
    note: "Passwords are never included in responses. Sessions expire after one hour. For cross-origin browser clients, set FRONTEND_ORIGIN to the exact frontend origin and send credentials: include; production cookies require HTTPS."
  });
});

accountRouter.get("/", (req, res) => {
  res.json({
    success: true,
    title: "Account endpoints",
    endpoints: {
      register: "POST /api/account/register",
      login: "POST /api/account/login (sets an HttpOnly session cookie)",
      me: "GET /api/account/me (requires a valid session)",
      updateInfo: "PATCH /api/account/updateinfo",
      deleteAccount: "DELETE /api/account/deleteAccount",
      logout: "POST /api/account/logout"
    },
    requestFormats: {
      register: {
        method: "POST",
        path: "/api/account/register",
        headers: { "Content-Type": "application/json" },
        body: {
          name: "Your name",
          email: "you@example.com",
          password: "at-least-8-characters"
        },
        description: "All fields are required. Password must be 8–128 characters."
      },
      login: {
        method: "POST",
        path: "/api/account/login",
        headers: { "Content-Type": "application/json" },
        body: { email: "you@example.com", password: "your-password" },
        credentials: "include",
        description: "Sets an HttpOnly session cookie valid for one hour. The response also includes the accessToken for existing bearer-token clients."
      },
      me: {
        method: "GET",
        path: "/api/account/me",
        headers: { Authorization: "Bearer <accessToken> (optional when using the session cookie)" },
        credentials: "include",
        description: "Returns the public profile for the currently logged-in account."
      },
      updateInfo: {
        method: "PATCH",
        path: "/api/account/updateinfo",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer <accessToken from login> (optional when using the session cookie)"
        },
        credentials: "include",
        body: { name: "New name", email: "new@example.com", password: "new-password" },
        description: "Send only the fields you want to change; at least one is required."
      },
      deleteAccount: {
        method: "DELETE",
        path: "/api/account/deleteAccount",
        headers: { Authorization: "Bearer <accessToken from login> (optional when using the session cookie)" },
        credentials: "include",
        body: null,
        description: "Permanently deletes the logged-in account. No request body."
      },
      logout: {
        method: "POST",
        path: "/api/account/logout",
        headers: {},
        credentials: "include",
        body: null,
        description: "Revokes the current session and clears the HttpOnly session cookie. No request body."
      }
    },
    note: "Passwords are never included in responses. Sessions expire after one hour. For cross-origin browser clients, set FRONTEND_ORIGIN to the exact frontend origin and send credentials: include; production cookies require HTTPS."
  });
});

accountRouter.get("/me", async (req, res, next) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      message: "A valid session is required to fetch your account."
    });
  }

  try {
    await ensureFile(accountsFile);
    const accounts = await readJson(accountsFile);
    const account = accounts.find((item) => item.id === session.accountId);
    if (!account) {
      sessions.delete(session.token);
      return res.status(404).json({
        success: false,
        message: "Account not found. It may have left the group chat."
      });
    }

    res.json({
      success: true,
      account: publicAccount(account)
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/register", async (req, res, next) => {
  const bodyError = validateObject(req.body, ["name", "email", "password"]);
  if (bodyError) {
    return res.status(400).json({ success: false, message: `${bodyError} No account was created.` });
  }

  const email = normalizeEmail(req.body.email);
  if (!validateName(req.body.name)) {
    return res.status(400).json({
      success: false,
      message: "Name must be 1–60 characters. Even superheroes need a name."
    });
  }
  if (!validEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "That email address doesn't look right. Check it before it checks out."
    });
  }
  if (!validatePassword(req.body.password)) {
    return res.status(400).json({
      success: false,
      message: "Password must be 8–128 characters. Longer beats '12345678' every time."
    });
  }

  try {
    await ensureFile(accountsFile);
    const account = {
      id: randomUUID(),
      name: req.body.name.trim(),
      email,
      ...(await hashPassword(req.body.password)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let duplicate = false;
    await updateJson(accountsFile, (accounts) => {
      duplicate = accounts.some((item) => item.email === email);
      return duplicate ? accounts : [...accounts, account];
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "That email already has an account. Try logging in instead."
      });
    }

    res.status(201).json({
      success: true,
      message: "Account created. Welcome aboard; your inbox is now officially a login field.",
      account: publicAccount(account)
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/login", async (req, res, next) => {
  const bodyError = validateObject(req.body, ["email", "password"]);
  if (bodyError) {
    return res.status(400).json({ success: false, message: `${bodyError} Login paused.` });
  }

  const email = normalizeEmail(req.body.email);
  if (!validEmail(email) || typeof req.body.password !== "string" || !req.body.password) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email and password. The login form isn't a guessing game."
    });
  }

  try {
    await ensureFile(accountsFile);
    const accounts = await readJson(accountsFile);
    const account = accounts.find((item) => item.email === email);
    if (!account || !(await passwordMatches(req.body.password, account))) {
      return res.status(401).json({
        success: false,
        message: "Email or password didn't match. No hints for the account detectives."
      });
    }

    const accessToken = createSession(account.id);
    setSessionCookie(res, accessToken);
    res.json({
      success: true,
      message: `Welcome back, ${account.name}. The server remembers you (for an hour).`,
      account: publicAccount(account),
      accessToken,
      expiresIn: sessionDurationSeconds
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.patch("/updateinfo", async (req, res, next) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      message: "A valid Bearer token is required. The server needs to know whose profile to edit."
    });
  }

  const allowedFields = ["name", "email", "password"];
  const bodyError = validateObject(req.body, [], allowedFields);
  if (bodyError) {
    return res.status(400).json({ success: false, message: `${bodyError} Nothing was changed.` });
  }
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Send at least one of name, email, or password. A blank update is impressively unproductive."
    });
  }

  const updates = {};
  if (Object.hasOwn(req.body, "name")) {
    if (!validateName(req.body.name)) {
      return res.status(400).json({
        success: false,
        message: "Name must be 1–60 characters. Please give it something to work with."
      });
    }
    updates.name = req.body.name.trim();
  }
  if (Object.hasOwn(req.body, "email")) {
    updates.email = normalizeEmail(req.body.email);
    if (!validEmail(updates.email)) {
      return res.status(400).json({
        success: false,
        message: "That email address doesn't look right. It can't update itself."
      });
    }
  }
  if (Object.hasOwn(req.body, "password")) {
    if (!validatePassword(req.body.password)) {
      return res.status(400).json({
        success: false,
        message: "New password must be 8–128 characters. Give the password manager a challenge."
      });
    }
    updates.password = await hashPassword(req.body.password);
  }

  try {
    await ensureFile(accountsFile);
    let account;
    let emailTaken = false;
    await updateJson(accountsFile, (accounts) => {
      emailTaken = Boolean(
        updates.email && accounts.some((item) => item.id !== session.accountId && item.email === updates.email)
      );
      if (emailTaken) return accounts;

      return accounts.map((item) => {
        if (item.id !== session.accountId) return item;
        const { password, ...profileUpdates } = updates;
        account = {
          ...item,
          ...profileUpdates,
          ...(password || {}),
          updatedAt: new Date().toISOString()
        };
        return account;
      });
    });

    if (emailTaken) {
      return res.status(409).json({
        success: false,
        message: "That email is already taken. Even inboxes have boundaries."
      });
    }
    if (!account) {
      sessions.delete(session.token);
      return res.status(404).json({
        success: false,
        message: "Account not found. It may have left the group chat."
      });
    }

    res.json({
      success: true,
      message: "Account updated. Fresh details, same excellent decision-making.",
      account: publicAccount(account)
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.delete("/deleteAccount", async (req, res, next) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      message: "A valid Bearer token is required. We don't delete accounts on a hunch."
    });
  }

  try {
    await ensureFile(accountsFile);
    let deleted = false;
    await updateJson(accountsFile, (accounts) => {
      deleted = accounts.some((item) => item.id === session.accountId);
      return accounts.filter((item) => item.id !== session.accountId);
    });

    for (const [token, activeSession] of sessions) {
      if (activeSession.accountId === session.accountId) sessions.delete(token);
    }
    clearSessionCookie(res);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Account not found. There was nothing left to delete."
      });
    }
    res.json({
      success: true,
      message: "Account deleted. No hard feelings; the database has moved on."
    });
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/logout", (req, res) => {
  const session = getSession(req);
  if (session) sessions.delete(session.token);
  clearSessionCookie(res);
  res.json({
    success: true,
    message: "Logged out. Your session has been revoked."
  });
});

apiRouter.use("/account", accountRouter);
apiRouter.use(accountRouter);

apiRouter.get("/attendance", async (req, res, next) => {
  try {
    const attendance = await readJson(attendanceFile);
    res.json({
      success: true,
      message: attendance.length
        ? "Roll call is in. Here's everyone who made it onto the list."
        : "The attendance sheet is empty. Even the early birds haven't landed yet.",
      count: attendance.length,
      attendance
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/attendance/register", async (req, res, next) => {
  const bodyError = validateObject(req.body, ["name", "rollNo"]);
  if (bodyError) {
    return res.status(400).json({
      success: false,
      message: `${bodyError} Roll call is waiting.`
    });
  }

  const { name, rollNo } = req.body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
    return res.status(400).json({
      success: false,
      message: "Name must be 1–60 characters. 'Here' is enthusiastic, but not a name."
    });
  }
  const normalizedRollNo = typeof rollNo === "number" && Number.isSafeInteger(rollNo) && rollNo >= 0
    ? String(rollNo)
    : typeof rollNo === "string" ? rollNo.trim() : "";
  if (!normalizedRollNo || normalizedRollNo.length > 30) {
    return res.status(400).json({
      success: false,
      message: "Roll number must be a non-empty string or non-negative integer, up to 30 characters."
    });
  }

  try {
    const record = {
      id: `ATT-${randomUUID().slice(0, 8)}`,
      name: name.trim(),
      rollNo: normalizedRollNo,
      timestamp: new Date().toISOString()
    };
    let alreadyRegistered = false;
    await updateJson(attendanceFile, (attendance) => {
      alreadyRegistered = attendance.some((item) => item.rollNo === normalizedRollNo);
      return alreadyRegistered ? attendance : [...attendance, record];
    });

    if (alreadyRegistered) {
      return res.status(409).json({
        success: false,
        message: "You're already on the list. A second roll call won't make you twice as present."
      });
    }
    res.status(201).json({
      success: true,
      message: `Present, ${record.name}! Your roll number made it onto the list.`,
      attendance: record
    });
  } catch (error) {
    next(error);
  }
});
