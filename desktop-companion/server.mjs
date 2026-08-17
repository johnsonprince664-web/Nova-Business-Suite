import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import process from "node:process";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://mholxlxqodhvbgmmweyw.supabase.co";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_fW8V5f6W5oOttNx9Z1bmOg_fssHDkcJ";

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const email = process.env.JARVIS_EMAIL || await rl.question("JARVIS account email: ");
const password = process.env.JARVIS_PASSWORD || await rl.question("JARVIS account password: ");
rl.close();

const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
if (error) throw error;
const user = data.user;
console.log(`JARVIS Desktop Companion paired to ${user.email}.`);
console.log("Allowed controls: open approved apps, open http/https URLs, open paths inside your home folder, or lock the PC.");

const APP_ALLOWLIST = {
  chrome: "chrome.exe",
  edge: "msedge.exe",
  spotify: "spotify.exe",
  calculator: "calc.exe",
  notepad: "notepad.exe",
  explorer: "explorer.exe",
  settings: "ms-settings:"
};

function windowsStart(target) {
  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", target], { windowsHide: true, stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Command exited ${code}`)));
  });
}

async function execute(command, args = {}) {
  if (process.platform !== "win32") throw new Error("This companion build currently targets Windows.");
  if (command === "open_app") {
    const app = String(args.app || "").toLowerCase();
    const target = APP_ALLOWLIST[app];
    if (!target) throw new Error(`App '${app}' is not in the safe allowlist.`);
    await windowsStart(target);
    return `Opened ${app}`;
  }
  if (command === "open_url") {
    const raw = String(args.url || "");
    const parsed = new URL(raw);
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
    await new Promise((resolve, reject) => {
      const child = spawn("rundll32.exe", ["user32.dll,LockWorkStation"], { windowsHide: true, stdio: "ignore" });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Lock command exited ${code}`)));
    });
    return "PC locked";
  }
  throw new Error(`Command '${command}' is not allowed.`);
}

async function handle(row) {
  const { data: claimed, error: claimError } = await supabase
    .from("jarvis_device_commands")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (claimError || !claimed) return;
  try {
    const result = await execute(claimed.command, claimed.args || {});
    await supabase.from("jarvis_device_commands").update({ status: "completed", result, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq("id", claimed.id);
    console.log(`✓ ${result}`);
  } catch (error) {
    await supabase.from("jarvis_device_commands").update({ status: "failed", result: error.message, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq("id", claimed.id);
    console.error(`✗ ${error.message}`);
  }
}

const { data: pending } = await supabase.from("jarvis_device_commands").select("*").eq("user_id", user.id).eq("device", "desktop").eq("status", "pending").order("created_at");
for (const row of pending || []) await handle(row);

const channel = supabase
  .channel(`jarvis-desktop-${user.id}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvis_device_commands", filter: `user_id=eq.${user.id}` }, ({ new: row }) => {
    if (row.device === "desktop" && row.status === "pending") handle(row);
  })
  .subscribe((status) => { if (status === "SUBSCRIBED") console.log("Desktop command channel online."); });

process.on("SIGINT", async () => {
  await supabase.removeChannel(channel);
  await supabase.auth.signOut();
  process.exit(0);
});

await new Promise(() => {});
