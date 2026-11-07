/**
 * Bluesky の投稿表示（公開 API・認証不要）
 * 自分の投稿の直近 BLUESKY_DISPLAY_COUNT 件を表示する（返信・リポストは除外、引用は表示）
 */
const BLUESKY_HANDLE = 'bsky.ibukichi.jp';
const BLUESKY_DISPLAY_COUNT = 3; // 最新を含む直近3件を表示
// リポストを除外しても表示件数が足りるよう、取得は多めにする
const BLUESKY_FETCH_LIMIT = 30;
const BLUESKY_FEED_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed'
  + `?actor=${encodeURIComponent(BLUESKY_HANDLE)}&limit=${BLUESKY_FETCH_LIMIT}&filter=posts_no_replies`;

/**
 * 自分の投稿だけを残す（リポスト等の reason 付きアイテムと他人の投稿を除外）
 * 引用リポストは自分の投稿なので残る
 */
function isOwnBlueskyPost(item) {
  if (!item || !item.post || item.reason) return false;
  const author = item.post.author || {};
  return author.handle === BLUESKY_HANDLE;
}

/** at://did/app.bsky.feed.post/rkey → bsky.app の投稿URL */
function bskyPostUrl(post) {
  const rkey = (post.uri || '').split('/').pop();
  const actor = post.author?.handle || post.author?.did || BLUESKY_HANDLE;
  return `https://bsky.app/profile/${encodeURIComponent(actor)}/post/${encodeURIComponent(rkey)}`;
}

/**
 * 投稿本文を facets（リンク・メンション・ハッシュタグ）付きで描画
 * facets の index は UTF-8 のバイトオフセットなのでバイト列で切り出す
 */
function renderRichText(container, text, facets) {
  if (!text) return;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);
  const sorted = (facets || [])
    .filter(f => f.index && f.index.byteStart < f.index.byteEnd)
    .sort((a, b) => a.index.byteStart - b.index.byteStart);

  let cursor = 0;
  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index;
    if (byteStart < cursor || byteEnd > bytes.length) continue;
    if (byteStart > cursor) {
      container.appendChild(document.createTextNode(decoder.decode(bytes.slice(cursor, byteStart))));
    }
    const segment = decoder.decode(bytes.slice(byteStart, byteEnd));
    const feature = (facet.features || [])[0] || {};
    let href = null;
    if (feature.$type === 'app.bsky.richtext.facet#link') {
      href = safeHttpUrl(feature.uri);
    } else if (feature.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
      href = `https://bsky.app/profile/${encodeURIComponent(feature.did)}`;
    } else if (feature.$type === 'app.bsky.richtext.facet#tag' && feature.tag) {
      href = `https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`;
    }
    container.appendChild(href ? externalLink(href, 'bsky-inline-link', segment) : document.createTextNode(segment));
    cursor = byteEnd;
  }
  if (cursor < bytes.length) {
    container.appendChild(document.createTextNode(decoder.decode(bytes.slice(cursor))));
  }
}

/** 埋め込み（画像・動画サムネイル・リンクカード・引用）を描画 */
function renderBlueskyEmbed(embed, postUrl) {
  if (!embed) return null;
  const type = embed.$type || '';

  if (type.startsWith('app.bsky.embed.recordWithMedia')) {
    const wrap = el('div', 'bsky-embed-stack');
    const media = renderBlueskyEmbed(embed.media, postUrl);
    const quote = renderBlueskyEmbed(embed.record, postUrl);
    if (media) wrap.appendChild(media);
    if (quote) wrap.appendChild(quote);
    return wrap;
  }

  if (type.startsWith('app.bsky.embed.images')) {
    const images = (embed.images || []).slice(0, 4);
    if (images.length === 0) return null;
    const grid = el('div', `bsky-embed-images count-${images.length}`);
    images.forEach(img => {
      const src = safeHttpUrl(img.thumb);
      if (!src) return;
      const a = externalLink(safeHttpUrl(img.fullsize) || src, 'bsky-image-link');
      const im = el('img', 'bsky-image');
      im.src = src;
      im.alt = img.alt || '';
      im.loading = 'lazy';
      a.appendChild(im);
      grid.appendChild(a);
    });
    return grid;
  }

  if (type.startsWith('app.bsky.embed.video')) {
    const thumb = safeHttpUrl(embed.thumbnail);
    if (!thumb) return null;
    const a = externalLink(postUrl, 'bsky-video-thumb');
    a.title = 'Bluesky で動画を再生';
    const im = el('img', 'bsky-image');
    im.src = thumb;
    im.alt = embed.alt || '動画';
    im.loading = 'lazy';
    a.appendChild(im);
    a.appendChild(el('span', 'bsky-video-play', '▶'));
    return a;
  }

  if (type.startsWith('app.bsky.embed.external')) {
    const ext = embed.external || {};
    const href = safeHttpUrl(ext.uri);
    if (!href) return null;
    const card = externalLink(href, 'bsky-external-card');
    const thumb = safeHttpUrl(ext.thumb);
    if (thumb) {
      const im = el('img', 'bsky-external-thumb');
      im.src = thumb;
      im.alt = '';
      im.loading = 'lazy';
      card.appendChild(im);
    }
    const body = el('div', 'bsky-external-body');
    body.appendChild(el('div', 'bsky-external-domain', new URL(href).hostname));
    if (ext.title) body.appendChild(el('div', 'bsky-external-title', ext.title));
    if (ext.description) body.appendChild(el('div', 'bsky-external-desc', ext.description));
    card.appendChild(body);
    return card;
  }

  if (type.startsWith('app.bsky.embed.record')) {
    const rec = embed.record || {};
    if (!rec.author || !rec.value) return null;
    const quote = externalLink(bskyPostUrl(rec), 'bsky-quote-card');
    const head = el('div', 'bsky-quote-head');
    head.appendChild(el('span', 'bsky-quote-name', rec.author.displayName || rec.author.handle));
    head.appendChild(el('span', 'bsky-quote-handle', `@${rec.author.handle}`));
    quote.appendChild(head);
    quote.appendChild(el('div', 'bsky-quote-text', rec.value.text || ''));
    return quote;
  }

  return null;
}

