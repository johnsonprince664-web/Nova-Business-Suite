import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ensureStateDir, LOCAL_SECRET_FILE, restorePairedClient, STATE_DIR } from "./session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JARVIS_BASE_URL = (process.env.JARVIS_BASE_URL || "https://legacyjewelrycrmphonereadyfixed.vercel.app").replace(/\/$/, "");
const LOCAL_PORT = Number(process.env.JARVIS_LOCAL_PORT || 45451);
const CRM_URL = `${JARVIS_BASE_URL}/`;

const { supabase, user } = await restorePairedClient();
await ensureStateDir();

async function ensureLocalSecret() {
  try {
    const existing = (await fs.readFile(LOCAL_SECRET_FILE, "utf8")).trim();
    if (existing) return existing;
  } catch {}
  const secret = crypto.randomBytes(32).toString("base64url");
  await fs.writeFile(LOCAL_SECRET_FILE, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

const localSecret = await ensureLocalSecret();
console.log(`JARVIS Resident paired to ${user.email}.`);
console.log(`Voice bridge: http://127.0.0.1:${LOCAL_PORT}`);

const APP_ALLOWLIST = {
  chrome: "chrome.exe",
  edge: "msedge.exe",
  spotify: "spotify.exe",
  calculator: "calc.exe",
  notepad: "notepad.exe",
  explorer: "explorer.exe",
  settings: "ms-settings:",
};

function windowsStart(target) {
  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", target], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Command exited ${code}`)));
  });
}

