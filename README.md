# Davids Claude Code Plugins

A collection of plugins for [Claude Code](https://code.claude.com).

## Plugins

### BetterFiles Panel

A file-tree panel for a folder that colors every file and directory by its git
status and remembers which directories you left expanded. It runs as a tiny
local web app (no dependencies beyond Node and git) that opens in a browser next
to your Claude Code session.

See [BetterFiles_Panel](BetterFiles_Panel) for details.

## Install

Add this repo as a plugin marketplace, then install what you want:

```
/plugin marketplace add davidmcarati/Davids-Claude-Code-Plugins
/plugin install betterfiles-panel@davids-claude-code-plugins
```

Or try a plugin without installing:

```
claude --plugin-dir ./BetterFiles_Panel
```

## Requirements

- Node.js 18 or newer
- git on your PATH

## License

MIT
