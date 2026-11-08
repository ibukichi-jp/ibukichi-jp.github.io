/**
 * ブログの記事（日次 CI が Atom フィードから .data/blog.json に保存した直近記事）
 */
const BLOG_DISPLAY_COUNT = 3;

function createBlogPostCard(post) {
  const url = safeHttpUrl(post.url);
  if (!post.title || !url) return null;

  const col = el('div', 'col');
  const card = el('article', 'blog-post-card');
  col.appendChild(card);

  const thumb = safeHttpUrl(post.thumbnail);
  if (thumb) {
    const thumbLink = externalLink(url, 'blog-thumb-link');
    thumbLink.setAttribute('aria-hidden', 'true');
    thumbLink.tabIndex = -1;
    const img = el('img', 'blog-thumb');
    img.src = thumb;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => thumbLink.remove());
    thumbLink.appendChild(img);
    card.appendChild(thumbLink);
  }

  const body = el('div', 'blog-post-body');
  const published = post.published || post.updated;
  if (published) {
    const time = el('time', 'blog-post-date', formatJSTDate(published));
    time.dateTime = published;
    body.appendChild(time);
  }
  const title = el('h3', 'blog-post-title');
  title.appendChild(externalLink(url, 'blog-title-link', post.title));
  body.appendChild(title);
  if (post.excerpt) {
    body.appendChild(el('p', 'blog-post-excerpt', post.excerpt));
  }
  card.appendChild(body);
  return col;
}

async function initBlog() {
  const listEl = document.getElementById('blogPostList');
  if (!listEl) return;

  try {
    const data = await fetchJson('./.data/blog.json', { cache: 'no-cache' });
    const cards = (Array.isArray(data.posts) ? data.posts : [])
      .slice(0, BLOG_DISPLAY_COUNT)
      .map(createBlogPostCard)
      .filter(Boolean);
    if (cards.length === 0) throw new Error('記事データがありません');
    listEl.replaceChildren(...cards);
  } catch (err) {
    console.warn('ブログ記事データの取得に失敗しました:', err);
    const col = el('div', 'col-12');
    const card = el('div', 'blog-post-card');
    const box = el('div', 'blog-post-body text-center w-100 py-3');
    box.appendChild(el('div', 'empty-icon', '📝'));
    box.appendChild(el('div', 'small text-secondary', '記事を読み込めませんでした'));
    card.appendChild(box);
    col.appendChild(card);
    listEl.replaceChildren(col);
  }
}
