# Verification

Local Windows verification completed on 2026-10-27:

| Check | Result |
| --- | --- |
| Strict TypeScript and production renderer build | Passed |
| Node storage and audio-engine suite | 45 passed |
| npm dependency audit | No known vulnerabilities reported |
| Real Electron desktop workflows, compact layout, and restart recovery | Passed |
| Packaged Windows executable launch, library load, protocol, and sandbox | Passed |
| Production CSP, protocol traversal, audio-ID boundary, and new-window denial | Passed |
| Remote main history scan for known credential patterns and private files | No matches in reviewed history |
| Physical virtual-cable delivery into another app | Requires hardware/driver setup; not verified |

## Automated checks

`npm run build` runs TypeScript in strict mode and creates the production bundle.

`npm test` exercises first-launch sample generation, valid WAV output, persistent reload, private-copy import, source-file preservation, partial import errors, file size limits, duplicate shortcut rejection, concurrent saves, corrupt catalog preservation, traversal rejection, and routing input validation. Audio-engine behavior tests cover the bus topology, microphone isolation, playback lifecycle, and pending-play cancellation with instrumented Web Audio objects.

Regression coverage includes stop commands during output-device changes, cancellation during microphone startup, duplicate capture requests, runtime cable failure, failed-save rollback, transactional mutation ordering, failed import recovery, and malformed catalog metadata. A rejected write never changes the committed in-memory catalog or leaks into a later successful save.

Additional release checks cover immediate microphone mute while an output change is pending, cancellation of capture during mute, byte-budget eviction of decoded audio, and playback of files larger than the cache budget without retaining them.

Startup routing tests cover restoring a saved enabled or disabled virtual route, preserving selected devices and levels, and independent recovery when the speaker, cable, or both are unavailable. The desktop suite also reloads the application with deterministic test sinks to verify that enabled virtual routing survives startup without relying on CI audio hardware.

Device-identity regressions cover unique label recovery after ID changes, Windows instance counters, ambiguous names, channel-layout mismatches, recording/playback direction, default aliases, missing labels, and manual selection changes. The desktop suite simulates an unavailable old cable ID and verifies that the recovered ID and remembered voice mute persist after reload.

Voice mixing tests verify the default enabled preference and system-default microphone selection, automatic capture only with a connected cable, preservation of a saved mute, and microphone failure reporting. Desktop startup/mute checks use a synthetic in-memory microphone stream and do not capture the machine's real microphone.

`npm run test:desktop` launches the actual built Electron application with a fresh isolated library. It tests decode/play/stop, favorite filtering, search/empty state, metadata editing, looping past the original duration, Escape stop, native import IPC and audio copying, imported playback, the removal confirmation flow, setup dialog, persisted playback preferences, list/grid views, and layout at 1440×940 and 1080×740. The test stubs only its own native file picker to choose a generated test WAV; playback and storage use the real implementation. Screenshots are saved under `.local-test/` and the fresh soundboard screenshot is copied into `docs/`.

## Hardware checks

End-to-end delivery into Discord or another app requires an installed virtual audio cable and that app’s input selection. Automated tests cannot establish what a remote caller hears. Verify this using the chat app’s mic test or a recording app with CABLE Output selected. Test physical mic mixing, unplug/replug behavior, and device-specific latency with your actual hardware.

The app does not install a virtual driver. Until a cable is configured, speaker playback works and the virtual route stays disabled. Outputs may have different hardware latency. A Web Audio compressor helps contain mixed peaks but is not a certified brick-wall limiter. The clip level meter excludes the microphone. Windows packages are unsigned; public distribution should add release signing and project-specific publishing metadata.

The desktop suite also restarts with disconnected saved devices to verify recovery and safe startup. `npm run test:package` opens the unpacked production executable in a fresh isolated profile under `.local-test/`, checks that microphone capture is off, verifies packaged copyright/dependency notices, and checks the custom protocol and Electron sandbox settings. It verifies that CSP blocks remote fetches, traversal cannot leave the asset directory, audio IDs cannot read arbitrary paths, and new windows are denied. It does not use the normal user library or its saved microphone preference. The Windows CI workflow builds, runs unit/desktop/packaged checks, and uploads the portable executable as a build artifact.
