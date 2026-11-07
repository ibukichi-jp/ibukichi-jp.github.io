/**
 * ibukichi Dashboard - Frontend Application
 */

// グローバル状態
let weightChartInstance = null;
let fatChartInstance = null;
let selectedYear = getJSTNow().year.toString();
let realTanitaData = null;

// ==========================================================================
// 日本標準時（JST / UTC+9）ユーティリティ
// ==========================================================================
/**
 * 現在の日本標準時（JST: UTC+9）の日時情報を取得
 */
function getJSTNow() {
  const now = new Date();
  const jstEpoch = now.getTime() + (9 * 60 * 60 * 1000);
  const u = new Date(jstEpoch);
  return {
    year: u.getUTCFullYear(),
    month: u.getUTCMonth(),     // 0-11
    date: u.getUTCDate(),       // 1-31
    hours: u.getUTCHours(),     // 0-23
    minutes: u.getUTCMinutes(), // 0-59
    seconds: u.getUTCSeconds(), // 0-59
    day: u.getUTCDay()          // 0-6 (0:日, 1:月, ...)
  };
}

// ==========================================================================
// 初期化
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  startDigitalClock();
  initCountdown();
  initEventListeners();
  initMobileSectionSlider();
  loadTanitaData();
  loadHaikuData();
  loadBlueskyFeed();
  loadBlogPosts();
});

// ==========================================================================
// リアルタイムデジタル時計（JST基準・秒まで更新）
// ==========================================================================
function startDigitalClock() {
  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = getJSTNow().year;
  }

  const dateEl = document.getElementById('clockDate');
  const timeEl = document.getElementById('clockTime');
  if (!dateEl || !timeEl) return;

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  function update() {
    const jst = getJSTNow();
    const y = jst.year;
    const m = String(jst.month + 1).padStart(2, '0');
    const d = String(jst.date).padStart(2, '0');
    const day = weekdays[jst.day];

    const hh = String(jst.hours).padStart(2, '0');
    const mm = String(jst.minutes).padStart(2, '0');
    const ss = String(jst.seconds).padStart(2, '0');

    dateEl.textContent = `${y}/${m}/${d} (${day})`;
    timeEl.textContent = `${hh}:${mm}:${ss}`;
  }

  update();
  setInterval(update, 1000);
}

// ==========================================================================
// イベントリスナー設定
// ==========================================================================
function initEventListeners() {
  const yearSelect = document.getElementById('yearFilterSelect');
  if (yearSelect) {
    yearSelect.addEventListener('change', (e) => {
      selectedYear = e.target.value;
      if (realTanitaData) {
        renderDashboard(realTanitaData);
      }
    });
  }
}

// ==========================================================================
// 年絞り込みプルダウンの選択肢生成
// ==========================================================================
function initYearFilterOptions(records) {
  const select = document.getElementById('yearFilterSelect');
  if (!select) return;

  const yearsMap = {};
  records.forEach(r => {
    if (!r.date) return;
    const yearMatch = r.date.match(/^(\d{4})/);
    if (yearMatch) {
      const y = yearMatch[1];
      yearsMap[y] = (yearsMap[y] || 0) + 1;
    }
  });

  const years = Object.keys(yearsMap).sort((a, b) => b.localeCompare(a));

  select.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'すべての年';
  select.appendChild(allOpt);

  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `${y}年`;
    select.appendChild(opt);
  });

  const currentYearStr = getJSTNow().year.toString();

  // 初期選択値の決定: 現在の年が存在すれば現在の年をデフォルトにする
  let targetYear = selectedYear;
  if (!targetYear || targetYear === 'all') {
    if (years.includes(currentYearStr)) {
      targetYear = currentYearStr;
    } else if (years.length > 0) {
      targetYear = years[0];
    } else {
      targetYear = 'all';
    }
  } else if (!years.includes(targetYear) && targetYear !== 'all') {
    targetYear = years.includes(currentYearStr) ? currentYearStr : (years[0] || 'all');
  }

  select.value = targetYear;
  selectedYear = targetYear;
}

