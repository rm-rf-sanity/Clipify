# Publication review

Engineering reviewed on 2026-10-27. Copyright policy updated on 2026-10-28:
Clipify 0.2.0 is offered with all rights reserved and no license grant.

## Outcome

No publication-blocking issue was found in the reviewed source, published Git
history, dependency audit, or Windows package. This is a bounded engineering
review, not a guarantee that every device, codec, or future dependency is safe.
Repository visibility is a separate owner decision; this review does not make
the repository public.

## Changes made during review

- Microphone mute now stops active capture immediately, even while output
  configuration is pending, and cancels capture that is still starting.
- Decoded audio retained in the cache is limited to 12 files and 128 MiB.
  Individual larger clips may play without being retained. Active playback and
  decoding use additional memory.
- Packaged verification now uses a fresh test profile, verifies that microphone
  capture stays off, checks license files and production security boundaries,
  and runs in Windows CI. It does not open the owner's normal library.

## Evidence

- Strict TypeScript and production renderer build passed.
- All 36 unit/regression tests passed.
- Real Electron workflows passed: playback, stop, import, editing, removal,
  filtering, compact layout, persistence, routing recovery, and synthetic mic.
- The production executable passed isolated-profile startup, sandbox, context
  isolation, disabled Node integration, CSP, traversal, audio-ID, and new-window
  checks.
- The npm audit reported zero known vulnerabilities for the locked dependency
  tree at review time.
- Reviewed remote history contained no matches for the checked token, private
  key, credential-URL, secret-assignment, private-file, or personal-path patterns.
  Commit authors use the owner's GitHub noreply email. Pattern scanning cannot
  establish the absence of every possible secret.
- Copyright metadata and packaged copyright text agree. Bundled dependency notices and
  Electron/Chromium notices are retained. VB-CABLE is not bundled.
- The production archive excludes the local test directory, user library,
  repository metadata, and the abandoned custom licensing policy.

## Practical limits

- Windows binaries are unsigned and may trigger Windows reputation warnings.
- A virtual audio driver must be installed and configured separately. Defaults
  use the system speaker and microphone, not a developer-specific device.
- Caller-side Discord/game delivery, every hardware combination, and physical
  microphone latency are not established by automated tests. See
  [verification](verification.md) for manual hardware checks.
- A passing audit describes known advisories at one point in time. Keep Electron
  and other dependencies maintained after publication.
