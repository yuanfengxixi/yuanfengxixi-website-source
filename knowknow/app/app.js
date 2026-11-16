const $ = (id) => document.getElementById(id);
const ui = {
  gate: $('auth-gate'), authMessage: $('auth-message'), login: $('login-button'),
  session: $('session-button'), connection: $('connection-state'),
  tree: $('folder-tree'), search: $('note-search'), count: $('note-count'),
  empty: $('note-empty'), view: $('note-view'), editor: $('note-editor'),
  title: $('note-title'), content: $('note-content'), folder: $('note-folder'),
  attachments: $('note-attachments'), editTitle: $('edit-title'), editContent: $('edit-content'),
  editFolder: $('edit-folder'), saveStatus: $('save-status'),
  messages: $('chat-messages'), input: $('chat-input'), send: $('send-message'), hint: $('chat-hint'),
  newConversation: $('new-conversation'), profileButton: $('profile-button'),
  profileOverlay: $('profile-overlay'), profileClose: $('close-profile'),
  profileMemoryList: $('profile-memory-list'), memoryCount: $('memory-count'), membershipCard: $('membership-card'),
};
const state = { authenticated: false, csrfToken: '', folders: [], notes: [], current: null,
  currentFolder: '/', collapsed: new Set(), folderPaths: [], mode: 'think', tasks: [], expandedTasks: new Set(),
  newConversationArmed: false, pollTimer: null,
  searchTimer: null, searchVersion: 0 };

