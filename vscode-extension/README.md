# Codex Task Notifier

A self-contained VS Code desktop extension for Windows, macOS, and Linux. Displays
Ready, Working..., and Done with a completion flash, selectable WAV sounds, seven
font choices, and light/dark modes. All six sounds are included in the VSIX.
No Python, PowerShell, local server, administrator rights, or separate Node.js
installation is required to run the extension. Node.js is needed only for development.

## Install and connect Codex

1. In VS Code, run **Extensions: Install from VSIX** and select the package.
2. Reload VS Code if upgrading an installed version.
3. Open a project folder and run **Codex Task Notifier: Show Setup Instructions**.
4. Add the displayed block to that project's root AGENTS.md, replacing old notifier
   script instructions. Review any global notifier instructions too. Start a new
   Codex session so it reads the updated instructions.
5. Run **Codex Task Notifier: Test Notification** to check the board and sound.

Setup never silently edits AGENTS.md or global Codex configuration. The extension
reads `.codex-task-status.json` in each workspace root. Codex writes this file using
its ordinary file tools. Add it to `.gitignore` if desired. The format is:

```json
{"state":"working","updatedAt":"unique-task-update-1"}
```

On completion write `state: "done"` with a new unique `updatedAt` string. Only
`working` and `done` are accepted. Missing/invalid files leave the prior state intact;
errors appear in the Codex Task Notifier Output channel. A stored Done does not
trigger completion on startup. One stream per workspace root is supported;
simultaneous agents in the same root are last-writer-wins. Separate roots are tracked
independently. This is instruction-based integration, not an internal Codex event hook.

## Display and sound

The hamburger menu offers Dark/Light modes; Arial, Georgia, Times New Roman,
Courier New, Impact, Pacifico, and Cloister Black; and Magic, Flute, Marimba, Scifi,
Positive, and Software. Font names preview their own font stacks. Fonts are supplied
by the operating system, with generic fallbacks when unavailable; proprietary fonts
are not bundled. Settings persist in VS Code's extension storage.

The selected sound plays in the open webview on completion. Click a sound's Play
button to test playback. VS Code supports WAV media, but audio permissions, mute,
output devices, closed tabs, and webview suspension can prevent playback. Failed
playback produces a visible warning. A VS Code completion notification is enabled
by default even when the board is closed. This is not a guaranteed OS-level alarm.

Commands: Open Status Board, Refresh Status Board, Show Setup Instructions, and
Test Notification, all under **Codex Task Notifier** in the Command Palette.
The settings menu includes a link to support the project on Ko-fi.
Settings: `codexTaskNotifier.autoOpen`, `codexTaskNotifier.notifications`, and optional
`codexTaskNotifier.legacyStatusFile` (absolute path on the extension host). The legacy
setting can read an existing status.json directly without its HTTP server; do not
also use a PowerShell sound player unless you want duplicate audio.

The desktop runtime uses VS Code file APIs and packaged webview resources. A workspace
extension host supports remote file access by design; remote SSH/WSL/container use
still requires manual testing. Browser-only vscode.dev is not supported by this
Node extension. Windows is the available validation host; macOS/Linux runtime and
audio must be smoke-tested before claiming verified support on those platforms.

## Build and distribution

From this directory with Node.js 18 or later:

```text
npm test
npm run package
```

The dependency-free packager creates `codex-task-notifier-0.2.0.vsix` from an explicit
allowlist. It contains the page, extension, state logic, six WAVs, and public docs;
no user paths, task state, PowerShell scripts, server, or developer files are bundled.
The identifier remains `local-tools.codex-status-board` to upgrade existing local
installations. The display name is Codex Task Notifier.

Before public Marketplace publication: choose a publisher ID you control (and decide
whether to keep the historical extension slug), and confirm redistribution rights
for the supplied WAV files. Code uses the repository's MIT license. See
THIRD_PARTY_NOTICES.md for the separately documented sound provenance.
Validate with Microsoft's official `@vscode/vsce` tooling and test a clean installation
on Windows, macOS, and Linux. This build is a local distribution candidate; it has
not been published or approved by the Marketplace.

Sources: [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview),
[extension publication](https://code.visualstudio.com/api/working-with-extensions/publishing-extension),
[Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md).

No telemetry, network listener, external media downloads, or credentials are used.
The extension reads only status files and its own assets; it does not read task
prompts or edit source files. It is an independent tool, not an official OpenAI product.
