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
    const diffText = Math.abs(diff) < 0.1
      ? '達成 🎉'
      : (diff > 0 ? `あと -${diff.toFixed(1)}kg` : `+${Math.abs(diff).toFixed(1)}kg`);
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

function roundTwo(num) {
  return Math.round(num * 100) / 100;
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
      latestEl.innerHTML = phrases.map(p => `<span class="haiku-phrase">${p}</span>`).join('<br>');
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
  if (!track || slides.length === 0) return;

  let currentIdx = 0;

  function updateControls(index) {
    currentIdx = index;

    // 前後矢印ボタンの有効/無効切り替え
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === slides.length - 1;

    // ドットインジケーター更新
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  function scrollToSlide(index) {
    if (index >= 0 && index < slides.length) {
      const targetSlide = slides[index];
      const left = targetSlide.offsetLeft - track.offsetLeft;
      track.scrollTo({ left, behavior: 'smooth' });
      updateControls(index);

      // 体組成情報スライドに移動した場合、Chart.jsのリサイズを発火
      if (index === 2) {
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 350);
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

      // 体組成情報スライドに入った場合、チャートのキャンバスを再計算
      if (activeIndex === 2) {
        window.dispatchEvent(new Event('resize'));
      }
    }, 60);
  }, { passive: true });

  // 初期状態の設定
  updateControls(0);
}