async function api(action, data = {}) {
  const response = await fetch('/api/web-app', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}) },
    body: JSON.stringify({ action, ...data }) });
  let result;
  try { result = await response.json(); } catch (_) { throw Object.assign(new Error('网页服务尚未开通'), { code: 'SERVICE_UNAVAILABLE' }); }
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.message || '请求失败，请稍后重试'),
    { code: result.code || 'REQUEST_FAILED' });
  return result;
}
function text(tag, value, className) {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  return node;
}
function showGate(message, loginEnabled = false) {
  state.authenticated = false; state.csrfToken = '';
  ui.profileOverlay.hidden = true;
  ui.gate.hidden = false; ui.authMessage.textContent = message || '请先使用微信账户登录。';
  ui.login.disabled = !loginEnabled;
  ui.session.textContent = '微信登录'; ui.connection.textContent = '尚未连接'; ui.connection.classList.remove('connected');
  ui.input.disabled = true; ui.send.disabled = true; ui.search.disabled = true;
  ui.newConversation.disabled = true; ui.profileButton.disabled = true;
  $('new-note').disabled = true; $('new-folder').disabled = true;
}
function showWorkspace() {
  state.authenticated = true; ui.gate.hidden = true;
  ui.session.textContent = '退出登录'; ui.connection.textContent = '已连接微信账户';
  ui.connection.classList.add('connected'); ui.input.disabled = false; ui.send.disabled = false;
  ui.search.disabled = false; ui.newConversation.disabled = false; ui.profileButton.disabled = false;
  $('new-note').disabled = false; $('new-folder').disabled = false;
}
function setNewConversationArmed(armed) {
  state.newConversationArmed = !!armed;
  ui.newConversation.classList.toggle('active', state.newConversationArmed);
  ui.newConversation.setAttribute('aria-pressed', String(state.newConversationArmed));
  ui.newConversation.title = state.newConversationArmed ? '下一条消息将开启新对话' : '下一条消息开启新对话';
}
async function login() {
  ui.login.disabled = true; ui.authMessage.textContent = '正在打开微信登录…';
  try {
    const result = await api('login');
    const url = new URL(result.url);
    if (url.protocol !== 'https:' || url.hostname !== 'open.weixin.qq.com') throw new Error('登录地址无效');
    window.location.assign(url.href);
  } catch (error) {
    ui.authMessage.textContent = error.message;
    ui.login.disabled = error.code === 'SERVICE_UNAVAILABLE' || error.code === 'LOGIN_NOT_CONFIGURED';
  }
}
async function logout() {
  try { await api('logout'); }
  catch (error) {
    if (error.code !== 'UNAUTHORIZED') { ui.connection.textContent = '退出失败，请检查网络后重试'; return; }
  }
  state.folders = []; state.notes = []; state.tasks = []; state.current = null;
  state.expandedTasks.clear(); setNewConversationArmed(false); ui.profileOverlay.hidden = true;
  clearTimeout(state.pollTimer); state.pollTimer = null;
  ui.tree.replaceChildren(text('p', '登录后显示笔记目录', 'tree-empty'));
  ui.messages.replaceChildren(text('div', '说点什么，知知会结合你的笔记处理。', 'chat-intro'));
  showEmpty(); showGate('已退出登录。', true);
}
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function renderProfile(profile) {
  const cards = Array.isArray(profile.memoryCards) ? profile.memoryCards : [];
  const limit = Number(profile.maxMemoryCards) || 50;
  ui.memoryCount.textContent = `${cards.length} / ${limit}`;
  ui.profileMemoryList.replaceChildren();
  if (!cards.length) ui.profileMemoryList.append(text('p', '还没有长期记忆。', 'profile-empty'));
  else cards.forEach((card) => ui.profileMemoryList.append(text('p', card.content || '', 'profile-memory-card')));

  const member = profile.membership || {};
  const active = member.active === true;
  const expired = member.renewalRequired === true;
  const plan = active ? member.title || '知知月卡' : '知知月卡';
  const stateLabel = active ? (member.exhausted ? '本期积分已用完' : '有效') : expired ? '已到期' : '未开通';
  ui.membershipCard.replaceChildren();
  const header = document.createElement('div'); header.className = 'membership-card-header';
  header.append(text('span', '知', 'membership-mark'));
  const name = document.createElement('div'); name.className = 'membership-name-wrap';
  name.append(text('strong', plan, 'membership-name'), text('span', stateLabel, `membership-badge${active ? ' active' : ''}`));
  header.append(name); ui.membershipCard.append(header);
  const amount = Number(member.amountFen) > 0 ? (Number(member.amountFen) / 100).toFixed(1) : '19.9';
  const points = Number(member.pointsPerPeriod) || 10000;
  if (active) {
    const limitCredits = Number(member.creditLimit) || points;
    const remaining = Math.max(0, Number(member.remainingCredits) || 0);
    const used = Math.max(0, Number(member.usedCredits) || 0);
    const quota = document.createElement('div'); quota.className = 'membership-quota';
    const label = document.createElement('div'); label.className = 'membership-quota-label';
    label.append(text('span', '本期剩余积分'), text('strong', `${remaining.toLocaleString('zh-CN')} / ${limitCredits.toLocaleString('zh-CN')}`));
    const track = document.createElement('div'); track.className = 'membership-progress';
    const fill = document.createElement('span'); fill.style.width = `${Math.min(100, Math.round(used / Math.max(limitCredits, 1) * 100))}%`;
    track.append(fill); quota.append(label, track); ui.membershipCard.append(quota);
    if (member.endAt) ui.membershipCard.append(text('p', `有效期至 ${formatDate(member.endAt)}`, 'membership-detail'));
  } else if (expired) {
    ui.membershipCard.append(text('p', '会员已到期，续费请在知知小程序中办理。', 'membership-detail'));
    if (member.endAt) ui.membershipCard.append(text('p', `上期有效期至 ${formatDate(member.endAt)}`, 'membership-detail'));
  } else {
    ui.membershipCard.append(text('p', `免费记录剩余 ${Math.max(0, Number(member.trialRemaining) || 0)} 次`, 'membership-detail'));
  }
  const price = text('p', `¥${amount}/月 · 每期 ${points.toLocaleString('zh-CN')} 积分`, 'membership-footnote');
  ui.membershipCard.append(price);
}
async function openProfile() {
  if (!state.authenticated) return;
  ui.profileOverlay.hidden = false;
  ui.memoryCount.textContent = '读取中…';
  ui.profileMemoryList.replaceChildren(text('p', '正在读取…', 'profile-loading'));
  ui.membershipCard.replaceChildren(text('p', '正在读取…', 'profile-loading'));
  try {
    const result = await api('profile');
    renderProfile(result.profile || result);
  } catch (error) {
    ui.memoryCount.textContent = '';
    ui.profileMemoryList.replaceChildren(text('p', error.message || '暂时无法加载', 'profile-error'));
    ui.membershipCard.replaceChildren(text('p', '会员信息暂时无法加载', 'profile-error'));
  }
}
function closeProfile() {
  ui.profileOverlay.hidden = true;
  ui.profileButton.focus();
}
function sortPaths(paths) {
  const rank = new Map(state.folders.map((folder) => [folder.path, folder.sortOrder]));
  return [...paths].sort((a, b) => {
    const ar = rank.get(a), br = rank.get(b);
    if (typeof ar === 'number' && typeof br === 'number' && ar !== br) return ar - br;
    return a.localeCompare(b, 'zh');
  });
}
function renderTree(results = null) {
  const notes = results || state.notes;
  ui.tree.replaceChildren(); ui.count.textContent = String(state.notes.length);
  if (results) {
    $('expand-all').hidden = true;
    if (!notes.length) { ui.tree.append(text('p', '没有找到相关笔记', 'tree-empty')); return; }
    notes.forEach((note) => {
      const row = text('button', note.title || '无标题', 'tree-row note'); row.type = 'button';
      row.title = note.folder || '/'; row.addEventListener('click', () => openNote(note.id));
      if (state.current?.id === note.id) row.classList.add('active'); ui.tree.append(row);
    }); return;
  }
  $('expand-all').hidden = false;
  const paths = new Set(state.folders.map((folder) => folder.path));
  notes.forEach((note) => {
    const parts = (note.folder || '/').split('/').filter(Boolean); let current = '';
    parts.forEach((part) => { current += '/' + part; paths.add(current); });
  });
  state.folderPaths = [...paths].filter((path) => path !== '/');
  state.collapsed = new Set([...state.collapsed].filter((path) => state.folderPaths.includes(path)));
  const allExpanded = state.folderPaths.length > 0 && state.folderPaths.every((path) => !state.collapsed.has(path));
  $('expand-all').dataset.expanded = String(allExpanded);
  $('expand-all-label').textContent = allExpanded ? '全部收起' : '全部展开';
  $('expand-all').setAttribute('aria-label', allExpanded ? '全部收起' : '全部展开');
  $('expand-all-icon').src = `/assets/icons/${allExpanded ? 'collapse-all' : 'expand-all'}.svg`;
  if (!notes.length && !state.folders.length) { ui.tree.append(text('p', '还没有笔记', 'tree-empty')); return; }
  const children = new Map();
  for (const path of paths) {
    if (path === '/') continue;
    const parent = path.slice(0, path.lastIndexOf('/')) || '/';
    if (!children.has(parent)) children.set(parent, []); children.get(parent).push(path);
  }
  const addNotes = (folder, depth) => notes.filter((note) => (note.folder || '/') === folder)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh')).forEach((note) => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'tree-row note';
      row.style.paddingLeft = `${12 + depth * 16}px`;
      const icon = document.createElement('img'); icon.src = '/assets/icons/note.svg'; icon.alt = ''; icon.className = 'icon';
      row.append(icon, text('span', note.title || '无标题', 'label'));
      if (state.current?.id === note.id) row.classList.add('active');
      row.addEventListener('click', () => openNote(note.id)); ui.tree.append(row);
    });
  const walk = (parent, depth) => {
    sortPaths(children.get(parent) || []).forEach((path) => {
      const open = !state.collapsed.has(path);
      const row = document.createElement('button'); row.type = 'button'; row.className = 'tree-row folder';
      row.style.paddingLeft = `${8 + depth * 16}px`; row.setAttribute('aria-expanded', String(open));
      const chevron = document.createElement('img'); chevron.src = '/assets/icons/chevron-right.svg'; chevron.alt = '';
      chevron.className = `chevron${open ? ' open' : ''}`;
      const icon = document.createElement('img'); icon.src = '/assets/icons/folder.svg'; icon.alt = ''; icon.className = 'icon';
      const count = notes.filter((note) => note.folder === path || note.folder?.startsWith(path + '/')).length;
      row.append(chevron, icon, text('span', path.split('/').pop(), 'label'));
      if (count) row.append(text('span', String(count), 'count'));
      if (state.currentFolder === path) row.classList.add('active');
      row.addEventListener('click', () => {
        state.currentFolder = path;
        open ? state.collapsed.add(path) : state.collapsed.delete(path);
        renderTree();
      });
      ui.tree.append(row); if (open) { walk(path, depth + 1); addNotes(path, depth + 1); }
    });
  };
  walk('/', 0); addNotes('/', 0);
}
function toggleAllFolders() {
  const allExpanded = $('expand-all').dataset.expanded === 'true';
  if (allExpanded) state.collapsed = new Set(state.folderPaths);
  else state.collapsed.clear();
  renderTree();
}
async function loadList() {
  const result = await api('list'); state.folders = result.folders || []; state.notes = result.notes || [];
  if (ui.search.value.trim()) await search(); else renderTree();
}
async function search() {
  const query = ui.search.value.trim(); const version = ++state.searchVersion;
  if (!query) { renderTree(); return; }
  try {
    const result = await api('search', { query });
    if (version === state.searchVersion) renderTree((result.notes || []).map((note) => ({
      id: note.id || note._id, title: note.title || '', folder: note.folder || '/' }))) ;
  } catch (error) {
    if (version === state.searchVersion) ui.tree.replaceChildren(text('p', error.message, 'tree-empty'));
  }
}
function showEmpty() { ui.empty.hidden = false; ui.view.hidden = true; ui.editor.hidden = true; }
function renderBlocks(target, raw) {
  target.replaceChildren();
  const blocks = window.zhizhiMarkdown?.parseBlocks(String(raw || '')) || [];
  if (!blocks.length) { target.append(text('p', raw || '这篇笔记还没有正文。', 'md-para')); return; }
  blocks.forEach((block) => {
    const row = document.createElement(block.type === 'heading' ? 'h3' : 'p');
    row.className = block.type === 'heading' ? 'md-heading' : block.type === 'bullet' ? 'md-bullet' : 'md-para';
    if (block.type === 'bullet') row.append(text('span', block.ordinal || '•', 'md-marker'));
    (block.segments || []).forEach((segment) => row.append(text(segment.b ? 'strong' : 'span', segment.t)));
    target.append(row);
  });
}
async function openNote(noteId) {
  try {
    const { note } = await api('read', { noteId }); state.current = note;
    ui.empty.hidden = true; ui.editor.hidden = true; ui.view.hidden = false;
    ui.title.textContent = note.title || '无标题';
    state.currentFolder = note.folder || '/';
    ui.folder.textContent = note.folder === '/' ? '根目录' : note.folder || '/';
    renderBlocks(ui.content, note.content || '');
    ui.attachments.hidden = !((note.images || []).length || (note.files || []).length);
    renderTree();
  } catch (error) { ui.connection.textContent = error.message; }
}
function folderOptions(selected) {
  const paths = new Set(['/']); state.folders.forEach((folder) => paths.add(folder.path));
  state.notes.forEach((note) => paths.add(note.folder || '/'));
  ui.editFolder.replaceChildren();
  sortPaths(paths).forEach((path) => { const option = new Option(path === '/' ? '根目录' : path, path); ui.editFolder.add(option); });
  ui.editFolder.value = selected || '/';
}
function beginEdit(creating = false) {
  state.creating = creating; ui.empty.hidden = true; ui.view.hidden = true; ui.editor.hidden = false;
  ui.editTitle.value = creating ? '' : state.current.title || '';
  ui.editContent.value = creating ? '' : state.current.content || '';
  folderOptions(creating ? state.currentFolder : state.current.folder); ui.saveStatus.textContent = ''; ui.editTitle.focus();
}
async function saveNote(event) {
  event.preventDefault(); const title = ui.editTitle.value.trim(), content = ui.editContent.value;
  if (!title) { ui.saveStatus.textContent = '请填写标题'; return; }
  const payload = { title, content, folder: ui.editFolder.value };
  if (!state.creating) Object.assign(payload, { noteId: state.current.id, expectedUpdatedAt: state.current.updatedAt });
  $('save-note').disabled = true; ui.saveStatus.textContent = '正在保存…';
  try {
    const result = await api(state.creating ? 'create' : 'save', payload);
    state.current = result.note; await loadList(); await openNote(result.note.id);
    ui.connection.textContent = result.vectorReady === false ? '笔记已保存，AI 索引稍后更新' : '已保存';
  } catch (error) {
    ui.saveStatus.textContent = error.code === 'EDIT_CONFLICT' ? '另一端已修改这篇笔记；请先复制当前内容再刷新' : error.message;
  } finally { $('save-note').disabled = false; }
}
async function createFolder() {
  const name = window.prompt('新目录名称'); if (!name?.trim()) return;
  try { await api('createFolder', { name: name.trim(), parentPath: state.currentFolder }); await loadList(); }
  catch (error) { ui.connection.textContent = error.message; }
}
function taskText(task) {
  const result = task.result || {};
  if (task.status === 'done') return task.agentMode === 'record'
    ? (result.reply || '已整理到笔记') : (result.answer || result.reply || '已完成处理');
  if (task.status === 'failed') return task.error?.message || '这次处理没有完成';
  if (task.status === 'waiting_confirmation') return '这项操作需要在小程序里确认';
  if (result.partial && typeof result.answer === 'string') return result.answer;
  return '正在处理…';
}
function taskIsPending(task) {
  return !['done', 'not_found', 'failed', 'cancelled', 'waiting_confirmation'].includes(task.status);
}
function renderTaskTrace(task, target) {
  const steps = Array.isArray(task.steps) ? task.steps : [];
  if (!steps.some((step) => step.type !== 'model')) return;
  const pendingStep = [...steps].reverse().find((step) => step.status === 'running');
  const expanded = state.expandedTasks.has(task.requestId);
  const summary = document.createElement('button'); summary.type = 'button';
  summary.className = 'task-trace-summary'; summary.setAttribute('aria-expanded', String(expanded));
  summary.append(text('span', taskIsPending(task) ? (pendingStep?.label || '正在处理…') : '查看处理过程'));
  summary.append(text('span', expanded ? '⌃' : '⌄', 'task-trace-chevron'));
  summary.addEventListener('click', () => {
    if (expanded) state.expandedTasks.delete(task.requestId);
    else state.expandedTasks.add(task.requestId);
    renderMessages();
  });
  target.append(summary);
  if (!expanded) return;
  const list = document.createElement('div'); list.className = 'task-trace-list';
  steps.forEach((step) => {
    const row = document.createElement('div'); row.className = 'task-trace-item';
    const statusLabels = { running: '进行中', interrupted: '中断', failed: '失败' };
    if (statusLabels[step.status]) row.append(text('span', statusLabels[step.status], `trace-state ${step.status}`));
    row.append(text('span', step.label || '处理步骤', 'trace-label'));
    list.append(row);
  });
  target.append(list);
}
function renderMessages() {
  const follow = ui.messages.scrollHeight - ui.messages.scrollTop - ui.messages.clientHeight < 40;
  ui.messages.replaceChildren();
  if (!state.tasks.length) { ui.messages.append(text('div', '说点什么，知知会结合你的笔记处理。', 'chat-intro')); return; }
  state.tasks.forEach((task) => {
    const time = new Date(task.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const user = text('div', '', 'message user'); user.append(text('span', time, 'time'), text('div', task.rawText || '[附件]', 'bubble'));
    const ai = text('div', '', `message ai${task.agentMode === 'record' ? ' record' : ''}`);
    const avatar = document.createElement('img'); avatar.src = '/assets/zhizhi-char.png'; avatar.alt = '知知'; avatar.className = 'avatar';
    ai.append(avatar);
    const steps = Array.isArray(task.steps) ? task.steps : [];
    if (steps.some((step) => step.type !== 'model')) {
      const trace = text('div', '', 'task-trace'); renderTaskTrace(task, trace); ai.append(trace);
    }
    const pending = taskIsPending(task), partial = task.result?.partial && typeof task.result.answer === 'string';
    const bubble = text('div', '', `bubble${pending && !partial ? ' processing' : ''}`);
    if (pending && !partial) {
      bubble.append(text('span', '正在处理'));
      const dots = text('span', '', 'processing-dots');
      for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
      bubble.append(dots);
    } else renderBlocks(bubble, taskText(task));
    ai.append(bubble);
    const notes = task.result?.notes || task.result?.affectedNotes || [];
    if (Array.isArray(notes)) notes.slice(0, 8).forEach((note) => {
      if (!note?._id && !note?.id) return;
      const link = text('button', note.title || '查看笔记', 'note-link'); link.type = 'button';
      link.addEventListener('click', () => openNote(note._id || note.id)); ai.append(link);
    });
    if (task.status === 'waiting_confirmation' && task.confirmation?.token) {
      const actions = document.createElement('div'); actions.className = 'task-actions';
      const confirm = text('button', '确认执行', 'confirm-task'); confirm.type = 'button';
      confirm.addEventListener('click', () => actOnTask(task, 'confirm'));
      const cancel = text('button', '取消', 'cancel-task'); cancel.type = 'button';
      cancel.addEventListener('click', () => actOnTask(task, 'cancel'));
      actions.append(confirm, cancel); ai.append(actions);
    }
    if (task.status === 'failed' && task.error?.retryable) {
      const retry = text('button', '重试', 'retry-task'); retry.type = 'button';
      retry.addEventListener('click', () => actOnTask(task, 'retry')); ai.append(retry);
    }
    ui.messages.append(user, ai);
  });
  if (follow) ui.messages.scrollTop = ui.messages.scrollHeight;
}
async function actOnTask(task, action) {
  if (action === 'confirm' && !window.confirm('确认执行知知提出的操作？')) return;
  try {
    await api(action, { requestId: task.requestId, confirmationToken: task.confirmation?.token });
    await loadTasks();
    scheduleTaskPolling();
  } catch (error) { ui.connection.textContent = error.message; }
}
async function loadTasks() {
  const result = await api('tasks'); state.tasks = result.tasks || []; renderMessages();
}
function scheduleTaskPolling() {
  clearTimeout(state.pollTimer); state.pollTimer = null;
  if (state.authenticated && state.tasks.some(taskIsPending)) {
    state.pollTimer = setTimeout(pollTasks, 800);
  }
}
async function pollTasks() {
  state.pollTimer = null;
  if (!state.authenticated || !state.tasks.some(taskIsPending)) return;
  const previous = new Map(state.tasks.map((task) => [task.requestId, task.status]));
  const pending = state.tasks.filter(taskIsPending);
  const updates = await Promise.all(pending.map(async (task) => {
    try { return (await api('task', { requestId: task.requestId })).task; }
    catch (_) { return null; }
  }));
  const byId = new Map(updates.filter(Boolean).map((task) => [task.requestId, task]));
  state.tasks = state.tasks.map((task) => byId.get(task.requestId) || task);
  renderMessages();
  try {
    const completed = state.tasks.some((task) => task.status === 'done' && taskIsPending({ status: previous.get(task.requestId) }));
    if (completed) {
      await loadList();
      if (state.current && ui.editor.hidden) await openNote(state.current.id);
    }
  } catch (_) { ui.connection.textContent = '连接中断，稍后重试'; }
  scheduleTaskPolling();
}
async function sendMessage(event) {
  event.preventDefault(); const rawText = ui.input.value.trim(); if (!rawText || !state.authenticated) return;
  const requestId = crypto.randomUUID().replaceAll('-', ''); ui.send.disabled = true;
  try {
    const result = await api('submit', { requestId, rawText, inputType: 'text', agentMode: state.mode,
      contextNoteId: state.current?.id || null, newConversation: state.newConversationArmed });
    ui.input.value = ''; setNewConversationArmed(false); state.tasks.push(result.task); renderMessages();
    scheduleTaskPolling();
  } catch (error) { ui.connection.textContent = error.message; }
  finally { ui.send.disabled = false; }
}
async function boot() {
  const loginOutcome = new URLSearchParams(window.location.search).get('login');
  if (loginOutcome) window.history.replaceState({}, '', '/knowknow/app/');
  try {
    const result = await api('session');
    if (!result.authenticated) {
      const message = loginOutcome === 'unlinked'
        ? '还没有找到这个微信在知知小程序里的账户。请先打开知知小程序一次，再返回网页重试。'
        : loginOutcome === 'failed' ? '微信登录未完成，请重试。'
          : loginOutcome === 'unavailable' ? '微信身份关联服务暂不可用，请稍后重试。'
            : result.message || '请用微信账户登录后使用网页版。';
      showGate(message, !!result.loginEnabled); return;
    }
    state.csrfToken = result.csrfToken || ''; showWorkspace();
    await Promise.all([loadList(), loadTasks()]);
    scheduleTaskPolling();
  } catch (error) { showGate(error.message, false); }
}
ui.login.addEventListener('click', login);
ui.session.addEventListener('click', () => state.authenticated ? logout() : login());
ui.profileButton.addEventListener('click', openProfile);
ui.profileClose.addEventListener('click', closeProfile);
ui.profileOverlay.addEventListener('click', (event) => { if (event.target === ui.profileOverlay) closeProfile(); });
ui.newConversation.addEventListener('click', () => setNewConversationArmed(!state.newConversationArmed));
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !ui.profileOverlay.hidden) closeProfile(); });
ui.search.addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(search, 300); });
$('new-note').addEventListener('click', () => beginEdit(true));
$('new-folder').addEventListener('click', createFolder);
$('expand-all').addEventListener('click', toggleAllFolders);
$('edit-note').addEventListener('click', () => beginEdit(false));
$('cancel-edit').addEventListener('click', () => state.current ? openNote(state.current.id) : showEmpty());
ui.editor.addEventListener('submit', saveNote);
$('chat-form').addEventListener('submit', sendMessage);
ui.input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('chat-form').requestSubmit(); } });
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
  state.mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach((item) => {
    const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected));
  });
  ui.hint.textContent = state.mode === 'record' ? 'AI 整理后写入笔记' : '回复由 AI 生成，重要信息请核对';
}));
boot();