// ==========================================================================
// タニタデータ読み込み
// ==========================================================================
async function loadTanitaData() {
  try {
    const res = await fetch('./.data/tanita.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    realTanitaData = data;
    initYearFilterOptions(data.records || []);
    renderDashboard(data);
  } catch (err) {
    console.warn('タニタデータの取得に失敗しました:', err);
    renderDashboard({ height_cm: 175.0, records: [] });
  }
}

// ==========================================================================
// ダッシュボード全体の描画
// ==========================================================================
function renderDashboard(data) {
  const allRecords = data.records || [];
  const heightCm = data.height_cm || 175.0;


  // 身長表示
  document.getElementById('kpiHeight').textContent = heightCm.toFixed(1);

  if (allRecords.length === 0) {
    renderEmptyState();
    return;
  }

  // 最新レコード（全レコードの末尾）
  const latestAll = allRecords[allRecords.length - 1];

  document.getElementById('latestMeasurementTime').textContent = `最新測定: ${latestAll.date}`;

  // 2. 現在の指標（Current Metrics）カードの描画
  // 目標定数
  const TARGET_BMI = 22.0;
  const heightM = heightCm / 100;
  const targetWeight = TARGET_BMI * (heightM * heightM); // 身長175cmなら67.375kg -> 67.4kg
  const TARGET_FAT = 19.9;

  // 体重（目標: 67.4kg）
  if (latestAll.weight != null) {
    document.getElementById('kpiWeight').textContent = latestAll.weight.toFixed(1);
    const diff = latestAll.weight - targetWeight;
    const diffText = diff < 0.1
      ? '達成 🎉'
      : `あと -${diff.toFixed(1)}kg`;
    document.getElementById('kpiWeightTarget').innerHTML =
      `<span class="target-badge cyan">目標: ${targetWeight.toFixed(1)}kg (${diffText})</span>`;
  }

  // 体脂肪率（目標: 19.9%）
  if (latestAll.fat != null) {
    document.getElementById('kpiFat').textContent = latestAll.fat.toFixed(1);
    const diff = latestAll.fat - TARGET_FAT;
    const diffText = diff <= 0
      ? '達成 🎉'
      : `あと -${diff.toFixed(1)}%`;
    document.getElementById('kpiFatTarget').innerHTML =
      `<span class="target-badge purple">目標: ${TARGET_FAT.toFixed(1)}% (${diffText})</span>`;
  }

  // BMI（目標: 22.0）
  if (latestAll.weight != null) {
    const bmi = latestAll.bmi != null ? latestAll.bmi : (latestAll.weight / (heightM * heightM));
    document.getElementById('kpiBmi').textContent = bmi.toFixed(1);
    const diff = bmi - TARGET_BMI;
    const diffText = Math.abs(diff) < 0.1
      ? '適正基準 🎉'
      : (diff > 0 ? `差: +${diff.toFixed(1)}` : `差: ${diff.toFixed(1)}`);
    document.getElementById('kpiBmiTarget').innerHTML =
      `<span class="target-badge indigo">目標: ${TARGET_BMI.toFixed(1)} (${diffText})</span>`;
  }

  // 3. グラフ用データのフィルタリング（選択された年）
  let displayRecords = allRecords;
  if (selectedYear !== 'all') {
    displayRecords = allRecords.filter(r => r.date && r.date.startsWith(selectedYear));
  }

  if (displayRecords.length === 0) {
    document.getElementById('weightEmptyState').classList.add('active');
    document.getElementById('fatEmptyState').classList.add('active');
    destroyCharts();
    return;
  }

  document.getElementById('weightEmptyState').classList.remove('active');
  document.getElementById('fatEmptyState').classList.remove('active');

  // 4. グラフ上部統計テキスト更新
  const yearLabel = selectedYear === 'all' ? '全期間' : `${selectedYear}年`;
  updateStatsBadge('weightStatsText', displayRecords.map(r => r.weight), 'kg', yearLabel);
  updateStatsBadge('fatStatsText', displayRecords.map(r => r.fat), '%', yearLabel);

  // 5. チャートを描画
  renderWeightChart(displayRecords);
  renderFatChart(displayRecords);
}

function updateStatsBadge(elementId, values, unit, periodLabel) {
  const valid = values.filter(v => v != null);
  const el = document.getElementById(elementId);
  if (!el || valid.length === 0) return;

  const minVal = Math.min(...valid).toFixed(1);
  const maxVal = Math.max(...valid).toFixed(1);
  const latestVal = valid[valid.length - 1].toFixed(1);
  el.textContent = `[${periodLabel}] 最新: ${latestVal}${unit} · 最小: ${minVal}${unit} · 最大: ${maxVal}${unit}`;
}


function renderEmptyState() {
  document.getElementById('kpiWeight').textContent = '--.-';
  document.getElementById('kpiFat').textContent = '--.-';
  document.getElementById('kpiBmi').textContent = '--.-';
  document.getElementById('kpiWeightTarget').innerHTML = '<span class="target-badge cyan">目標: 67.4kg</span>';
  document.getElementById('kpiFatTarget').innerHTML = '<span class="target-badge purple">目標: 19.9%</span>';
  document.getElementById('kpiBmiTarget').innerHTML = '<span class="target-badge indigo">目標: 22.0</span>';
  document.getElementById('latestMeasurementTime').textContent = '最新測定: 未測定';
  document.getElementById('weightEmptyState').classList.add('active');
  document.getElementById('fatEmptyState').classList.add('active');
  destroyCharts();
}

function destroyCharts() {
  if (weightChartInstance) {
    weightChartInstance.destroy();
    weightChartInstance = null;
  }
  if (fatChartInstance) {
    fatChartInstance.destroy();
    fatChartInstance = null;
  }
}

// ==========================================================================
// 1. 体重チャート (Weight Chart: シアン系)
// ==========================================================================
function renderWeightChart(records) {
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (weightChartInstance) {
    weightChartInstance.destroy();
  }

  const labels = records.map(r => formatChartDate(r.date, selectedYear === 'all'));
  const data = records.map(r => r.weight);

  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
  grad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  weightChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '体重 (kg)',
        data,
        borderColor: '#06b6d4',
        backgroundColor: grad,
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: records.length > 30 ? 2 : 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
      }]
    },
    options: createChartOptions('体重', 'kg', '#38bdf8', '#06b6d4', records)
  });
}