async function lockPc() {
  await new Promise((resolve, reject) => {
    const child = spawn("rundll32.exe", ["user32.dll,LockWorkStation"], { windowsHide: true, stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Lock command exited ${code}`)));
  });
}

async function executeDeviceCommand(command, args = {}) {
  if (process.platform !== "win32") throw new Error("This companion build currently targets Windows.");
  if (command === "open_app") {
    const app = String(args.app || "").toLowerCase();
    const target = APP_ALLOWLIST[app];
    if (!target) throw new Error(`App '${app}' is not in the safe allowlist.`);
    await windowsStart(target);
    return `Opened ${app}`;
  }
  if (command === "open_url") {
    const parsed = new URL(String(args.url || ""));
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http/https URLs are allowed.");
    await windowsStart(parsed.href);
    return `Opened ${parsed.href}`;
  }
  if (command === "open_path") {
    const home = path.resolve(os.homedir());
    const target = path.resolve(String(args.path || home));
    if (!(target === home || target.startsWith(home + path.sep))) throw new Error("JARVIS can only open files/folders inside your Windows home directory.");
    await windowsStart(target);
    return `Opened ${target}`;
  }
  if (command === "lock_pc") {
    await lockPc();
    return "PC locked";
  }
  throw new Error(`Command '${command}' is not allowed.`);
}

function normalizeSpeech(text) {
  return String(text || "").trim().replace(/^\s*(?:hey\s+)?jarvis[\s,.:;!\-]*/i, "").trim();
}

async function maybeHandleLocalIntent(rawText) {
  const text = normalizeSpeech(rawText);
  const lower = text.toLowerCase().replace(/[!?.,]/g, " ").replace(/\s+/g, " ").trim();

  if (!lower) return { handled: true, reply: "Yes?" };

  if (/\b(?:open|show|launch|start)\b.*\b(?:legacy|crm|jewelry crm|legacy crm)\b/.test(lower)) {
    await windowsStart(CRM_URL);
    return { handled: true, reply: "Opening Legacy CRM." };
  }

  if (/\b(?:lock|secure)\b.*\b(?:pc|computer|screen)\b/.test(lower)) {
    await lockPc();
    return { handled: true, reply: "Locking the computer." };
  }

  const pathMatches = [
    ["downloads", path.join(os.homedir(), "Downloads")],
    ["documents", path.join(os.homedir(), "Documents")],
    ["desktop", path.join(os.homedir(), "Desktop")],
  ];
  for (const [name, target] of pathMatches) {
    if (new RegExp(`\\b(?:open|show)\\b.*\\b${name}\\b`).test(lower)) {
      await executeDeviceCommand("open_path", { path: target });
      return { handled: true, reply: `Opening ${name}.` };
    }
  }

  for (const app of Object.keys(APP_ALLOWLIST)) {
    if (new RegExp(`\\b(?:open|launch|start)\\b.*\\b${app}\\b`).test(lower)) {
      await executeDeviceCommand("open_app", { app });
      return { handled: true, reply: `Opening ${app}.` };
    }
  }

  return { handled: false, text };
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstNumber(record, keys) {
  for (const key of keys) {
    const n = Number(record?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function buildCrmContext() {
  const businessResult = await supabase.from("legacy_businesses").select("*").eq("owner_id", user.id).maybeSingle();
  const business = businessResult.data || null;
  if (!business) {
    return {
      source: "windows-resident",
      device: { platform: process.platform, hostname: os.hostname() },
      business: { connected: false },
    };
  }

  const [inventoryResult, salesResult, ordersResult, customersResult, expensesResult, memoriesResult, tasksResult] = await Promise.all([
    supabase.from("legacy_inventory").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(150),
    supabase.from("legacy_sales").select("*").eq("business_id", business.id).order("sold_at", { ascending: false }).limit(100),
    supabase.from("legacy_orders").select("*").eq("business_id", business.id).order("order_date", { ascending: false }).limit(80),
    supabase.from("legacy_customers").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(80),
    supabase.from("legacy_expenses").select("*").eq("business_id", business.id).order("expense_date", { ascending: false }).limit(80),
    supabase.from("jarvis_memories").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20),
    supabase.from("jarvis_tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);

  const inventory = inventoryResult.data || [];
  const sales = salesResult.data || [];
  const orders = ordersResult.data || [];
  const customers = customersResult.data || [];
  const expenses = expensesResult.data || [];
  const units = inventory.reduce((sum, item) => sum + safeNumber(item.qty), 0);
  const lowStock = inventory.filter((item) => safeNumber(item.qty) <= safeNumber(item.low_stock_threshold ?? 1)).length;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthSales = sales.filter((sale) => new Date(sale.sold_at || sale.created_at || 0) >= monthStart);
  const monthRevenue = monthSales.reduce((sum, sale) => sum + firstNumber(sale, ["total", "total_amount", "sale_total", "amount", "gross_revenue"]), 0);
  const monthProfit = monthSales.reduce((sum, sale) => sum + firstNumber(sale, ["profit", "gross_profit", "net_profit", "estimated_profit"]), 0);

  return {
    source: "windows-resident",
    now: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    device: { platform: process.platform, hostname: os.hostname() },
    business: {
      connected: true,
      businessName: business.name || "Legacy Jewelry Co.",
      inventoryUnits: units,
      inventoryStyles: inventory.length,
      lowStockCount: lowStock,
      openOrders: orders.filter((order) => !["completed", "canceled", "cancelled"].includes(String(order.status || "").toLowerCase())).length,
      customers: customers.length,
      monthRevenue,
      monthProfit,
    },
    inventory: inventory.slice(0, 100),
    orders: orders.slice(0, 40),
    expenses: expenses.slice(0, 40),
    memories: memoriesResult.data || [],
    tasks: tasksResult.data || [],
    connections: { legacy: true, desktopResident: true },
  };
}

async function askJarvis(text) {
  const context = await buildCrmContext();
  const response = await fetch(`${JARVIS_BASE_URL}/api/jarvis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, history: [], context }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `JARVIS request failed (${response.status})`);

  if (data.action?.type && data.action.type !== "none") {
    try {
      await supabase.from("jarvis_pending_actions").insert({
        user_id: user.id,
        action_type: data.action.type,
        title: data.action.title || data.action.subject || data.action.query || data.action.type,
        payload: data.action,
        status: "pending",
        reason: data.action.reason || "Requested from Windows resident voice",
      });
    } catch {}
  }

  return String(data.reply || "I'm here.");
}

async function handleVoice(text) {
  const local = await maybeHandleLocalIntent(text);
  if (local.handled) return local.reply;
  return askJarvis(local.text);
}

async function handleDeviceRow(row) {
  const { data: claimed, error: claimError } = await supabase
    .from("jarvis_device_commands")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (claimError || !claimed) return;
  try {
    const result = await executeDeviceCommand(claimed.command, claimed.args || {});
    await supabase.from("jarvis_device_commands").update({
      status: "completed",
      result,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", claimed.id);
    console.log(`✓ ${result}`);
  } catch (error) {
    await supabase.from("jarvis_device_commands").update({
      status: "failed",
      result: error.message,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", claimed.id);
    console.error(`✗ ${error.message}`);
  }
}

const { data: pending } = await supabase.from("jarvis_device_commands").select("*").eq("user_id", user.id).eq("device", "desktop").eq("status", "pending").order("created_at");
for (const row of pending || []) await handleDeviceRow(row);

const channel = supabase
  .channel(`jarvis-resident-${user.id}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvis_device_commands", filter: `user_id=eq.${user.id}` }, ({ new: row }) => {
    if (row.device === "desktop" && row.status === "pending") handleDeviceRow(row);
  })
  .subscribe((status) => { if (status === "SUBSCRIBED") console.log("Desktop command channel online."); });

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, user: user.email, resident: true }));
    return;
  }

  if (req.url !== "/voice-command" || req.method !== "POST") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (req.headers["x-jarvis-local-secret"] !== localSecret) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const text = String(body.text || "").trim();
    if (!text) throw new Error("Text is required");
    console.log(`Heard: ${text}`);
    const reply = await handleVoice(text);
    res.writeHead(200);
    res.end(JSON.stringify({ reply }));
  } catch (error) {
    console.error(`Voice command failed: ${error.message || error}`);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message || "Voice command failed" }));
  }
});

server.listen(LOCAL_PORT, "127.0.0.1", () => console.log("Local voice bridge online."));

let wakeProcess = null;
const pythonExe = path.join(__dirname, ".venv", "Scripts", "python.exe");
try {
  await fs.access(pythonExe);
  wakeProcess = spawn(pythonExe, [path.join(__dirname, "wake_listener.py")], {
    cwd: __dirname,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      JARVIS_BASE_URL,
      JARVIS_LOCAL_PORT: String(LOCAL_PORT),
      JARVIS_STATE_DIR: STATE_DIR,
    },
  });
  wakeProcess.on("exit", (code) => console.error(`Wake listener stopped with code ${code}.`));
} catch {
  console.error("Wake listener is not installed yet. Run install-resident.ps1.");
}

async function shutdown() {
  try { wakeProcess?.kill(); } catch {}
  await new Promise((resolve) => server.close(() => resolve()));
  try { await supabase.removeChannel(channel); } catch {}
  try { await supabase.auth.signOut(); } catch {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});
