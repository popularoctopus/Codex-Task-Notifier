# Codex Task Notifier

A self-contained VS Code task status board with Ready, Working..., and Done states,
six selectable notification sounds, fonts, and light/dark modes. Designed for desktop
VS Code on Windows, macOS, and Linux, with no separate Python, PowerShell, or HTTP server.

The extension source, tests, and dependency-free packager are in
[`vscode-extension/`](vscode-extension/README.md).

## Develop and package

With Node.js 18 or later:

```sh
cd vscode-extension
npm test
npm run package
```

Install the generated VSIX using **Extensions: Install from VSIX**, then run
**Codex Task Notifier: Show Setup Instructions** to connect Codex. The extension
reads a small `.codex-task-status.json` file in each workspace root. A reusable
instruction block is in [PORTABLE-INSTRUCTIONS.md](PORTABLE-INSTRUCTIONS.md).

No task content, credentials, machine-specific paths, old server scripts, or generated
VSIX files are committed. Code is covered by the repository's [MIT license](LICENSE).
See [asset notices](vscode-extension/THIRD_PARTY_NOTICES.md) for the supplied sounds.

Version 0.2.0 is a distribution candidate, not a Marketplace release. Automated tests
and package installation were checked on Windows. Real macOS/Linux runtime and sound
validation, publisher setup, and sound redistribution confirmation remain before
public Marketplace release. See the extension README for details and limitations.
