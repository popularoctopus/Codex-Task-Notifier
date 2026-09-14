# Codex Task Notifier

Get notified when Codex tasks complete, with visual and audio alerts.

---

# **Installation**

## **① Install the extension**

Click the **Install** button above to install Codex Task Notifier in VS Code.

## **② Copy the prompt below into Codex**

Copy all the text in the prompt box and run it in Codex once to set up notifications across your workspaces.

<table align="center">
<thead><tr><th align="center">COPY THIS ENTIRE PROMPT</th></tr></thead>
<tbody><tr><td align="left"><blockquote><pre><code>Set up Codex Task Notifier once for all my workspaces using global Codex instructions.
Use AGENTS.md in the active Codex home directory (CODEX_HOME when set, otherwise
~/.codex). Create it if needed, preserve unrelated instructions, and replace old
notifier rules. If AGENTS.override.md takes precedence there, update its notifier
rules too so the global rules are effective without changing unrelated instructions.
Do not add notifier rules to workspace AGENTS.md files. Check the current workspace's
applicable instruction files for old notifier rules and remove only those blocks.&#10;
Add these global rules: Resolve the current task's workspace root from the current
environment for each task. Never hard-code the setup workspace or reuse a path from
an earlier task. If no workspace root is available, skip the status update and report
that briefly.
Before substantive work, write .codex-task-status.json in that workspace root as JSON:
{"state":"working","updatedAt":"&lt;new unique timestamp or task identifier&gt;"}
Only after all requested work and validation are complete, immediately before the
final response, write the same file with state "done" and a new unique updatedAt.
Never mark unfinished, blocked, or interrupted work done. Only the primary agent
updates the file, using ordinary file tools. Keep task content and personal data
out of it. If a status update fails, report it briefly and continue authorized work.
Respect existing sandbox permissions and approval requirements.&#10;
Include in the global rules: In each Git workspace, ensure .codex-task-status.json is
ignored in the workspace root .gitignore without duplicating an existing matching rule.&#10;
Validate the setup and report which global instruction files were updated. Remind me
to start a new Codex session in other workspaces so they load the global rules.</code></pre></blockquote></td></tr></tbody>
</table>

Start a new Codex session in other workspaces so they load the setup.

## **③ Watch for notifications**

The board opens when Codex begins a task. When it finishes, look for the **Done** alert and listen for the notification sound.

Sounds play automatically on Windows, macOS, and Linux, even with the board closed while VS Code is running. No **Enable sounds** click is needed. The **Play** buttons preview sounds through the same native player.

macOS uses the built-in `/usr/bin/afplay`. Linux tries `pw-play` (PipeWire), `paplay` (PulseAudio), and `aplay` (ALSA), remembering the last successful player. Linux needs at least one of these commands installed and available to VS Code, plus a working desktop audio session. If playback fails, check **Output → Codex Task Notifier** for the attempted players and errors.

---

## Notification preview

![Codex Task Notifier showing the Done completion alert in VS Code](https://grgwtsn.com/images/Done.png)

## Command Palette

Open the Command Palette in VS Code and search for **Codex Task Notifier**:

| Command | What it does |
| --- | --- |
| **Open Status Board** | Opens the live Ready, Working, or Done status board. |
| **Refresh Status Board** | Re-renders the open board with its current state and settings. |
| **Show Setup Instructions** | Opens the complete Codex setup prompt so you can copy it again. |
| **Test Notification** | Simulates a task starting and finishing, including the completion alert, without writing a status file. |
