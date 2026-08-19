import { supabase } from "./lib/supabase";

const VAPID_PUBLIC_KEY = "BD0uIhvZC07NFQogEHdoVnfzp4tJncd6keZmzZeSvud79AuVWzox-3pBg3mh0yc4Du1igb1NdsI9VdjmnC6f8UA";

function toUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function enablePush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      throw new Error("This browser does not support Web Push.");
    }
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.user?.id) throw new Error("Sign in to JARVIS first.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    const json = subscription.toJSON();
    const { error } = await supabase.from("jarvis_push_subscriptions").upsert({
      user_id: session.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,endpoint" });
    if (error) throw error;

    window.JARVIS_EXTENSIONS?.openExtensionPanel?.("Push notifications enabled", "This device is subscribed to JARVIS Web Push. Proactive alerts can now arrive through the installed PWA/browser even when the JARVIS page is not open, subject to your browser/OS background-notification rules.");
    const button = document.querySelector("[data-jarvis-push]");
    if (button) button.classList.add("active");
    const label = button?.querySelector("span");
    if (label) label.textContent = "Push on";
    return subscription;
  } catch (error) {
    window.JARVIS_EXTENSIONS?.openExtensionPanel?.("Push setup failed", error.message || String(error));
    throw error;
  }
}

async function disablePush() {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && session?.user?.id) {
      await supabase.from("jarvis_push_subscriptions").delete().eq("user_id", session.user.id).eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
    const button = document.querySelector("[data-jarvis-push]");
    button?.classList.remove("active");
    const label = button?.querySelector("span");
    if (label) label.textContent = "Push";
  } catch (error) {
    console.warn("Could not disable JARVIS push", error);
  }
}

async function syncPushState() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const button = document.querySelector("[data-jarvis-push]");
    if (subscription && button) {
      button.classList.add("active");
      const label = button.querySelector("span");
      if (label) label.textContent = "Push on";
    }
  } catch {}
}

function installButton() {
  const dock = document.getElementById("jarvis-upgrade-dock");
  if (!dock || dock.querySelector("[data-jarvis-push]")) return false;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.jarvisPush = "true";
  button.title = "Enable closed-app JARVIS push notifications on this device";
  button.innerHTML = "<span>Push</span> ◌";
  button.addEventListener("click", async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && button.classList.contains("active")) {
      if (confirm("Turn off JARVIS push notifications on this device?")) await disablePush();
    } else await enablePush();
  });
  dock.insertBefore(button, dock.lastElementChild);
  syncPushState();
  return true;
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (installButton() || attempts > 60) clearInterval(timer);
}, 250);

window.JARVIS_PUSH = { enablePush, disablePush, syncPushState };
