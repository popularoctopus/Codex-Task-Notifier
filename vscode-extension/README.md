# Codex Task Notifier

Automatic visual and audio alerts for Codex turns in desktop VS Code.

## Install and test

Install the VSIX using **Extensions: Install from VSIX**, then reload VS Code.
Start a new turn in the OpenAI Codex extension. No setup prompt, standing
instructions, status files, or separate server are required.
Use **Codex Task Notifier: Test Notification** to check the board and sound.
Disable other completion notifiers during testing to avoid double alerts.

Quick chats stay quiet by default. Working appears after 10 seconds of ongoing
turn activity, or earlier when an editing tool call is detected. Turns that never
qualify do not open the board or produce completion sounds/messages. Their
three-second completion-settling interval does not count toward the threshold.
Once a turn qualifies, approval pauses and resumed reasoning retain the
Working / Done / Working / Done behavior without another delay.

## Detection

The extension reads appended records from the current extension host's
`openai.chatgpt/Codex.log`. Existing history is skipped at activation; start a new
turn after reload. Log content is not transmitted or copied into diagnostics.

Early edit detection also reads bounded tails of local session transcripts under
CODEX_HOME/sessions (normally ~/.codex/sessions), only for threads observed in this
window's log. It recognizes direct apply_patch calls and direct tools.apply_patch
calls in code mode. It does not execute transcript code or transmit transcript
content. Arbitrary shell-based edits, unavailable transcripts, unusually large
records, and unsupported tool formats fall back to the activity-duration filter.
Tool invocation signals editing intent, not guaranteed successful file changes.

Turn-start and reasoning markers track conversations. A turn-diff completion
marker confirms a matching turn. Without an ID, it requires a preceding read-state
hint and exactly one active turn. Automatic mode also infers chat completion
from a read-state event followed by three seconds without further known reasoning
activity. Starting the next turn preserves the preceding pending chat completion.
There is no task-duration cutoff or global completion cooldown. Repeated
completion signals without resumed reasoning do not alert again. If new reasoning
resumes in the same turn, the board returns to Working and can alert again when
that work finishes. An approval pause may therefore show Done and play a sound;
Done means attention may be needed or work has finished, not guaranteed task success.

The log format is private and may change. A read-state hint is a heuristic, not
proof of success. Ambiguous concurrent events are ignored. Cancellation and
approval waiting are not reliably exposed by these markers. Standalone CLI and
desktop app detection are not included. Remote/WSL hosts may need an accessible
path override and have not been validated.

Rotation and truncation reset activity without a completion alert. Reads are
bounded and incremental, with partial line and UTF-8 handling.

## Settings and commands

- **Auto Open**: open the board when a turn starts.
- **Minimum Activity Seconds**: default 10; set 0 to restore alerts for all turns.
- **Detect File Edits**: default on; use matching local transcripts to qualify
  editing turns early. Disable to use duration filtering alone.
- **Notifications**: show a completion message.
- **Detection Mode**: automatic includes chat inference; conservative requires
  a turn-diff marker and can miss chat-only turns.
- **Codex Log Path**: optional absolute path for a different extension host.

Reload VS Code after changing detection mode, path, or activity-filter settings.
Diagnostics appear in **Output > Codex Task Notifier**.
Commands: **Open Status Board**, **Refresh Status Board**, **Test Notification**.
Board settings preserve fonts, light/dark modes, and six sounds. Click Done to reset.

Native sound works with the board closed: PowerShell on Windows, afplay on macOS,
and pw-play, paplay, or aplay on Linux. Linux needs one of these players and a
working desktop audio session. Each completion triggers an alert; a new sound
replaces one already playing.

## Upgrade from 0.2.x

Remove only the Codex Task Notifier blocks from old agent instructions and delete
obsolete `.codex-task-status.json` files. The new extension ignores those files
and does not edit instructions itself. Start a fresh Codex conversation after
cleanup; existing conversations can retain earlier instructions.

Version 0.3.2 is a local testing build. Automated tests do not replace live VS Code
notification and audio checks.
