import process from "node:process";
import { restorePairedClient } from "./session.mjs";

try {
  const { supabase, user } = await restorePairedClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw error || new Error("No authenticated user returned.");
  if (data.user.id !== user.id) throw new Error("Authenticated user mismatch.");
  console.log(`AUTH_OK ${data.user.email || user.email || "paired-user"}`);
  // Do not call signOut(): that revokes the refresh token the resident needs.
  supabase.auth.stopAutoRefresh?.();
  process.exit(0);
} catch (error) {
  console.error(`AUTH_FAILED ${error?.message || error}`);
  process.exit(1);
}
