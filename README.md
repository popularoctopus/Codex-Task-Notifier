# Codex Task Notifier

A self-contained VS Code task status board with Ready, Working..., and Done states,
six selectable notification sounds, fonts, and light/dark modes. Designed for desktop
VS Code on Windows, macOS, and Linux, with no separate Python or HTTP server. Windows
completion audio uses a hidden built-in PowerShell player and needs no board click;
macOS and Linux retain playback through the open board.

The extension source, tests, and dependency-free packager are in
[`vscode-extension/`](vscode-extension/README.md).

## Develop and package

With Node.js 18 or later:

```sh
cd vscode-extension
npm test
npm run package
```

Install the generated VSIX using **Extensions: Install from VSIX**, then copy and run
the setup prompt in [PORTABLE-INSTRUCTIONS.md](PORTABLE-INSTRUCTIONS.md) from Codex.
Run the prompt once to configure global Codex instructions for the active profile.
Start new Codex sessions in other workspaces to load them. The extension reads a small
`.codex-task-status.json` file in each workspace root.

No task content, credentials, machine-specific paths, old server scripts, or generated
VSIX files are committed. Code is covered by the repository's [MIT license](LICENSE).
See [asset notices](vscode-extension/THIRD_PARTY_NOTICES.md) for the supplied sounds.

Version 0.2.2 is a distribution candidate, not a Marketplace release. Automated tests
and package installation were checked on Windows. Real macOS/Linux runtime and sound
validation, publisher setup, and sound redistribution confirmation remain before
public Marketplace release. See the extension README for details and limitations.
