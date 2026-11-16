(() => {
  const form = document.querySelector('#audit-form');
  const input = document.querySelector('#site-url');
  const status = document.querySelector('#audit-status');
  const results = document.querySelector('#audit-results');
  const summary = document.querySelector('#audit-summary');
  const checks = document.querySelector('#audit-checks');
  const submitButton = form.querySelector('button[type="submit"]');
  let isSubmitting = false;
  const labels = {
    home_status: 'Homepage availability', title: 'Page title', description: 'Meta description',
    h1: 'Main heading (H1)', canonical: 'Canonical URL', robots: 'robots.txt',
    sitemap: 'Sitemap', sample_pages: 'Same-site page sample',
  };
  const statuses = { passed: 'Passed', warning: 'Needs review', critical: 'Issue found' };
  const errors = {
    invalid_url: 'Enter a valid public website URL using HTTP or HTTPS.',
    method_not_allowed: 'The audit service accepts website checks only.',
    rate_limited: 'Too many checks have been requested. Please try again later.',
    body_too_large: 'The request is too large.', busy: 'The audit service is busy. Please try again later.',
    limit_unavailable: 'The audit service is temporarily unavailable. Please try again later.',
    audit_failed: 'The website could not be checked. Please try again later.',
  };

  function detailFor(check) {
    const detail = String(check.detail || '');
    if (check.id === 'home_status') {
      const code = detail.match(/HTTP\s+(\d+)/i)?.[1];
      return code ? `The homepage returned HTTP ${code}.` : 'The homepage response was checked.';
    }
    if (check.id === 'title') {
      const title = detail.match(/[“"]([^”"]+)[”"]/u)?.[1];
      return title ? `Title found: “${title}”.` : check.status === 'passed' ? 'A page title was found.' : 'No page title was detected.';
    }
    if (check.id === 'description') {
      const length = detail.match(/(\d+)\s*个字符/u)?.[1];
      return length ? `Meta description found (${length} characters).` : check.status === 'passed' ? 'A meta description was found.' : 'No non-empty meta description was detected.';
    }
    if (check.id === 'h1') {
      const count = detail.match(/检测到\s*(\d+)\s*个\s*h1/i)?.[1];
      return count ? `${count} H1 heading${count === '1' ? '' : 's'} detected.` : 'The main heading could not be confirmed.';
    }
    if (check.id === 'canonical') {
      const url = detail.match(/检测到规范链接：\s*(.+)$/u)?.[1];
      return url ? `Canonical URL found: ${url}` : 'No canonical URL was detected.';
    }
    if (check.id === 'robots' || check.id === 'sitemap') {
      const code = detail.match(/HTTP\s+(\d+)/i)?.[1];
      if (check.status === 'passed') return `Resource returned HTTP ${code || '2xx'} and passed a basic format check.`;
      return `The ${check.id === 'robots' ? 'robots.txt file' : 'sitemap'} could not be confirmed. Check that it is publicly available and uses a valid format.`;
    }
    if (check.id === 'sample_pages') {
      const counts = detail.match(/抽查\s*(\d+)\s*个同站页面，成功读取\s*(\d+)\s*个；其中\s*(\d+)\s*个/u);
      if (counts) return `Sampled ${counts[1]} same-site page${counts[1] === '1' ? '' : 's'}; read ${counts[2]}, with ${counts[3]} access, title, or description issue${counts[3] === '1' ? '' : 's'}.`;
      return check.status === 'passed' ? 'A small sample of same-site public pages was checked.' : 'Additional same-site pages could not be confirmed in this check.';
    }
    return check.status === 'passed' ? 'This check passed.' : 'This check needs review.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    if (submitButton) { submitButton.disabled = true; submitButton.setAttribute('aria-busy', 'true'); }
    results.hidden = true;
    status.className = 'audit-status is-loading';
    status.textContent = 'Checking the website basics…';
    const url = input.value.trim();
    try {
      const response = await fetch('/api/seo/audit', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = errors[data?.error?.code] || 'The check could not be completed. Please try again later.';
        throw new Error(`${message} (HTTP ${response.status})`);
      }
      if (!Array.isArray(data.checks) || !data.summary) throw new Error('The audit service returned an unexpected response. Please try again later.');
      status.className = 'audit-status is-success';
      status.textContent = `Basic checks completed for ${data.url || url}. Results reflect the website when it was checked.`;
      summary.textContent = `${Number(data.summary.passed) || 0} passed · ${Number(data.summary.warning) || 0} need review · ${Number(data.summary.critical) || 0} issues found`;
      checks.replaceChildren(...data.checks.map((check) => {
        const item = document.createElement('li');
        const badge = document.createElement('span');
        badge.className = `audit-badge status-${statuses[check.status] ? check.status : 'error'}`;
        badge.textContent = statuses[check.status] || 'Could not verify';
        const content = document.createElement('div');
        const title = document.createElement('b'); title.textContent = labels[check.id] || 'Check item';
        const detail = document.createElement('p'); detail.textContent = detailFor(check);
        content.append(title, detail); item.append(badge, content); return item;
      }));
      results.hidden = false;
    } catch (error) {
      status.className = 'audit-status is-error';
      status.textContent = error instanceof TypeError
        ? 'The audit service cannot be reached right now. No report was generated. Please try again later or contact us.'
        : (error.message || 'The check could not be completed. Please try again later.');
    } finally {
      isSubmitting = false;
      if (submitButton) { submitButton.disabled = false; submitButton.removeAttribute('aria-busy'); }
    }
  });
})();
