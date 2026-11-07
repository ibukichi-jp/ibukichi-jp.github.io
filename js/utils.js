/**
 * ibukichi Dashboard - 共通ユーティリティ
 * （DOM 生成ヘルパー・URL 検証・日本時間の日付処理）
 */

// ==========================================================================
// DOM 生成ヘルパー
// ==========================================================================

/** 要素を生成する。テキストは必ず textContent で入れて XSS を防ぐ */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** 新しいタブで開く外部リンクを生成する */
function externalLink(href, className, text) {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** http(s) の URL のみ許可し、それ以外は null を返す */
function safeHttpUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
  } catch (e) {
    return null;
  }
}

/** JSON を取得する（失敗時は例外） */
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ==========================================================================
// 日本時間（Asia/Tokyo）の日付処理
// ==========================================================================
const JST_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
});
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

const pad2 = n => String(n).padStart(2, '0');

/**
 * 日時を日本時間の各要素に分解する
 * @returns {{year:number, month:number, date:number, hours:number, minutes:number, seconds:number, day:number}}
 *          month は 0-11、day は曜日（0:日〜6:土）
 */
function getJSTParts(date = new Date()) {
  const p = {};
  JST_FORMATTER.formatToParts(date).forEach(({ type, value }) => { p[type] = value; });
  return {
    year: Number(p.year),
    month: Number(p.month) - 1,
    date: Number(p.day),
    hours: Number(p.hour),
    minutes: Number(p.minute),
    seconds: Number(p.second),
    day: WEEKDAY_INDEX[p.weekday],
  };
}

/** 現在の日本時間 */
function getJSTNow() {
  return getJSTParts(new Date());
}

function toDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/** 日本時間の「YYYY/MM/DD」。不正な値なら空文字 */
function formatJSTDate(input) {
  const d = toDate(input);
  if (!d) return '';
  const j = getJSTParts(d);
  return `${j.year}/${pad2(j.month + 1)}/${pad2(j.date)}`;
}

/** 日本時間の「YYYY/MM/DD HH:mm」。不正な値なら空文字 */
function formatJSTDateTime(input) {
  const d = toDate(input);
  if (!d) return '';
  const j = getJSTParts(d);
  return `${formatJSTDate(d)} ${pad2(j.hours)}:${pad2(j.minutes)}`;
}

/** 相対時刻（「たった今」「5分前」…、1週間以上前は日付） */
function formatRelativeTime(input) {
  const d = toDate(input);
  if (!d) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return 'たった今';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}日前`;
  return formatJSTDate(d);
}
