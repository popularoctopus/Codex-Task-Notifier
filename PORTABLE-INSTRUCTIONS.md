<!-- BEGIN CODEX STATUS BOARD -->
## Codex Task Notifier

For every substantive task, use `.codex-task-status.json` in the current project's
workspace root. The installed Codex Task Notifier extension reads this file directly
and opens or selects its board when work starts in the focused VS Code window.

1. Before substantive work, write JSON with `state` set to `working` and `updatedAt`
   set to a new unique timestamp or task-update identifier.
2. Complete the requested task and relevant validation.
3. Only when all work is complete, immediately before the final response, write the
   same file with `state` set to `done` and a new unique `updatedAt` value.
   Never mark blocked, interrupted, or unfinished work Done.

Use ordinary file tools. No PowerShell scripts, Python server, browser launch, or
machine-specific paths are needed. Use the command `Codex Task Notifier: Open Status Board`
if needed. Only the primary agent updates the file. It is last-writer-wins for
simultaneous tasks in the same workspace root; different workspace roots are independent.
Keep task content and personal data out of this file. Do not commit it. If an update
fails, report the failure briefly and continue authorized work. These instructions
do not override sandbox permissions or approval requirements.
<!-- END CODEX STATUS BOARD -->
