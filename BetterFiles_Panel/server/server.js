#!/usr/bin/env node
'use strict';

// Local file-tree server for a chosen folder. Lazy directory listing, git
// status per entry, and expand/collapse state saved to disk.
//   node server.js [rootDir] [--port N]

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

function parseArgs(argv) {
  const out = { root: null, port: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') out.port = parseInt(argv[++i], 10);
    else if (a.startsWith('--port=')) out.port = parseInt(a.slice(7), 10);
    else rest.push(a);
  }
  if (rest.length) out.root = rest[0];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(args.root || process.env.CLAUDE_PROJECT_DIR || process.cwd());
const START_PORT = args.port || parseInt(process.env.BETTERFILES_PORT, 10) || 4517;

if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
  console.error(`Not a directory: ${ROOT}`);
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, 'public');

// --- expand/collapse state ---

const STATE_DIR =
  process.env.BETTERFILES_STATE_DIR ||
  process.env.CLAUDE_PLUGIN_DATA ||
  path.join(os.homedir(), '.betterfiles-panel');

const STATE_FILE = path.join(
  STATE_DIR,
  `state-${crypto.createHash('sha1').update(ROOT).digest('hex').slice(0, 16)}.json`
);

function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { expanded: new Set(Array.isArray(data.expanded) ? data.expanded : []) };
  } catch {
    return { expanded: new Set() };
  }
}

const state = loadState();

async function saveState() {
  try {
    await fsp.mkdir(STATE_DIR, { recursive: true });
    await fsp.writeFile(
      STATE_FILE,
      JSON.stringify({ root: ROOT, expanded: [...state.expanded] }, null, 2)
    );
  } catch (err) {
    console.error('Could not save state:', err.message);
  }
}

// --- git ---

function run(cmd, cmdArgs, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, cmdArgs, { cwd, maxBuffer: 32 << 20 }, (err, out) =>
      resolve(err ? null : out)
    );
  });
}

// Absolute path -> stable key (forward slashes, no trailing slash).
function keyOf(p) {
  let k = path.resolve(p).replace(/\\/g, '/');
  if (k.length > 1 && k.endsWith('/')) k = k.slice(0, -1);
  return k;
}

// Path relative to ROOT. Unlike keyOf this never touches cwd, so "src" stays
// "src" instead of resolving against process.cwd().
function normRel(rel) {
  let p = String(rel).replace(/\\/g, '/').trim();
  while (p.startsWith('./')) p = p.slice(2);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function classify(xy) {
  const [x, y] = xy;
  if (x === '?' && y === '?') return 'untracked';
  if (x === '!' && y === '!') return 'ignored';
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return 'conflict';
  if (x === 'R' || y === 'R' || x === 'C' || y === 'C') return 'renamed';
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  return 'modified';
}

// How a folder picks its color when its children disagree.
const RANK = { conflict: 6, deleted: 5, modified: 4, renamed: 3, added: 2, untracked: 1, ignored: 0 };

const GIT_TTL_MS = 1500;
let gitCache = { time: 0 };

function emptyGit(time) {
  return { time, repoRoot: null, fileStatus: new Map(), dirStatus: new Map(), branch: null, ghostsByDir: new Map() };
}

async function computeGit() {
  const now = Date.now();
  if (now - gitCache.time < GIT_TTL_MS && gitCache.repoRoot !== undefined) return gitCache;

  const top = await run('git', ['rev-parse', '--show-toplevel'], ROOT);
  if (!top) return (gitCache = emptyGit(now));
  const repoRoot = keyOf(top.trim());

  const branchOut = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], ROOT);
  const branch = branchOut ? branchOut.trim() : null;

  const fileStatus = new Map();
  const dirStatus = new Map();
  const ghostsByDir = new Map();

  const porcelain = await run(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    ROOT
  );

  if (porcelain) {
    const parts = porcelain.split('\0');
    for (let i = 0; i < parts.length; i++) {
      const rec = parts[i];
      if (!rec) continue;
      const xy = rec.slice(0, 2);
      const file = rec.slice(3);
      const status = classify(xy);
      // -z renames span two fields (new path, then old); skip the old one.
      if ('RC'.includes(xy[0]) || 'RC'.includes(xy[1])) i++;

      const abs = keyOf(path.join(repoRoot, file));
      fileStatus.set(abs, status);

      // Deleted files are gone from disk, so remember them per-parent to draw
      // back in later (struck through).
      if (!fs.existsSync(abs)) {
        const parent = keyOf(path.dirname(abs));
        (ghostsByDir.get(parent) || ghostsByDir.set(parent, []).get(parent)).push({
          name: path.basename(abs),
          status,
        });
      }

      let dir = abs;
      for (;;) {
        const parent = keyOf(path.dirname(dir));
        if (parent === dir) break;
        const cur = dirStatus.get(parent);
        if (!cur || RANK[status] > RANK[cur]) dirStatus.set(parent, status);
        if (parent === repoRoot) break;
        dir = parent;
      }
    }
  }

  return (gitCache = { time: now, repoRoot, fileStatus, dirStatus, branch, ghostsByDir });
}

