/**
 * ライフステージ・愛犬たちとの日々の記念日カード（日本時間基準）
 *
 * カードを追加・変更するときは ANNIVERSARIES に1行足すだけでよい。
 *   type: 'countup' … 「今日で N 日目 (X年Yヶ月Z日)」（開始日を1日目として数える）
 *         'period'  … 「N 日間 (X年Yヶ月Z日)」（start〜end の固定期間）
 *         'elapsed' … 「X年Yヶ月Z日」のみ
 *   container: カードを入れる行要素の id
 *   theme: CSS の card-<theme> / ring-<theme> に対応
 *   color: バッジ色（countdown-badge <color>）、valueClass: 数値の文字色クラス
 */
const ANNIVERSARIES = [
  {
    container: 'lifestageCards', type: 'countup', label: '結婚してから', start: '2014-06-27',
    theme: 'marriage', color: 'rose', valueClass: 'text-rose',
    photo: 'assets/images/marriage.jpg', alt: '結婚', title: '結婚写真', emoji: '💍',
  },
  {
    container: 'dogCards', type: 'period', label: 'いぶきと暮らした日数', start: '2021-12-09', end: '2025-01-14',
    theme: 'ibuki', color: 'cyan', valueClass: 'text-info',
    photo: 'assets/images/ibuki.jpg', alt: 'いぶき', title: 'いぶき', emoji: '🐶',
  },
  {
    container: 'dogCards', type: 'countup', label: 'いろはと暮らし始めて', start: '2025-03-10',
    theme: 'iroha', color: 'purple', valueClass: 'text-purple',
    photo: 'assets/images/iroha.jpg', alt: 'いろは', title: 'いろは', emoji: '🐾',
  },
  {
    container: 'dogCards', type: 'elapsed', label: 'ワン公と別れてから', start: '2003-02-11',
    theme: 'wankou', color: 'amber', valueClass: 'text-amber',
    photo: 'assets/images/wankou.jpg', alt: 'ワン公', title: 'ワン公', emoji: '🐕',
  },
];

/** 'YYYY-MM-DD' → { year, month(0-11), date } */
function parseYMD(str) {
  const [y, m, d] = str.split('-').map(Number);
  return { year: y, month: m - 1, date: d };
}

/** 開始日と終了日を両方含めた日数（開始日当日を1日目とする） */
function calculateDaysBetween(start, end) {
  const ms = Date.UTC(end.year, end.month, end.date) - Date.UTC(start.year, start.month, start.date);
  return Math.round(ms / 86400000) + 1;
}

/** 2つの日付の差分を「何年何ヶ月何日」に分解する */
function calculateYMD(start, end) {
  let years = end.year - start.year;
  let months = end.month - start.month;
  let days = end.date - start.date;

  if (days < 0) {
    months--;
    // end.month の前月の末日を足す
    days += new Date(Date.UTC(end.year, end.month, 0)).getUTCDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days };
}

function formatYMDText({ years, months, days }) {
  const parts = [];
  if (years > 0) parts.push(`${years}年`);
  if (months > 0) parts.push(`${months}ヶ月`);
  if (days > 0 || parts.length === 0) parts.push(`${days}日`);
  return parts.join('');
}

/** 数値行（「今日で N 日目 (…)」など）の中身を生成する */
function buildAnniversaryValue(item) {
  const start = parseYMD(item.start);
  const end = item.type === 'period' ? parseYMD(item.end) : getJSTNow();
  const ymdText = formatYMDText(calculateYMD(start, end));

  if (item.type === 'elapsed') {
    return [el('span', `countdown-value countdown-value-ymd ${item.valueClass}`, ymdText)];
  }

  const totalDays = calculateDaysBetween(start, end).toLocaleString();
  const nodes = [];
  if (item.type === 'countup') nodes.push(el('span', 'countdown-prefix', '今日で'));
  nodes.push(
    el('span', `countdown-value ${item.valueClass}`, totalDays),
    el('span', 'countdown-unit', item.type === 'period' ? '日間' : '日目'),
    el('span', 'countdown-ymd text-secondary small fw-medium ms-1', `(${ymdText})`),
  );
  return nodes;
}

function anniversaryBadgeText(item) {
  const start = item.start.replaceAll('-', '/');
  return item.type === 'period' ? `${start} 〜 ${item.end.replaceAll('-', '/')}` : `${start}〜`;
}

/** 写真（読み込めなければ .png → 絵文字の順にフォールバック） */
function buildAnniversaryPhoto(item) {
  const container = el('div', 'dog-photo-container flex-shrink-0');
  container.title = item.title;
  const ring = el('div', `dog-photo-ring ring-${item.theme}`);

  const img = el('img', 'dog-photo-img');
  img.alt = item.alt;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    const pngSrc = img.src.replace(/\.jpg$/, '.png');
    if (!img.dataset.triedPng && pngSrc !== img.src) {
      img.dataset.triedPng = '1';
      img.src = pngSrc;
    } else {
      // 代わりの画像も無ければ画像を隠し、背面の絵文字を見せる
      img.style.display = 'none';
    }
  });
  img.src = item.photo;

  const fallback = el('div', 'dog-photo-fallback');
  fallback.appendChild(el('span', 'fallback-emoji', item.emoji));

  ring.append(img, fallback);
  container.appendChild(ring);
  return container;
}

function buildAnniversaryCard(item) {
  const col = el('div', 'col');
  const card = el('div', `card h-100 border-0 countdown-card card-${item.theme} shadow-sm`);
  const body = el('div', 'card-body p-3 d-flex align-items-center gap-3');

  const info = el('div', 'd-flex flex-column justify-content-between flex-grow-1 min-w-0');
  const labelRow = el('div', 'd-flex align-items-center mb-1');
  labelRow.appendChild(el('span', 'countdown-label', item.label));
  const valueRow = el('div', 'countdown-value-row');
  valueRow.append(...buildAnniversaryValue(item));
  const sub = el('div', 'countdown-sub mt-2');
  sub.appendChild(el('span', `countdown-badge ${item.color}`, anniversaryBadgeText(item)));
  info.append(labelRow, valueRow, sub);

  body.append(buildAnniversaryPhoto(item), info);
  card.appendChild(body);
  col.appendChild(card);
  return { col, valueRow };
}

function initAnniversaries() {
  const rendered = [];
  ANNIVERSARIES.forEach(item => {
    const container = document.getElementById(item.container);
    if (!container) return;
    const { col, valueRow } = buildAnniversaryCard(item);
    container.appendChild(col);
    rendered.push({ item, valueRow });
  });

  // 日付の変化に追従するため、進行中のカードは1分ごとに数値を更新する
  setInterval(() => {
    rendered
      .filter(({ item }) => item.type !== 'period')
      .forEach(({ item, valueRow }) => valueRow.replaceChildren(...buildAnniversaryValue(item)));
  }, 60000);
}