// ==========================================================================
// 2. 体脂肪率チャート (Body Fat Chart: パープル系)
// ==========================================================================
function renderFatChart(records) {
  const canvas = document.getElementById('fatChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (fatChartInstance) {
    fatChartInstance.destroy();
  }

  const labels = records.map(r => formatChartDate(r.date, selectedYear === 'all'));
  const data = records.map(r => r.fat);

  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
  grad.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

  fatChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '体脂肪率 (%)',
        data,
        borderColor: '#a855f7',
        backgroundColor: grad,
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: records.length > 30 ? 2 : 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: '#a855f7',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
      }]
    },
    options: createChartOptions('体脂肪率', '%', '#c084fc', '#a855f7', records)
  });
}

function createChartOptions(label, unit, tooltipColor, axisColor, records) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: tooltipColor,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          title: items => {
            const idx = items[0].dataIndex;
            return records[idx] ? records[idx].date : items[0].label;
          },
          label: context => `${label}: ${context.parsed.y.toFixed(1)} ${unit}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 10 },
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 8
        }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: axisColor,
          font: { family: 'Inter', size: 11, weight: 600 },
          callback: value => `${value}${unit}`
        }
      }
    }
  };
}

function formatChartDate(dateStr, includeYear = false) {
  const parts = dateStr.split(' ');
  const datePart = parts[0];
  if (includeYear && datePart.length >= 10) {
    return `${datePart.slice(2, 4)}/${datePart.slice(5).replace('-', '/')}`;
  }
  if (datePart.length >= 10) {
    return datePart.slice(5).replace('-', '/');
  }
  return datePart;
}

// ==========================================================================
// 俳句データの読み込み & SNSシェア機能（Twitter / Bluesky）
// ==========================================================================
function updateHaikuShareLinks(haikuText, badgeLabel = '最新の一句') {
  const latestEl = document.getElementById('latestHaikuText');
  const badgeEl = document.getElementById('haikuSelectedBadge');
  const twitterShareBtn = document.getElementById('haikuShareTwitter');
  const blueskyShareBtn = document.getElementById('haikuShareBluesky');

  if (latestEl) {
    // 5・7・5 のスペース区切りを改行に変換して美しく表示
    const phrases = haikuText.trim().split(/[\s　]+/);
    if (phrases.length > 1) {
      latestEl.replaceChildren();
      phrases.forEach((p, i) => {
        if (i > 0) latestEl.appendChild(document.createElement('br'));
        const span = document.createElement('span');
        span.className = 'haiku-phrase';
        span.textContent = p;
        latestEl.appendChild(span);
      });
    } else {
      latestEl.textContent = haikuText;
    }
  }
  if (badgeEl) {
    badgeEl.textContent = badgeLabel;
  }

  // シェア用本文
  const shareBaseText = `今日の一句: 「${haikuText}」\n#AI俳句 #ibukichi_jp\nhttps://ibukichi-jp.github.io/`;

  if (twitterShareBtn) {
    twitterShareBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareBaseText)}`;
  }

  if (blueskyShareBtn) {
    blueskyShareBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareBaseText)}`;
  }
}

