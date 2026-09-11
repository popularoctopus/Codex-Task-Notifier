# Paste this into Codex

Set up Codex Task Notifier once for all my workspaces using global Codex instructions.
Use AGENTS.md in the active Codex home directory (CODEX_HOME when set, otherwise
~/.codex). Create it if needed, preserve unrelated instructions, and replace old
notifier rules. If AGENTS.override.md takes precedence there, update its notifier
rules too so the global rules are effective without changing unrelated instructions.
Do not add notifier rules to workspace AGENTS.md files. Check the current workspace's
applicable instruction files for old notifier rules and remove only those blocks.

Add these global rules: Resolve the current task's workspace root from the current
environment for each task. Never hard-code the setup workspace or reuse a path from
an earlier task. If no workspace root is available, skip the status update and report
that briefly.
Before substantive work, write .codex-task-status.json in that workspace root as JSON:
{"state":"working","updatedAt":"<new unique timestamp or task identifier>"}
Only after all requested work and validation are complete, immediately before the
final response, write the same file with state "done" and a new unique updatedAt.
Never mark unfinished, blocked, or interrupted work done. Only the primary agent
updates the file, using ordinary file tools. Keep task content and personal data
out of it. If a status update fails, report it briefly and continue authorized work.
Respect existing sandbox permissions and approval requirements.

Include in the global rules: In each Git workspace, ensure .codex-task-status.json is
ignored in the workspace root .gitignore without duplicating an existing matching rule.

Validate the setup and report which global instruction files were updated. Remind me
to start a new Codex session in other workspaces so they load the global rules.
