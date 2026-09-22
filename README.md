# Codex Task Notifier

A desktop VS Code board with automatic Codex log detection, Ready, Thinking, Working, and
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

Version 0.3.14 shows Thinking on input and Working after 10 seconds or a detected
editing call. Explicit final responses show Done; turns finishing in under 10
seconds and interrupted sessions return quietly to Ready. Detection uses private
Codex logs and matching local session transcripts. Early edit detection can be
disabled. No task content is transmitted.
See [asset notices](vscode-extension/THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE).
