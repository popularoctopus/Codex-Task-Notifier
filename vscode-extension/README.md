# Codex Task Notifier

Visual and sound alerts for Codex tasks in desktop VS Code.

Codex Task Notifier is an independent, unofficial extension. It is not affiliated with, endorsed by, or supported by OpenAI.

## How it works

- When Codex receives a new turn, the status tab opens showing **Thinking**.
- The tab switches to **Working...** after 10 seconds, or immediately when a supported file-editing call is detected.
- When Codex produces its final response, **Done** flashes and the selected alert sound plays. Sound alerts also work when the tab is closed.
- Responses that finish in under 10 seconds return quietly to **Ready**, even if an edit briefly showed **Working...**. Interrupted or superseded turns also return to **Ready** without a completion alert.
- Click the status tab while it shows **Done** to reset it to **Ready**.
- Open the tab's menu to choose dark or light mode, a font, and one of six notification sounds. Adjust the Volume slider from 0% (muted) to 100%; it saves automatically and controls previews and completion alerts, including when the board is closed.

Approval prompts and read-state changes do not trigger **Done**. If several turns
are active, **Working...** takes priority over **Thinking**, and finishing or
interrupting one turn does not hide another active turn.

Detection follows this VS Code window's local `Codex.log` and matching session
transcripts. It polls every 500 ms; transcript creation and flushing can add delay.
Existing history is skipped when the extension starts, so start a new turn after
reloading. These are private Codex formats and may change. Remote or unavailable
transcripts cannot provide final-response detection. Supported early edit signals
are `apply_patch` calls (including direct calls inside `functions.exec`) and patch
start events; other editing methods still switch to Working at the time threshold.

`codexTaskNotifier.minimumActivitySeconds` changes the default 10-second threshold.
`codexTaskNotifier.detectFileEdits` disables only early edit detection; lifecycle
events are still read. The legacy `detectionMode` setting is no longer used.
Reload the VS Code window after changing detection settings.

## Screenshots

### Ready

![Ready status in the Codex Task Notifier tab](https://grgwtsn.com/images/Ready.png)

### Settings

![Settings menu with mode, font, and notification sound choices](https://grgwtsn.com/images/Settings.png)

### Working...

![Working status during an active Codex task](https://grgwtsn.com/images/Working.png)

### Done

![Done status and completion notification](https://grgwtsn.com/images/Done.png)

## Installation

Click **Install** in VS Code. With the OpenAI Codex extension installed, start a new Codex task. No additional setup is required.

## Command Palette

Open the Command Palette with **Ctrl+Shift+P** (Windows/Linux) or **Cmd+Shift+P** (Mac).

- **Codex Task Notifier: Open Status Board** — Open the status tab or bring an existing tab into view.
- **Codex Task Notifier: Refresh Status Board** — Reload the status tab, or open it if it is closed.
- **Codex Task Notifier: Test Notification** — Show **Working...**, then trigger **Done** and the selected sound after about two seconds.

## Privacy

Codex log data and matching session transcripts are processed locally solely to
provide task-status indicators and notifications. The extension does not transmit
this data or use it for any other purpose. Preferences are stored locally and used
only to customize your experience; the extension does not transmit them.
See the [privacy statement](PRIVACY.md) for details, controls, and information
about VS Code's separate settings synchronization.

## Resources

- [Repository](https://github.com/popularoctopus/Codex-Task-Notifier)
- [Report an issue](https://github.com/popularoctopus/Codex-Task-Notifier/issues)
- [Support development](https://ko-fi.com/popularoctopus)