async function loadHaikuData() {
  const latestEl = document.getElementById('latestHaikuText');
  const pastListEl = document.getElementById('pastHaikuList');

  try {
    const res = await fetch('./.data/haiku.log', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      if (latestEl) latestEl.textContent = '俳句データがまだありません。';
      if (pastListEl) pastListEl.innerHTML = '<li class="past-haiku-item">次回実行をお待ちください</li>';
      return;
    }

    const latestHaiku = lines[lines.length - 1];
    updateHaikuShareLinks(latestHaiku, '最新の一句');

    const pastHaikus = lines.slice(0, -1).reverse().slice(0, 5);
    if (pastListEl) {
      pastListEl.innerHTML = '';

      if (pastHaikus.length === 0) {
        pastListEl.innerHTML = '<li class="past-haiku-item">過去のアーカイブはまだありません</li>';
      } else {
        pastHaikus.forEach(haiku => {
          const li = document.createElement('li');
          li.className = 'past-haiku-item';
          li.textContent = haiku;
          li.title = 'クリックしてこの句をメインに表示＆シェア';

          li.addEventListener('click', () => {
            // 他のアクティブを解除
            const items = pastListEl.querySelectorAll('.past-haiku-item');
            items.forEach(it => it.classList.remove('active'));
            li.classList.add('active');

            // メイン表示とシェアリンクを更新
            updateHaikuShareLinks(haiku, '過去の一句');
          });

          pastListEl.appendChild(li);
        });
      }
    }

  } catch (err) {
    console.warn('俳句データの取得に失敗しました:', err);
    const sampleHaiku = '春風や 朝日に映える 富士の嶺';
    updateHaikuShareLinks(sampleHaiku, 'サンプル句');
    if (pastListEl) {
      pastListEl.innerHTML = '<li class="past-haiku-item">（サンプル俳句を表示中）</li>';
    }
  }
}

// ==========================================================================
// Bluesky の投稿表示（公開API・認証不要）
// ==========================================================================
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

/** 要素生成ヘルパー（テキストは必ず textContent で挿入して XSS を防ぐ） */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** http(s) のURLのみ許可する */
function safeHttpUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
  } catch (e) {
    return null;
  }
}

