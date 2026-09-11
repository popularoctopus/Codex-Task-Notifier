# Changelog

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
