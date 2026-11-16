(() => {
  const navItems = [...document.querySelectorAll('.reply-nav-item')];
  const views = [...document.querySelectorAll('.dashboard-view')];
  const title = document.getElementById('breadcrumb-current');
  const labels = { overview: '工作概览', comments: '评论收件箱', rules: '回复规则', history: '处理记录' };
  function showView(name) {
    if (!labels[name]) return;
    views.forEach(view => view.classList.toggle('active', view.dataset.panel === name));
    navItems.forEach(item => item.classList.toggle('active', item.dataset.view === name));
    title.textContent = labels[name];
    document.querySelector('.reply-sidebar').classList.remove('open');
    history.replaceState({}, '', `${location.pathname}#${name}`);
  }
  navItems.forEach(item => item.addEventListener('click', () => showView(item.dataset.view)));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.querySelector('.reply-sidebar').classList.toggle('open');
  });
  showView(location.hash.slice(1) || 'overview');
})();
