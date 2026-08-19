const LOCATION_PERMISSION_KEY = "jarvis_location_permission_v1";

function requestJarvisLocation() {
  if (!navigator.geolocation) return;
  const previous = localStorage.getItem(LOCATION_PERMISSION_KEY);
  if (previous === "granted" || previous === "denied") return;

  navigator.geolocation.getCurrentPosition(
    () => {
      localStorage.setItem(LOCATION_PERMISSION_KEY, "granted");
      window.dispatchEvent(new CustomEvent("jarvis-location-permission", { detail: { granted: true } }));
    },
    (error) => {
      if (error?.code === 1) localStorage.setItem(LOCATION_PERMISSION_KEY, "denied");
      window.dispatchEvent(new CustomEvent("jarvis-location-permission", { detail: { granted: false, code: error?.code } }));
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
  );
}

function handleFirstJarvisInteraction(event) {
  const button = event.target?.closest?.('button[aria-label="Talk to JARVIS"]');
  if (!button) return;
  requestJarvisLocation();
}

document.addEventListener("click", handleFirstJarvisInteraction, true);
