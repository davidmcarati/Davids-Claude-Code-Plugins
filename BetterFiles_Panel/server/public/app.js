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

  if (isDir) {
    row.draggable = true;
    row.title = 'Click to open/close · drag into chat';
    row.addEventListener('click', () => toggle(node.path));
    row.addEventListener('dragstart', (e) => dragItem(e, node, true));
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
  } else if (!node.missing) {
    row.draggable = true;
    row.title = 'Click to copy path · drag into chat';
    row.addEventListener('dragstart', (e) => dragItem(e, node, false));
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('click', () => copyPath(absOf(node.path), row));
  }

  parent.appendChild(row);

  if (isDir && open && node.children) {
    for (const child of node.children) renderNode(child, depth + 1, parent);
  }
}

function absOf(rel) {
  return ROOT_ABS ? ROOT_ABS.replace(/\/$/, '') + '/' + rel : rel;
}

function dragItem(e, node, isDir) {
  e.currentTarget.classList.add('dragging');
  const abs = absOf(node.path);
  const dt = e.dataTransfer;
  dt.effectAllowed = 'copyLink';
  // Text drop targets (the chat box) get a usable path.
  dt.setData('text/plain', abs);
  dt.setData('text/uri-list', 'file:///' + encodeURI(abs));
  // Only files can hand over real bytes; a directory isn't a single download.
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
  // Synchronous first — keeps the click's user-activation, which some embedded
  // browsers require for clipboard access.
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

async function loadTree() {
  try {
    render(await (await fetch('/api/tree')).json());
  } catch (err) {
    console.error(err);
  }
}

async function toggle(relPath) {
  try {
    await fetch('/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath }),
    });
  } catch (err) {
    console.error(err);
  }
  loadTree();
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
