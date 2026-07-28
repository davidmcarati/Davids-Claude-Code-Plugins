'use strict';

const INDENT = 14;
const REFRESH_MS = 2500;

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

  if (isDir) row.addEventListener('click', () => toggle(node.path));

  parent.appendChild(row);

  if (isDir && open && node.children) {
    for (const child of node.children) renderNode(child, depth + 1, parent);
  }
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
