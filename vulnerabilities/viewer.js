/**
 * 脆弱性レポートの閲覧ページ
 * - 引数なし: レポートの一覧（index.json）
 * - ?report=YYYY/YYYY-MM-DD: そのレポート（index.json に載っているものだけ）を表示
 */
(function () {
  const content = document.getElementById('content');
  const MARKS = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪', unknown: '❔' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function showMessage(message) {
    content.replaceChildren(el('p', 'muted mb-0', message));
  }

  function countsText(counts) {
    return Object.entries(counts || {})
      .map(([sev, n]) => `${MARKS[sev] || ''} ${n}`)
      .join('  ');
  }

  function renderList(reports) {
    if (reports.length === 0) {
      showMessage('まだレポートはありません。新しい脆弱性が見つかった日にレポートが作成されます。');
      return;
    }
    const list = el('ul', 'report-list');
    reports.forEach(r => {
      const a = el('a');
      a.href = `?report=${encodeURIComponent(r.path.replace(/\.md$/, ''))}`;
      a.append(
        el('span', 'report-date', r.date.replaceAll('-', '/')),
        el('span', 'report-meta', `新規 ${r.count}件  ${countsText(r.counts)}`),
        el('span', 'report-meta', (r.techs || []).join(', ')),
      );
      const li = el('li', 'report-item');
      li.appendChild(a);
      list.appendChild(li);
    });
    content.replaceChildren(list);
    document.title = '脆弱性レポート | ibukichi Dashboard';
  }

  // 文中の URL を自動でリンクにしない（公式情報の <URL> 形式のリンクは別の仕組みなので残る）
  marked.use({ tokenizer: { url() { return undefined; } } });

  async function renderReport(entry) {
    const res = await fetch(entry.path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markdown = await res.text();

    // Markdown → HTML → 無害化（公式情報の文章を含むため必ずサニタイズする）
    // レポートに画像やフォームは不要なので、外部への接続につながるタグごと禁止する
    const safeHtml = DOMPurify.sanitize(marked.parse(markdown, { gfm: true }), {
      FORBID_TAGS: ['img', 'picture', 'video', 'audio', 'source', 'svg', 'math', 'iframe', 'form', 'input', 'button', 'style'],
      FORBID_ATTR: ['style'],
    });
    const body = el('article', 'md');
    body.innerHTML = safeHtml;

    body.querySelectorAll('a[href]').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    body.querySelectorAll('table').forEach(table => {
      const wrap = el('div', 'table-scroll');
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    content.replaceChildren(body);
    document.title = `脆弱性レポート ${entry.date.replaceAll('-', '/')} | ibukichi Dashboard`;
  }

  async function init() {
    let reports;
    try {
      const res = await fetch('index.json', { cache: 'no-cache' });
      reports = res.ok ? ((await res.json()).reports || []) : [];
    } catch (e) {
      reports = [];
    }

    const requested = new URLSearchParams(location.search).get('report');
    if (!requested) {
      renderList(reports);
      return;
    }
    // index.json に載っているレポートだけを表示する（任意のパスは読み込まない）
    const entry = reports.find(r => r.path === `${requested}.md`);
    if (!entry) {
      showMessage('指定されたレポートが見つかりません。公開直後の場合は、少し待ってから再読み込みしてください。');
      return;
    }
    try {
      await renderReport(entry);
    } catch (e) {
      showMessage('レポートを読み込めませんでした。');
    }
  }

  init();
})();
