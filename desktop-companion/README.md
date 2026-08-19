# Legacy JARVIS Resident for Windows — Repair Build V3

This build is the always-on Windows companion for the Legacy Jewelry CRM JARVIS.

## What changed in V3

- A reinstall always removes the old encrypted resident session and asks you to pair again. It will not silently reuse a stale pairing.
- Pairing no longer signs out immediately after saving the session.
- Startup restores/refreshes the saved Supabase session and stores the rotated token again.
- Resident shutdown no longer signs out and revokes its own pairing.
- The installer runs an authentication self-test before registering Windows Startup.
- The installer runs a real Hey Jarvis model + microphone self-test before declaring success.
- PyAudioWPatch is explicitly installed for Windows microphone capture.
- The wake listener retries the microphone instead of killing JARVIS if an audio device temporarily fails.
- start-resident.cmd is diagnostic: if JARVIS crashes, the window stays open so the error cannot disappear.
- Windows Startup uses a separate hidden launcher only after all tests pass.

## Install

1. If Windows marks the ZIP as downloaded, right-click the ZIP -> Properties -> Unblock -> Apply before extracting.
2. Extract the ZIP to a permanent folder.
3. Double-click INSTALL-JARVIS.cmd.
4. The installer should explicitly show "One-time Legacy CRM / JARVIS pairing is required now" and ask for your Legacy CRM email/password.
5. Do not close the installer while it downloads/tests the wake model.
6. Installation is only considered successful when you see:
   - Paired session: OK
   - Wake model + microphone: OK
   - Resident health endpoint: OK
   - Windows startup: ENABLED

Then say "Hey Jarvis".

## Diagnostics

Run start-resident.cmd. It intentionally stays open after a crash.

Logs:

%USERPROFILE%\.legacy-jarvis\resident.log

%USERPROFILE%\.legacy-jarvis\wake-listener.log

Do not disable Windows Smart App Control or Defender for JARVIS.
