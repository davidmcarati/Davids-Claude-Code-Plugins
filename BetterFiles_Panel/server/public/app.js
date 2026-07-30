'use strict';

const INDENT = 14;
const REFRESH_MS = 2500;

let ROOT_ABS = '';

const el = {
  tree: document.getElementById('tree'),
  rootName: document.getElementById('root-name'),
  branch: document.getElementById('branch'),
  path: document.getElementById('path'),
  refresh: document.getElementById('refresh'),
  autorefresh: document.getElementById('autorefresh'),
};

const FOLDER_OPEN = '📂';
const FOLDER_CLOSED = '📁';

const ICONS = {
  js: '🟨', mjs: '🟨', cjs: '🟨', jsx: '🟨', ts: '🟦', tsx: '🟦',
  json: '🔧', md: '📝', html: '🌐', css: '🎨',
  py: '🐍', rs: '🦀', go: '🐹', java: '☕', rb: '💎',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
  sh: '📜', yml: '⚙️', yaml: '⚙️',
};

function fileIcon(name) {
  return ICONS[name.slice(name.lastIndexOf('.') + 1).toLowerCase()] || '📄';
}

const BADGE = {
  modified: 'M', added: 'A', untracked: 'U',
  deleted: 'D', renamed: 'R', conflict: '!', ignored: '·',
};

function render(data) {
  el.rootName.textContent = data.rootName || 'BetterFiles';
  document.title = `${data.rootName} — BetterFiles`;
  el.path.textContent = data.root;
  ROOT_ABS = data.root || '';

  if (data.isRepo && data.branch) {
    el.branch.hidden = false;
    el.branch.textContent = data.branch;
  } else {
    el.branch.hidden = true;
  }

  const scroll = el.tree.scrollTop;
  el.tree.innerHTML = '';

  if (!data.tree?.children?.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Empty folder';
    el.tree.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const child of data.tree.children) renderNode(child, 1, frag);
  el.tree.appendChild(frag);
  el.tree.scrollTop = scroll;
}

function renderNode(node, depth, parent) {
  const isDir = node.type === 'dir';
  const open = isDir && node.expanded;

  const row = document.createElement('div');
  row.className = 'row ' + node.type;
  if (node.status) row.classList.add('s-' + node.status, 'has-status');
  row.style.paddingLeft = 12 + depth * INDENT + 'px';
  row.dataset.depth = depth;

  const twisty = document.createElement('span');
  twisty.className = 'twisty' + (isDir ? (open ? ' open' : '') : ' leaf');
  twisty.textContent = isDir ? '▶' : '';
  row.appendChild(twisty);

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = isDir ? (open ? FOLDER_OPEN : FOLDER_CLOSED) : fileIcon(node.name);
  row.appendChild(icon);

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = node.name;
  row.appendChild(name);

  if (node.status) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = BADGE[node.status] || '';
    row.appendChild(badge);
  }

  if (isDir || !node.missing) {
    row.draggable = true;
    row.title = isDir
      ? 'Click to open/close · drag into chat'
      : 'Click to copy path · drag into chat';
    const activate = isDir
      ? () => toggle(node.path, row)
      : () => copyPath(absOf(node.path), row);

    // The browser tells us which gesture it was: a real drag fires dragstart, a
    // plain click doesn't. So it's a click only if no drag started and the
    // pointer didn't move.
    let sx = 0, sy = 0, dragged = false;
    row.addEventListener('pointerdown', (e) => {
      if (e.button === 0) { sx = e.clientX; sy = e.clientY; dragged = false; }
    });
    row.addEventListener('dragstart', (e) => {
      dragged = true;
      dragItem(e, node, isDir, row);
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || dragged) return;
      if (Math.abs(e.clientX - sx) > 6 || Math.abs(e.clientY - sy) > 6) return;
      activate();
    });
  }

  parent.appendChild(row);

  if (isDir && open && node.children) {
    for (const child of node.children) renderNode(child, depth + 1, parent);
  }
}

function absOf(rel) {
  return ROOT_ABS ? ROOT_ABS.replace(/\/$/, '') + '/' + rel : rel;
}

function dragItem(e, node, isDir, row) {
  row.classList.add('dragging');
  const abs = absOf(node.path);
  const dt = e.dataTransfer;
  dt.effectAllowed = 'copyLink';
  dt.setData('text/plain', abs);
  dt.setData('text/uri-list', 'file:///' + encodeURI(abs));
  // a file can also drop as a real download; a dir can't
  if (!isDir) {
    const dl = location.origin + '/api/file?path=' + encodeURIComponent(node.path);
    dt.setData('DownloadURL', `application/octet-stream:${node.name}:${dl}`);
  }
}

function copyPath(text, row) {
  if (row) {
    row.classList.add('copied');
    setTimeout(() => row.classList.remove('copied'), 500);
  }
  // sync copy first: keeps the click's user gesture, which some embedded
  // browsers demand for clipboard access
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
    ta.remove();
  } catch {}
  if (ok) return showToast('Copied: ' + text);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast('Copied: ' + text),
      () => showToast('Path (copy blocked): ' + text)
    );
  } else {
    showToast('Path (copy blocked): ' + text);
  }
}

let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

let lastRaw = '';
let pointerDown = false;

async function loadTree() {
  try {
    const raw = await (await fetch('/api/tree')).text();
    if (raw === lastRaw) return; // unchanged
    // don't rebuild mid-click; it drops the row under the cursor. next poll gets it
    if (pointerDown) return;
    lastRaw = raw;
    render(JSON.parse(raw));
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('pointerdown', () => { pointerDown = true; });
document.addEventListener('pointerup', () => { pointerDown = false; });

const persistToggle = (relPath) =>
  fetch('/api/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relPath }),
  }).catch((err) => console.error(err));

// collapse in the DOM: drop the descendant rows, flip the arrow
function collapseRow(row) {
  const depth = +row.dataset.depth;
  row.querySelector('.twisty')?.classList.remove('open');
  const icon = row.querySelector('.icon');
  if (icon) icon.textContent = FOLDER_CLOSED;
  let n = row.nextElementSibling;
  while (n && +n.dataset.depth > depth) {
    const next = n.nextElementSibling;
    n.remove();
    n = next;
  }
}

async function toggle(relPath, row) {
  // collapse is instant client-side; expand needs children from the server
  if (row && row.querySelector('.twisty.open')) {
    collapseRow(row);
    await persistToggle(relPath);
    lastRaw = ''; // let the next poll reconcile
    return;
  }
  const spin = row ? setTimeout(() => row.classList.add('loading'), 120) : null;
  await persistToggle(relPath);
  if (spin) clearTimeout(spin);
  await loadTree();
}

let timer = null;
const startTimer = () => {
  clearInterval(timer);
  timer = setInterval(loadTree, REFRESH_MS);
};
const stopTimer = () => clearInterval(timer);

el.refresh.addEventListener('click', loadTree);
el.autorefresh.addEventListener('change', () =>
  el.autorefresh.checked ? startTimer() : stopTimer()
);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTimer();
  else if (el.autorefresh.checked) { loadTree(); startTimer(); }
});

loadTree();
startTimer();
