# BetterFiles Panel

A file-tree panel for a folder that colors entries by git status and remembers
which directories you left open.

Claude Code's CLI can't draw its own side panel, so this runs as a small local
web app you open in a browser (or the Browser pane) next to your session. No npm
install — just Node and git.

## Run it

From Claude Code:

```
/betterfiles                 current project
/betterfiles E:/some/folder  a specific folder
```

Or directly:

```
node server/server.js "E:/path/to/folder" --port 4517
```

Then open the `http://127.0.0.1:<port>/` it prints.

## Colors

- green — added / untracked
- amber — modified
- red (struck through) — deleted
- blue — renamed or copied
- purple — merge conflict
- dim italic — ignored

A directory takes the most significant status among its contents, so you can see
where changes are without expanding everything. Deleted files are drawn back in
even though they're off disk.

## State

Which folders are expanded is written to a small JSON file, keyed by the folder
you're viewing, so each folder keeps its own layout between runs. Location:
`$BETTERFILES_STATE_DIR`, else `$CLAUDE_PLUGIN_DATA`, else `~/.betterfiles-panel/`.

## Layout

```
BetterFiles_Panel/
├── .claude-plugin/plugin.json
├── commands/betterfiles.md
├── server/
│   ├── server.js
│   └── public/            index.html, styles.css, app.js
└── README.md
```