// --- tree ---

async function listDir(absDir, git) {
  let entries;
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes = [];
  for (const ent of entries) {
    if (ent.name === '.git') continue;
    let isDir = ent.isDirectory();
    if (ent.isSymbolicLink()) {
      try {
        isDir = (await fsp.stat(path.join(absDir, ent.name))).isDirectory();
      } catch {
        isDir = false;
      }
    }
    const abs = keyOf(path.join(absDir, ent.name));
    const rel = normRel(path.relative(ROOT, abs)) || ent.name;
    nodes.push({
      name: ent.name,
      path: rel,
      type: isDir ? 'dir' : 'file',
      status: isDir ? git.dirStatus.get(abs) || null : git.fileStatus.get(abs) || null,
      expanded: isDir ? state.expanded.has(rel) : false,
    });
  }

  const ghosts = git.ghostsByDir.get(keyOf(absDir)) || [];
  if (ghosts.length) {
    const have = new Set(nodes.map((n) => n.name));
    for (const g of ghosts) {
      if (have.has(g.name)) continue;
      const abs = keyOf(path.join(absDir, g.name));
      nodes.push({
        name: g.name,
        path: normRel(path.relative(ROOT, abs)) || g.name,
        type: 'file',
        status: g.status,
        expanded: false,
        missing: true,
      });
    }
  }

  nodes.sort((a, b) =>
    a.type !== b.type
      ? a.type === 'dir' ? -1 : 1
      : a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
  return nodes;
}

async function buildNode(rel, git) {
  const abs = rel ? keyOf(path.join(ROOT, rel)) : keyOf(ROOT);
  const node = {
    name: rel ? path.basename(rel) : path.basename(ROOT),
    path: rel,
    type: 'dir',
    status: git.dirStatus.get(abs) || null,
    expanded: true,
    children: [],
  };
  for (const child of await listDir(abs, git)) {
    node.children.push(
      child.type === 'dir' && child.expanded ? await buildNode(child.path, git) : child
    );
  }
  return node;
}

async function buildTree() {
  const git = await computeGit();
  return {
    root: keyOf(ROOT),
    rootName: path.basename(ROOT),
    branch: git.branch,
    isRepo: !!git.repoRoot,
    tree: await buildNode('', git),
  };
}

// --- http ---

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function serveStatic(res, urlPath) {
  const file = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  if (!path.resolve(file).startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/api/tree') return sendJson(res, 200, await buildTree());

    // Stream a file so a drag-out can deliver real bytes. Confined to ROOT.
    if (pathname === '/api/file') {
      const abs = path.resolve(ROOT, normRel(url.searchParams.get('path') || ''));
      if (!abs.startsWith(path.resolve(ROOT))) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      try {
        const st = await fsp.stat(abs);
        if (!st.isFile()) {
          res.writeHead(404);
          return res.end('Not a file');
        }
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${path.basename(abs).replace(/"/g, '')}"`,
          'Content-Length': st.size,
        });
        return fs.createReadStream(abs).pipe(res);
      } catch {
        res.writeHead(404);
        return res.end('Not found');
      }
    }

    if (pathname === '/api/toggle' && req.method === 'POST') {
      const rel = normRel((await readBody(req)).path || '');
      if (!rel) return sendJson(res, 400, { error: 'path required' });
      if (state.expanded.has(rel)) state.expanded.delete(rel);
      else state.expanded.add(rel);
      await saveState();
      return sendJson(res, 200, { ok: true, expanded: state.expanded.has(rel) });
    }

    if (pathname === '/api/set' && req.method === 'POST') {
      const body = await readBody(req);
      const rel = normRel(body.path || '');
      if (!rel) return sendJson(res, 400, { error: 'path required' });
      if (body.expanded) state.expanded.add(rel);
      else state.expanded.delete(rel);
      await saveState();
      return sendJson(res, 200, { ok: true });
    }

    return serveStatic(res, pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

function listen(port, tries) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries > 0) listen(port + 1, tries - 1);
    else {
      console.error('Server error:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Serving ${ROOT}`);
    console.log(`  http://127.0.0.1:${port}/`);
  });
}

listen(START_PORT, 20);