/** 1投稿分のカードを生成 */
function createBlueskyPostCard(item) {
  const post = item.post;
  const record = post.record || {};
  const author = post.author || {};
  const postUrl = bskyPostUrl(post);

  const col = el('div', 'col');
  const card = el('article', 'bsky-post-card');
  col.appendChild(card);

  // ヘッダー（アバター・名前・時刻）
  const header = el('div', 'bsky-post-header');
  const avatarSrc = safeHttpUrl(author.avatar);
  if (avatarSrc) {
    const av = el('img', 'bsky-avatar');
    av.src = avatarSrc;
    av.alt = '';
    av.width = 36;
    av.height = 36;
    av.loading = 'lazy';
    header.appendChild(av);
  } else {
    header.appendChild(el('div', 'bsky-avatar bsky-avatar-fallback', '🦋'));
  }
  const who = el('div', 'bsky-author');
  who.appendChild(el('div', 'bsky-display-name', author.displayName || author.handle || ''));
  // ハンドル（@...）をプロフィールへのリンクにする
  const handleLink = externalLink(
    `https://bsky.app/profile/${encodeURIComponent(author.handle || author.did || BLUESKY_HANDLE)}`,
    'bsky-handle',
    `@${author.handle || ''}`
  );
  handleLink.title = 'Bluesky のプロフィールを開く';
  who.appendChild(handleLink);
  header.appendChild(who);
  const createdAt = record.createdAt || post.indexedAt;
  const time = el('time', 'bsky-post-time', formatRelativeTime(createdAt));
  time.dateTime = createdAt || '';
  time.title = formatJSTDateTime(createdAt);
  header.appendChild(time);
  card.appendChild(header);

  // 本文
  if (record.text) {
    const body = el('p', 'bsky-post-text');
    renderRichText(body, record.text, record.facets);
    card.appendChild(body);
  }

  // 埋め込み
  const embedEl = renderBlueskyEmbed(post.embed, postUrl);
  if (embedEl) card.appendChild(embedEl);

  return col;
}

function renderBlueskyMessage(listEl, icon, message) {
  listEl.replaceChildren();
  const col = el('div', 'col-12');
  const box = el('div', 'bsky-post-card bsky-empty-state');
  box.appendChild(el('div', 'empty-icon', icon));
  box.appendChild(el('div', 'small text-secondary', message));
  col.appendChild(box);
  listEl.appendChild(col);
}

async function initBluesky() {
  const listEl = document.getElementById('blueskyFeedList');
  if (!listEl) return;

  try {
    const data = await fetchJson(BLUESKY_FEED_URL);
    const feed = (data.feed || []).filter(isOwnBlueskyPost).slice(0, BLUESKY_DISPLAY_COUNT);

    if (feed.length === 0) {
      renderBlueskyMessage(listEl, '🦋', 'まだ投稿がありません');
      return;
    }

    listEl.replaceChildren(...feed.map(createBlueskyPostCard));
  } catch (err) {
    console.warn('Bluesky の投稿取得に失敗しました:', err);
    renderBlueskyMessage(listEl, '⚠️', '投稿を読み込めませんでした');
  }
}
