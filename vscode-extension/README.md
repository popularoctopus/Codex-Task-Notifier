# Codex Task Notifier

Visual and sound alerts for Codex tasks in desktop VS Code.

Codex Task Notifier is an independent, unofficial extension. It is not affiliated with, endorsed by, or supported by OpenAI.

## How it works

- Substantive Codex tasks automatically open a status tab showing **Working...**—by default, after 10 seconds of activity or earlier when a supported editing tool is detected. Quick chats stay quiet.
- When completion is detected, **Done** flashes in the status tab and the selected alert sound plays. Sound alerts also work when the tab is closed.
- Click the status tab while it shows **Done** to reset it to **Ready**.
- Open the tab's menu to choose dark or light mode, a font, and one of six notification sounds.

An approval pause can also trigger **Done**. If Codex resumes work, the tab returns to **Working...**.

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
