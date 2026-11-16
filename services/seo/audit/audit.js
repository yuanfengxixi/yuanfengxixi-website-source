(() => {
  const form = document.querySelector('#audit-form');
  const input = document.querySelector('#site-url');
  const status = document.querySelector('#audit-status');
  const results = document.querySelector('#audit-results');
  const summary = document.querySelector('#audit-summary');
  const checks = document.querySelector('#audit-checks');
  const submitButton = form.querySelector('button[type="submit"]');
  let isSubmitting = false;
  const labels = { passed: '通过', warning: '需留意', critical: '发现问题', error: '无法确认' };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    if (submitButton) { submitButton.disabled = true; submitButton.setAttribute('aria-busy', 'true'); }
    results.hidden = true;
    status.className = 'audit-status is-loading';
    status.textContent = '正在检查网站基础信息…';
    const url = input.value.trim();
    try {
      const response = await fetch('/api/seo/audit', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `检测请求未完成（HTTP ${response.status}）。`);
      if (!Array.isArray(data.checks) || !data.summary) throw new Error('检测服务返回的数据格式无法识别，请稍后再试。');
      status.className = 'audit-status is-success';
      status.textContent = `已完成对 ${data.url || url} 的基础检查。结果反映本次访问时的页面状态。`;
      summary.textContent = `通过 ${Number(data.summary.passed) || 0} 项 · 需留意 ${Number(data.summary.warning) || 0} 项 · 发现问题 ${Number(data.summary.critical) || 0} 项`;
      checks.replaceChildren(...data.checks.map((check) => {
        const item = document.createElement('li');
        const badge = document.createElement('span');
        badge.className = `audit-badge status-${labels[check.status] ? check.status : 'error'}`;
        badge.textContent = labels[check.status] || '无法确认';
        const content = document.createElement('div');
        const title = document.createElement('b'); title.textContent = check.label || '检查项';
        const detail = document.createElement('p'); detail.textContent = check.detail || '没有可显示的说明。';
        content.append(title, detail); item.append(badge, content); return item;
      }));
      results.hidden = false;
    } catch (error) {
      status.className = 'audit-status is-error';
      status.textContent = error instanceof TypeError
        ? '检测接口当前无法连接。服务尚未接通或暂时不可用，本次没有生成检测报告，请稍后重试或联系我们。'
        : (error.message || '检测未完成，请稍后重试。');
    } finally {
      isSubmitting = false;
      if (submitButton) { submitButton.disabled = false; submitButton.removeAttribute('aria-busy'); }
    }
  });
})();
