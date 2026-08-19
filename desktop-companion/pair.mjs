import process from "node:process";
import { pairWithPassword, SESSION_FILE } from "./session.mjs";

const email = String(process.env.JARVIS_EMAIL || "").trim();
const password = String(process.env.JARVIS_PASSWORD || "");

if (!email || !password) {
  console.error("Pairing requires JARVIS_EMAIL and JARVIS_PASSWORD. Run pair.ps1 instead of pair.mjs directly.");
  process.exit(2);
}

try {
  const user = await pairWithPassword(email, password);
  console.log(`JARVIS paired to ${user?.email || email}.`);
  console.log(`Encrypted Windows-user session saved to ${SESSION_FILE}.`);
} catch (error) {
  console.error(`Pairing failed: ${error.message || error}`);
  process.exit(1);
}
