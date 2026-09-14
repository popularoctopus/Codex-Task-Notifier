# Codex Task Notifier

A desktop VS Code board with automatic Codex log detection, Ready, Working, and
Done states, selectable sounds, fonts, and light/dark modes. No setup prompt,
standing instructions, status files, or separate server.

## Develop and package

With Node.js 18 or later:

```sh
cd vscode-extension
npm test
npm run package
```

Install the VSIX using **Extensions: Install from VSIX**, reload VS Code, and
start a new Codex turn. See [the extension README](vscode-extension/README.md)
for settings, migration, and limitations.

Version 0.3.2 is a local testing build. Quick turns remain quiet until a 10-second
activity threshold or a detected editing call. Early edit detection reads matching
local transcripts and can be disabled. Detection uses private Codex logs and an
optional chat heuristic. No fixed task-duration limit or global completion
cooldown is imposed. No task content is transmitted.
See [asset notices](vscode-extension/THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE).
