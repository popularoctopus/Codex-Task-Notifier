# Changelog

## 0.3.15

- Add a saved 0–100% volume slider to the board settings for previews and completion sounds on Windows, macOS, and Linux, including alerts with the board closed. Existing installations default to 100%; 0% mutes audio while keeping visual notifications.

## 0.3.14

- Show Thinking when a new input turn starts, then Working on a supported editing call or after the default 10-second threshold.
- Detect final responses and interruptions from matching local session transcripts; approval pauses and read-state/diff events no longer trigger Done.
- Return quietly to Ready for final responses under the threshold, including editing turns, and for interrupted or disrupted sessions.
- Use event timestamps for short-turn detection and preserve other active sessions on completion or cancellation.

## 0.3.13

- Refresh the packaged extension icons.

## 0.3.12

- Replace the extension icons with updated artwork and exclude the unused legacy icon from the package.
- Include the privacy statement and updated third-party sound attribution.

## 0.3.11

- Package releases with the official VS Code Extension Manager (`@vscode/vsce`).
- Clarify that Codex Task Notifier is an independent, unofficial extension not affiliated with OpenAI.

## 0.3.10

- Replace the Magic notification sound with Chime.
- Set Chime, Arial, and dark mode as the first-install defaults.

## 0.3.9

- Use hosted screenshot URLs on grgwtsn.com in the Details page.

## 0.3.8

- Simplify the Details page with functionality, installation, and Command Palette instructions.
- Add Ready, Settings, Working, and Done screenshots and repository resources.

## 0.3.7

- Bundle Manufacturing Consent as the Blackletter font choice on all platforms.
- Use its original regular weight and preserve the Blackletter label in settings.

## 0.3.6

- Load the bundled blackletter font through a VS Code webview resource URL on all platforms.
- Resolve font labels after loading and detect missing local fonts correctly.
- Preserve host appearance preferences when opening a fresh board.

## 0.3.5

- Use the updated bell artwork from the icons directory for the extension icon.

## 0.3.4

- Replace the serif substitute with bundled UnifrakturCook blackletter typography.
- Permit the packaged font through the board webview's content security policy.

## 0.3.3

- Replace Cloister Black with a cross-platform Palatino font stack.
- Add fallback stacks and platform-aware labels for all font choices.

## 0.3.2

- Keep quick chats quiet: defer Working and suppress alerts for turns below a configurable 10-second activity threshold.
- Qualify editing turns early using apply_patch calls from matching local session transcripts, with an opt-out setting.
- Exclude completion-settling time from qualification and preserve immediate approval-pause resumption once a turn qualifies.
- Add coverage for short/long turns, edit qualification, delayed transcript reads, and timer cleanup.

## 0.3.1

- Return to Working when new reasoning resumes in a turn already marked Done, including after an approval pause.
- Allow a fresh Done alert after resumed work completes, without suppressing closely spaced notifications.
- Ignore repeated reasoning item IDs and mismatched turn IDs when reopening a turn.

## 0.3.0

- Detect Codex starts and completions from local logs without a setup prompt or agent-written status files.
- Track turns without a duration cutoff or global alert cooldown; deduplicate per turn.
- Handle incremental reads, partial records, rotation and truncation; skip history at activation.
- Add automatic/conservative detection modes and a log path override.
- Remove the instruction setup command and button. Preserve native audio and appearance settings.
- Ignore ambiguous concurrent events; private log formats and chat inference remain limitations.

## 0.2.24

- Play completion sounds and previews natively on macOS with afplay, and on Linux with pw-play, paplay, or aplay.
- Play completion sounds with the board closed, without an Enable sounds click, on all three desktop platforms.
- Retry Linux playback with another backend when a player is missing or fails, and report failures in the Output channel.

## 0.2.23

- Refresh the packaged extension icon assets with the latest supplied artwork.

## 0.2.22

- Refresh the packaged extension icon assets with the updated supplied artwork.

## 0.2.21

- Add the supplied bell artwork as the extension icon, with 128, 256, 512, and 1024 pixel variants included in the package.

## 0.2.20

- Underline only the Donate text, leaving the heart icon without an underline.

## 0.2.19

- Enlarge the heart icon and place it to the right of Donate.

## 0.2.18

- Close the settings menu when clicking outside it while keeping inside controls usable.
- Add a small heart beside the Donate link.

## 0.2.17

- Use the hosted HTTPS screenshot URL so the notification preview loads on the VS Code Details page.

## 0.2.16

- Add a notification preview screenshot between Installation and Command Palette on the details page.

## 0.2.15

- Display the complete setup prompt in a centered block with a clear copy label.
- Enlarge and bold Installation and step headings, rename step 2, and remove the setup callout.

## 0.2.14

- Emphasize Installation with a framed section, setup callout, and numbered step headings.
- Keep the full setup prompt in an expandable section supported by the VS Code Details page, replacing unsupported scrolling styles.

## 0.2.13

- Simplify the extension details page with a concise description, guided installation steps, a copyable setup prompt, and Command Palette explanations.

## 0.2.12

- Configure global Codex instructions with a single setup prompt per Codex profile.
- Resolve the status file location from each task's current workspace and account for global instruction overrides.

## 0.2.11

- Have the watcher open the board when a task starts even if VS Code is not focused, with a focus-change retry if needed.

## 0.2.10

- Show a pointer cursor while the board is in Done status to indicate it can be clicked to reset.

## 0.2.9

- Reset the Done board to Ready by clicking anywhere on the page.
- Show a `Click to reset.` tooltip while the board is Done.

## 0.2.8

- Remove the explicit board-opening request from the copied setup prompt so onboarding relies on the notifier's normal task-start behavior.

## 0.2.7

- Put the install and Codex onboarding flow directly on the extension details page.
- Include a copyable setup prompt that asks Codex to open the board with the VS Code command after validation.
- Add a manual Command Palette fallback when Codex cannot invoke VS Code UI commands.

## 0.2.6

- Play Windows completion sounds through a hidden Windows PowerShell/.NET player, without a board click and even when the board is closed.
- Route Windows Play buttons through the native player and prevent duplicate webview sounds.
- Run in the local UI extension host so Windows audio stays on the user's computer.
- Convert Magic and Scifi to standard 16-bit PCM WAV for SoundPlayer compatibility.
- Bound native playback time, stop superseded players, and report failures in the Output channel.
- Preserve webview playback on macOS and Linux.

## 0.2.5

- Reuse the audio player unlocked by Play so subsequent task completions can play sound.
- Report playback error details in the Output channel and distinguish gesture restrictions from other failures.
- Suppress warnings when a newer sound intentionally interrupts playback.

## 0.2.4

- Replace manual integration instructions with a prompt to paste into Codex.

## 0.2.3

- Add setup instructions to the board settings menu.

## 0.2.2

- Simplify the Ko-fi menu link label to `Donate`.

## 0.2.1

- Add a Ko-fi support link to the settings menu.

## 0.2.0

- Bundle the board and all six WAV sounds in the extension.
- Replace HTTP polling with portable workspace status files and webview messages.
- Play the selected completion sound; report playback errors.
- Add setup instructions and a test notification command.
- Persist settings in VS Code storage and track multiple workspace roots.
- Preserve Ready for stored Done and suppress repeated completion events.
- Retain the existing extension identity and optional legacy status-file support.
