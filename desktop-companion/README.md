# Legacy JARVIS Resident (Windows)

This companion lets JARVIS run even when the CRM browser tab is closed.

## What it does

- Starts automatically when you sign in to Windows.
- Listens locally for the wake phrase **"Hey Jarvis"** using openWakeWord.
- After the wake phrase, records the command, sends it to the existing JARVIS transcription/reasoning/voice APIs, and speaks the answer through Windows.
- Loads Legacy CRM inventory, orders, sales, customers, expenses, JARVIS memories, and tasks directly through the paired Supabase account so JARVIS can keep business context without the CRM being open.
- Can safely open allow-listed apps, open the Legacy CRM, open Downloads/Documents/Desktop, open approved URLs, and lock the PC.
- Uses a loopback-only authenticated bridge between the wake listener and the Node resident service.
- Stores the Supabase refresh session encrypted with Windows DPAPI for the current Windows user. It does **not** save the CRM password.

## Install

1. Install Node.js LTS and Python 3.10+ if they are not already installed.
2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-resident.ps1
```

3. Enter the same email/password you use for Legacy CRM once. The password is used only for the pairing login and is not written to disk.
4. When installation finishes, say **"Hey Jarvis"**.

The installer adds `Legacy JARVIS` to the current user's Windows Startup folder. Windows can disable it from Settings/Task Manager Startup Apps at any time.

## Tuning

Environment variables supported by the wake listener:

- `JARVIS_WAKE_THRESHOLD` (default `0.52`) — raise it to reduce false activations, lower it if JARVIS misses you.
- `JARVIS_RMS_THRESHOLD` (default `430`) — microphone speech/silence threshold.
- `JARVIS_SILENCE_SECONDS` (default `1.25`) — pause that ends a command.
- `JARVIS_MAX_COMMAND_SECONDS` (default `12`).
- `JARVIS_BASE_URL` — defaults to the production Legacy CRM URL.

## Logs

`%USERPROFILE%\.legacy-jarvis\resident.log`

`%USERPROFILE%\.legacy-jarvis\wake-listener.log`
