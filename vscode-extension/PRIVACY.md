# Privacy statement

Last updated: September 15, 2026

## Local log processing

Codex Task Notifier reads and processes local Codex log data solely to detect task
activity and provide status indicators and visual or audio notifications. When
file-edit detection is enabled, it also reads matching local Codex session
transcripts to recognize supported editing-tool calls for notification timing.
Transcript content is not executed.

All processing of this log and transcript data takes place on your computer.
The extension does not transmit this data to the developer, Mixkit, OpenAI, or
any other party. It does not use this data for any purpose other than its
notification functionality, including the associated task-status display.
It does not use the data for analytics, advertising, profiling, or model training.

The extension keeps task-detection state in memory and does not create a separate
archive of your transcripts. It writes operational status and error messages to
its local VS Code Output channel to help troubleshoot notifications; error
messages may include local file paths. These messages are not transmitted by
the extension. Existing Codex logs and transcripts remain managed by Codex.

## Stored preferences

Preferences such as the selected sound, font, and appearance are stored locally
in VS Code's extension storage so your choices persist between sessions.
Notification settings are stored through VS Code's configuration system.
The extension does not transmit these preferences or settings, and uses them
only to customize your user experience and notification behavior. They are not
used for analytics, advertising, profiling, or any unrelated purpose.

## Your controls and other services

You can turn off transcript-based file-edit detection using
`codexTaskNotifier.detectFileEdits` and reload the VS Code window. You can disable
or uninstall the extension to stop its log processing.

This statement describes Codex Task Notifier's own behavior. VS Code, Codex,
and any external websites you choose to open have their own privacy practices.
For example, VS Code may synchronize configuration settings if you enable its
Settings Sync feature. The extension does not enable that feature or register
its stored appearance and sound preferences for synchronization.