function externalLink(href, className, text) {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** at://did/app.bsky.feed.post/rkey → bsky.app の投稿URL */
function bskyPostUrl(post) {
  const rkey = (post.uri || '').split('/').pop();
  const actor = post.author?.handle || post.author?.did || BLUESKY_HANDLE;
  return `https://bsky.app/profile/${encodeURIComponent(actor)}/post/${encodeURIComponent(rkey)}`;
}

/** 相対時刻（日本語） */
function formatRelativeTime(isoStr) {
  const t = new Date(isoStr).getTime();
  if (isNaN(t)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return 'たった今';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}日前`;
  const jst = new Date(t + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')}`;
}

/** 絶対時刻（JST, ツールチップ用） */
function formatJSTDateTime(isoStr) {
  const t = new Date(isoStr).getTime();
  if (isNaN(t)) return '';
  const j = new Date(t + 9 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${j.getUTCFullYear()}/${p(j.getUTCMonth() + 1)}/${p(j.getUTCDate())} ${p(j.getUTCHours())}:${p(j.getUTCMinutes())}`;
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

async function loadBlueskyFeed() {
  const listEl = document.getElementById('blueskyFeedList');
  if (!listEl) return;

  try {
    const res = await fetch(BLUESKY_FEED_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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

// ==========================================================================
// ブログの記事（CI が日次で .data/blog.json に保存した Atom フィードの直近記事）
// ==========================================================================
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
    const time = el('time', 'blog-post-date', formatJSTDateTime(published).split(' ')[0]);
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

async function loadBlogPosts() {
  const listEl = document.getElementById('blogPostList');
  if (!listEl) return;

  try {
    const res = await fetch('./.data/blog.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cards = (Array.isArray(data.posts) ? data.posts : [])
      .slice(0, 3)
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

// ==========================================================================
// 愛犬たちとの日々（メモリアル & カウントアップ機能 / JST基準）
// ==========================================================================

// 日付定数 (月は0-indexed: 0=1月, 1=2月, 2=3月, 5=6月, 11=12月)
const WANKOU_DEPARTED = { year: 2003, month: 1,  date: 11 };
const MARRIAGE_START  = { year: 2014, month: 5,  date: 27 };
const IBUKI_START     = { year: 2021, month: 11, date: 9 };
const IBUKI_END       = { year: 2025, month: 0,  date: 14 };
const IROHA_START     = { year: 2025, month: 2,  date: 10 };

/**
 * 2つの日付間の経過日数を計算（開始日当日を1日目として含む）
 */
function calculateDaysBetween(startUTC, endUTC) {
  return Math.round((endUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * 2つの日付 (JST: year, month[0-11], date[1-31]) の差分を「何年何ヶ月何日」として計算
 */
function calculateYMD(startY, startM, startD, endY, endM, endD) {
  let years = endY - startY;
  let months = endM - startM;
  let days = endD - startD;

  if (days < 0) {
    months--;
    // endM の前月末日（Date.UTC(endY, endM, 0) は endM の前月末日）
    const prevMonthLastDate = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
    days += prevMonthLastDate;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
}

/**
 * 何年何ヶ月何日の文字列をフォーマット
 */
function formatYMDText(ymd) {
  const parts = [];
  if (ymd.years > 0) parts.push(`${ymd.years}年`);
  if (ymd.months > 0) parts.push(`${ymd.months}ヶ月`);
  if (ymd.days > 0 || parts.length === 0) parts.push(`${ymd.days}日`);
  return parts.join('');
}

/**
 * 結婚してからカードの描画（現在進行形のカウントアップ）
 */
function renderMarriageCard() {
  const jst = getJSTNow();
  const startUTC = Date.UTC(MARRIAGE_START.year, MARRIAGE_START.month, MARRIAGE_START.date);
  const todayUTC = Date.UTC(jst.year, jst.month, jst.date);
  const totalDays = calculateDaysBetween(startUTC, todayUTC);
  const ymd = calculateYMD(MARRIAGE_START.year, MARRIAGE_START.month, MARRIAGE_START.date, jst.year, jst.month, jst.date);

  const rowEl = document.getElementById('cdMarriageRow');
  const dateEl = document.getElementById('cdMarriageDate');
  if (rowEl && dateEl) {
    rowEl.innerHTML = `<span class="countdown-prefix">今日で</span><span class="countdown-value text-rose">${totalDays.toLocaleString()}</span><span class="countdown-unit">日目</span><span class="countdown-ymd text-secondary small fw-medium ms-1">(${formatYMDText(ymd)})</span>`;
    dateEl.innerHTML = `<span class="countdown-badge rose">2014/06/27〜</span>`;
  }
}

/**
 * ワン公と別れてからカードの描画（何年何ヶ月何日のみ表示）
 */
function renderWankouCard() {
  const jst = getJSTNow();
  const ymd = calculateYMD(WANKOU_DEPARTED.year, WANKOU_DEPARTED.month, WANKOU_DEPARTED.date, jst.year, jst.month, jst.date);

  const rowEl = document.getElementById('cdWankouRow');
  const dateEl = document.getElementById('cdWankouDate');
  if (rowEl && dateEl) {
    rowEl.innerHTML = `<span class="countdown-value countdown-value-ymd text-amber">${formatYMDText(ymd)}</span>`;
    dateEl.innerHTML = `<span class="countdown-badge amber">2003/02/11〜</span>`;
  }
}

/**
 * いぶきカードの描画（期間固定のメモリアルカード）
 */
function renderIbukiCard() {
  const startUTC = Date.UTC(IBUKI_START.year, IBUKI_START.month, IBUKI_START.date);
  const endUTC   = Date.UTC(IBUKI_END.year, IBUKI_END.month, IBUKI_END.date);
  const totalDays = calculateDaysBetween(startUTC, endUTC);
  const ymd = calculateYMD(IBUKI_START.year, IBUKI_START.month, IBUKI_START.date, IBUKI_END.year, IBUKI_END.month, IBUKI_END.date);

  const rowEl = document.getElementById('cdIbukiRow');
  const dateEl = document.getElementById('cdIbukiDate');
  if (rowEl && dateEl) {
    rowEl.innerHTML = `<span class="countdown-value text-info">${totalDays.toLocaleString()}</span><span class="countdown-unit">日間</span><span class="countdown-ymd text-secondary small fw-medium ms-1">(${formatYMDText(ymd)})</span>`;
    dateEl.innerHTML = `<span class="countdown-badge cyan">2021/12/09 〜 2025/01/14</span>`;
  }
}

/**
 * いろはカードの描画（現在進行形のカウントアップ）
 */
function renderIrohaCard() {
  const jst = getJSTNow();
  const startUTC = Date.UTC(IROHA_START.year, IROHA_START.month, IROHA_START.date);
  const todayUTC = Date.UTC(jst.year, jst.month, jst.date);
  const totalDays = calculateDaysBetween(startUTC, todayUTC);
  const ymd = calculateYMD(IROHA_START.year, IROHA_START.month, IROHA_START.date, jst.year, jst.month, jst.date);

  const rowEl = document.getElementById('cdIrohaRow');
  const dateEl = document.getElementById('cdIrohaDate');
  if (rowEl && dateEl) {
    rowEl.innerHTML = `<span class="countdown-prefix">今日で</span><span class="countdown-value text-purple">${totalDays.toLocaleString()}</span><span class="countdown-unit">日目</span><span class="countdown-ymd text-secondary small fw-medium ms-1">(${formatYMDText(ymd)})</span>`;
    dateEl.innerHTML = `<span class="countdown-badge purple">2025/03/10〜</span>`;
  }
}

/**
 * 写真のフォールバック・画像読み込み処理
 */
function setupDogPhotos() {
  document.querySelectorAll('.dog-photo-img').forEach(img => {
    img.addEventListener('error', () => {
      // .jpg が見つからない場合は .png を試行
      if (!img.dataset.triedPng) {
        img.dataset.triedPng = '1';
        img.src = img.src.replace(/\.jpg$/, '.png');
      } else {
        // 画像が存在しない場合は非表示にし、背面の絵文字フォールバックを表示
        img.style.display = 'none';
      }
    });
  });
}

/**
 * カウントダウン・カウントアップ・メモリアルセクションの初期化
 */
function initCountdown() {
  renderMarriageCard();
  renderWankouCard();
  renderIbukiCard();
  renderIrohaCard();
  setupDogPhotos();

  // 日付変更に追従するため1分ごとに結婚カード・ワン公カードといろはカードを更新
  setInterval(() => {
    renderMarriageCard();
    renderWankouCard();
    renderIrohaCard();
  }, 60000);
}

// ==========================================================================
// モバイル専用 セクションスライダー & 横矢印ナビゲーション連動
// ==========================================================================
function initMobileSectionSlider() {
  const track = document.getElementById('dashboardSliderTrack');
  const prevBtn = document.getElementById('cardSlidePrevBtn');
  const nextBtn = document.getElementById('cardSlideNextBtn');
  const dots = document.querySelectorAll('#sliderDotsContainer .slider-dot');
  const slides = document.querySelectorAll('.dashboard-slide-item');
  const toastEl = document.getElementById('sliderToastAlert');
  if (!track || slides.length === 0) return;

  const STORAGE_KEY = 'dashboard_active_slide';
  // 体組成情報スライドの位置（Chart.jsのリサイズ発火判定用）
  const healthIdx = Array.from(slides).findIndex(s => s.id === 'slideHealth');
  let currentIdx = 0;
  let toastTimeout = null;
  let lastToastTime = 0;

  // 最後のカードを超えて進もうとした際のトースト通知
  function showEndOfCardsAlert() {
    const now = Date.now();
    if (now - lastToastTime < 700) {
      if (toastEl && toastEl.classList.contains('show')) {
        toastEl.classList.remove('shake');
        void toastEl.offsetWidth; // リフロー発生でアニメーション再開
        toastEl.classList.add('shake');
      }
      return;
    }
    lastToastTime = now;

    // 最後のカード（今日の一句）に微細なバウンス効果を付与
    const lastSlide = slides[slides.length - 1];
    if (lastSlide) {
      lastSlide.classList.remove('slide-bounce-end');
      void lastSlide.offsetWidth;
      lastSlide.classList.add('slide-bounce-end');
      setTimeout(() => lastSlide.classList.remove('slide-bounce-end'), 400);
    }

    // トースト通知を表示
    if (toastEl) {
      toastEl.classList.remove('shake');
      void toastEl.offsetWidth;
      toastEl.classList.add('show', 'shake');

      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toastEl.classList.remove('show', 'shake');
      }, 2200);
    }
  }

  function updateControls(index) {
    currentIdx = index;

    // 前矢印ボタンの有効/無効切り替え
    if (prevBtn) prevBtn.disabled = index === 0;

    // 次矢印ボタン: 終端でもクリック可能にして「ページはもうないよ」アラートを発火
    if (nextBtn) {
      nextBtn.disabled = false;
      const isEnd = index === slides.length - 1;
      nextBtn.classList.toggle('at-end', isEnd);
      nextBtn.setAttribute('title', isEnd ? '最後のページです' : '次のセクションへ');
      nextBtn.setAttribute('aria-label', isEnd ? '最後のページです' : '次のセクションへ');
    }

    // ドットインジケーター更新
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  function scrollToSlide(index, smooth = true) {
    if (index >= 0 && index < slides.length) {
      const targetSlide = slides[index];
      const left = targetSlide.offsetLeft - track.offsetLeft;
      if (!smooth) {
        track.style.scrollBehavior = 'auto';
        track.scrollLeft = left;
        requestAnimationFrame(() => {
          track.style.scrollBehavior = '';
        });
      } else {
        track.scrollTo({ left, behavior: 'smooth' });
      }
      updateControls(index);

      // セッションストレージに現在のスライド位置を保存（リロード時に復元するため）
      try {
        sessionStorage.setItem(STORAGE_KEY, String(index));
      } catch (e) {
        // プライベートブラウジング等の例外対策
      }

      // 体組成情報スライドに移動した場合、Chart.jsのリサイズを発火
      if (index === healthIdx) {
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, smooth ? 350 : 100);
      }
    }
  }

  // 矢印ボタンクリックイベント
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentIdx > 0) {
        scrollToSlide(currentIdx - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentIdx < slides.length - 1) {
        scrollToSlide(currentIdx + 1);
      } else {
        showEndOfCardsAlert();
      }
    });
  }

  // ドットクリックでも該当セクションへジャンプ可能
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      scrollToSlide(i);
    });
  });

  // スワイプスクロール時の自動追従
  let scrollTimeout = null;
  track.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const scrollLeft = track.scrollLeft;
      const trackWidth = track.clientWidth || window.innerWidth;
      const activeIndex = Math.min(
        slides.length - 1,
        Math.max(0, Math.round(scrollLeft / trackWidth))
      );
      updateControls(activeIndex);

      try {
        sessionStorage.setItem(STORAGE_KEY, String(activeIndex));
      } catch (e) {}

      // 体組成情報スライドに入った場合、チャートのキャンバスを再計算
      if (activeIndex === healthIdx) {
        window.dispatchEvent(new Event('resize'));
      }

      // ラバーバンドオーバースクロールによる終端検知
      if (currentIdx === slides.length - 1 && scrollLeft > (track.scrollWidth - trackWidth + 15)) {
        showEndOfCardsAlert();
      }
    }, 60);
  }, { passive: true });

  // タッチスワイプで最後のカードを超えて進もうとした時の検知
  let touchStartX = 0;
  let touchStartY = 0;
  let isTouching = false;

  track.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isTouching = true;
    }
  }, { passive: true });

  track.addEventListener('touchmove', (e) => {
    if (!isTouching || !e.touches || e.touches.length === 0) return;
    if (currentIdx === slides.length - 1) {
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;
      const deltaX = touchStartX - curX; // 左スワイプ（次へ進もうとする動作）
      const deltaY = Math.abs(curY - touchStartY);

      // 横スワイプ意図（40px以上かつ縦移動より顕著）
      if (deltaX > 40 && deltaX > deltaY * 1.2) {
        showEndOfCardsAlert();
      }
    }
  }, { passive: true });

  track.addEventListener('touchend', () => {
    isTouching = false;
  }, { passive: true });
  track.addEventListener('touchcancel', () => {
    isTouching = false;
  }, { passive: true });

  // トラックパッド/マウスホイールによる終端検知
  track.addEventListener('wheel', (e) => {
    if (currentIdx === slides.length - 1 && e.deltaX > 25) {
      showEndOfCardsAlert();
    }
  }, { passive: true });

  // リロード・再訪問時のスライド位置復元
  let initialIdx = 0;
  if (window.location.hash) {
    const hashTarget = window.location.hash.replace('#', '');
    const hashIdx = Array.from(slides).findIndex(s => s.id === hashTarget);
    if (hashIdx !== -1) {
      initialIdx = hashIdx;
    }
  }
  if (initialIdx === 0) {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < slides.length) {
          initialIdx = parsed;
        }
      }
    } catch (e) {}
  }

  if (initialIdx > 0) {
    // 即時適用
    scrollToSlide(initialIdx, false);

    // DOM/CSSレイアウト計算完了時の位置ずれ防止
    requestAnimationFrame(() => {
      scrollToSlide(initialIdx, false);
    });
    setTimeout(() => {
      scrollToSlide(initialIdx, false);
    }, 50);

    // 画像等ロード完了時にも念のため同期
    window.addEventListener('load', () => {
      scrollToSlide(initialIdx, false);
    }, { once: true });
  } else {
    // 初期状態の設定
    updateControls(0);
  }
}








