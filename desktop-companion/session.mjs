import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://mholxlxqodhvbgmmweyw.supabase.co";
export const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_fW8V5f6W5oOttNx9Z1bmOg_fssHDkcJ";
export const STATE_DIR = path.join(os.homedir(), ".legacy-jarvis");
export const SESSION_FILE = path.join(STATE_DIR, "session.dpapi");
export const LOCAL_SECRET_FILE = path.join(STATE_DIR, "local-secret");

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

async function powershell(script, extraEnv = {}) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
      maxBuffer: 1024 * 1024,
    },
  );
  return String(stdout || "").trim();
}

async function protectWithDpapi(plainText) {
  const script = [
    "$s = ConvertTo-SecureString $env:JARVIS_SECRET -AsPlainText -Force",
    "$s | ConvertFrom-SecureString",
  ].join("; ");
  return powershell(script, { JARVIS_SECRET: plainText });
}

async function unprotectWithDpapi(cipherText) {
  const script = [
    "$s = ConvertTo-SecureString $env:JARVIS_SECRET",
    "$p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)",
    "try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }",
  ].join("; ");
  return powershell(script, { JARVIS_SECRET: cipherText });
}

export async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

export async function saveSession(session) {
  if (!session?.access_token || !session?.refresh_token) throw new Error("Supabase session is incomplete.");
  await ensureStateDir();
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || null,
    user_email: session.user?.email || null,
    saved_at: new Date().toISOString(),
  });
  const protectedText = await protectWithDpapi(payload);
  await fs.writeFile(SESSION_FILE, protectedText, "utf8");
}

export async function pairWithPassword(email, password) {
  if (process.platform !== "win32") throw new Error("Resident pairing currently targets Windows.");
  const supabase = makeClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email || "").trim(), password });
  if (error) throw error;
  if (!data.session) throw new Error("Supabase did not return a session.");
  await saveSession(data.session);
  await supabase.auth.signOut();
  return data.user;
}

export async function restorePairedClient() {
  if (process.platform !== "win32") throw new Error("JARVIS Resident currently targets Windows.");
  let cipherText;
  try {
    cipherText = (await fs.readFile(SESSION_FILE, "utf8")).trim();
  } catch {
    throw new Error("JARVIS is not paired yet. Run pair.ps1 first.");
  }
  const decoded = JSON.parse(await unprotectWithDpapi(cipherText));
  const supabase = makeClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: decoded.access_token,
    refresh_token: decoded.refresh_token,
  });
  if (error || !data.session) {
    throw new Error("JARVIS pairing expired. Run pair.ps1 again.");
  }

  let saving = false;
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    if (!nextSession || saving) return;
    saving = true;
    saveSession(nextSession).catch(() => {}).finally(() => { saving = false; });
  });

  await saveSession(data.session);
  return { supabase, user: data.user || data.session.user };
}
