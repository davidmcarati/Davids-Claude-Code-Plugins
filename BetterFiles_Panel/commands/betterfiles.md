---
description: Launch the BetterFiles Panel — an interactive git-colored file tree for a folder
argument-hint: "[folder path (defaults to the current project)]"
allowed-tools: Bash, mcp__Claude_Browser__preview_start, mcp__Claude_Browser__navigate
---

Launch the BetterFiles Panel web app for the user.

Target folder: `$ARGUMENTS`
- If `$ARGUMENTS` is empty, use the current project directory (`$CLAUDE_PROJECT_DIR`, falling back to the working directory).

Steps:

1. Start the server **in the background** (it is long-running) with:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/server/server.js" "<target folder>"
   ```

   If a target folder was given in `$ARGUMENTS`, pass it as the argument; otherwise omit it so the server uses its own default.

2. Read the background process output and grab the `http://127.0.0.1:<port>/`
   line it prints. The port defaults to 4517 but the server falls through to the
   next free port if that one is taken, so always read the actual URL from the
   output rather than assuming 4517.

3. Open that URL in the Browser pane with `preview_start` (pass the URL), so the
   panel appears next to the conversation.

4. Tell the user the panel is live, show the URL, and briefly note:
   - Click folders to expand/collapse — the open/closed state is remembered
     between runs.
   - Files and folders are colored by git status (modified, added, untracked,
     deleted, renamed, conflict, ignored). Folders are tinted when they contain
     changes.
   - It auto-refreshes every couple of seconds; the "live" toggle in the header
     turns that off.

Do not block waiting on the server process — it stays running until stopped.
