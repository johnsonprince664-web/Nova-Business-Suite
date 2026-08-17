import { supabase } from "./lib/supabase";

function parseComputerCommand(text) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const apps = ["chrome", "edge", "spotify", "calculator", "notepad", "explorer", "settings"];
  for (const app of apps) {
    if (lower === `open ${app}` || lower === app) return { command: "open_app", args: { app }, label: `Open ${app}` };
  }
  if (["lock pc", "lock computer", "lock my pc", "lock my computer"].includes(lower)) return { command: "lock_pc", args: {}, label: "Lock PC" };
  if (/^https?:\/\//i.test(value)) return { command: "open_url", args: { url: value }, label: `Open ${value}` };
  if (/^open\s+https?:\/\//i.test(value)) {
    const url = value.replace(/^open\s+/i, "");
    return { command: "open_url", args: { url }, label: `Open ${url}` };
  }
  if (/^open path\s+/i.test(value)) {
    const target = value.replace(/^open path\s+/i, "");
    return { command: "open_path", args: { path: target }, label: `Open ${target}` };
  }
  return null;
}

async function queueComputerCommand() {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session?.user?.id) return alert("Sign in to JARVIS first.");
  const input = window.prompt("Computer command\n\nExamples:\nopen chrome\nopen spotify\nopen calculator\nlock pc\nhttps://openai.com\nopen path C:\\Users\\Prince\\Downloads");
  if (!input) return;
  const parsed = parseComputerCommand(input);
  if (!parsed) return alert("That command is not in the safe desktop allowlist yet.");
  const ok = window.confirm(`Send this command to your paired desktop?\n\n${parsed.label}`);
  if (!ok) return;
  const { error } = await supabase.from("jarvis_device_commands").insert({
    user_id: session.user.id,
    device: "desktop",
    command: parsed.command,
    args: parsed.args,
    status: "pending"
  });
  if (error) return alert(`Could not queue command: ${error.message}`);
  window.dispatchEvent(new CustomEvent("jarvis:computer-command", { detail: parsed }));
  alert("Command queued. Your JARVIS Desktop Companion will execute it if it is running.");
}

function installButton() {
  const dock = document.getElementById("jarvis-upgrade-dock");
  if (!dock || dock.querySelector("[data-jarvis-computer]")) return false;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.jarvisComputer = "true";
  button.title = "Send a safe command to your paired Windows computer";
  button.innerHTML = "<span>Computer</span> ⌘";
  button.addEventListener("click", queueComputerCommand);
  dock.insertBefore(button, dock.lastElementChild);
  return true;
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (installButton() || attempts > 60) clearInterval(timer);
}, 250);

window.JARVIS_COMPUTER = { queueComputerCommand, parseComputerCommand };
