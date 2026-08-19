# Legacy JARVIS Resident for Windows — V4

JARVIS V4 is the always-on Windows companion for the Legacy Jewelry CRM.

## Why V4 exists

Windows Smart App Control blocked the old Python/openWakeWord build when NumPy attempted to load an unsigned compiled `.pyd` module. V4 removes that entire dependency chain.

V4 uses:

- Windows `System.Speech` for local wake-phrase detection and command recognition.
- Node.js for the authenticated resident service, Legacy CRM context, safe desktop controls, and JARVIS reasoning bridge.
- The existing JARVIS Cedar speech API for spoken replies.

There is no Python, NumPy, PyAudio, openWakeWord, or third-party compiled wake-word DLL in V4.

## Wake phrases

- Hey Jarvis
- Jarvis
- Wake up Jarvis

For the most reliable flow, say the wake phrase, wait for the short chime, then say the command.

## Install

1. If Windows shows an Unblock option on the downloaded ZIP, right-click the ZIP -> Properties -> Unblock -> Apply before extracting.
2. Extract the ZIP to a permanent folder.
3. Double-click `INSTALL-JARVIS.cmd`.
4. The installer forces one fresh Legacy CRM/JARVIS pairing and validates that the encrypted session can restore.
5. It tests Windows Speech Recognition and the default microphone before registering startup.
6. It starts Resident V4 and verifies both the local health endpoint and the separate wake-listener process.

Installation is successful only when you see:

- Paired session: OK
- Windows speech + microphone: OK
- Resident health endpoint: OK
- Wake listener process: OK
- Windows startup: ENABLED

## If Windows Speech is missing

Open Windows Settings -> Time & language -> Language & region -> English -> Language options and install the Speech language feature, then run the installer again.

## Diagnostics

Run `start-resident.cmd`. It intentionally stays open if the resident fails so the error cannot disappear.

Logs:

`%USERPROFILE%\.legacy-jarvis\resident.log`

`%USERPROFILE%\.legacy-jarvis\wake-listener.log`

Do not disable Smart App Control or Microsoft Defender for JARVIS.
