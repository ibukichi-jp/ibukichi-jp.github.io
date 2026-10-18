/**
 * ibukichi Dashboard - Frontend Application
 */

// グローバル状態
let weightChartInstance = null;
let fatChartInstance = null;
let selectedYear = new Date().getFullYear().toString();
let realTanitaData = null;

// ==========================================================================
// 初期化
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  startDigitalClock();
  initCountdown();
  initCalendar();
  initEventListeners();
  loadTanitaData();
  loadHaikuData();
});

// ==========================================================================
// リアルタイムデジタル時計（秒まで更新）
// ==========================================================================
function startDigitalClock() {
  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const dateEl = document.getElementById('clockDate');
  const timeEl = document.getElementById('clockTime');
  if (!dateEl || !timeEl) return;

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  function update() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const day = weekdays[now.getDay()];

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

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

  const currentYearStr = new Date().getFullYear().toString();

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
    latestEl.textContent = haikuText;
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
// カウントダウン機能（給料日・次の休み・プレミアムフライデー）
// ==========================================================================

/**
 * 日本の祝日を計算して辞書形式で返す
 * @param {number} year - 対象の西暦年
 * @returns {Object} { 'YYYY-MM-DD': '祝日名' }
 */
function getJapaneseHolidays(year) {
  const holidays = {};

  function add(m, d, name) {
    const key = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    holidays[key] = name;
  }

  // 第N月曜日を計算 (m: 1-12, n: 1-5)
  function getNthMonday(m, n) {
    const firstDay = new Date(year, m - 1, 1).getDay();
    const offset = (1 - firstDay + 7) % 7; // 月曜日までのオフセット
    return 1 + offset + (n - 1) * 7;
  }

  // 固定祝日
  add(1, 1, '元日');
  add(1, getNthMonday(1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  add(2, 23, '天皇誕生日');

  // 春分の日 (天文学計算公式: 1980年〜2099年有効)
  const vernalEquinoxDay = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(3, vernalEquinoxDay, '春分の日');

  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');

  add(7, getNthMonday(7, 3), '海の日');
  add(8, 11, '山の日');
  add(9, getNthMonday(9, 3), '敬老の日');

  // 秋分の日 (天文学計算公式: 1980年〜2099年有効)
  const autumnEquinoxDay = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(9, autumnEquinoxDay, '秋分の日');

  add(10, getNthMonday(10, 2), 'スポーツの日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');

  // 振替休日の判定（祝日が日曜日の場合、その日以降で最も近い祝日でない平日）
  const holidayDates = Object.keys(holidays).sort();
  holidayDates.forEach(k => {
    const [y, m, d] = k.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() === 0) { // 日曜日
      let cur = new Date(y, m - 1, d + 1);
      while (true) {
        const curKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!holidays[curKey]) {
          holidays[curKey] = '振替休日';
          break;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  });

  // 国民の休日の判定（祝日と祝日に挟まれた平日）
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(year, m, 0).getDate();
    for (let d = 2; d < daysInMonth; d++) {
      const prevKey = `${year}-${String(m).padStart(2, '0')}-${String(d - 1).padStart(2, '0')}`;
      const curKey = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const nextKey = `${year}-${String(m).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`;
      if (holidays[prevKey] && holidays[nextKey] && !holidays[curKey]) {
        const curDt = new Date(year, m - 1, d);
        if (curDt.getDay() !== 0) {
          holidays[curKey] = '国民の休日';
        }
      }
    }
  }

  return holidays;
}

/**
 * 日本の祝日または土日かどうかを判定
 */
function isHolidayOrWeekend(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return true; // 土日

  const y = date.getFullYear();
  const holidays = getJapaneseHolidays(y);
  const key = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return !!holidays[key];
}

/**
 * 次の給料日（毎月10日、土日祝なら直前の平日に前倒し）を算出
 */
function getNextPayday(now) {
  function getPaydayForMonth(year, monthIndex) {
    let d = new Date(year, monthIndex, 10, 0, 0, 0, 0);
    // 土日祝なら前倒し（直前の平日へ）
    while (isHolidayOrWeekend(d)) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  }

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // 今月の給料日
  const thisMonthPayday = getPaydayForMonth(now.getFullYear(), now.getMonth());
  if (thisMonthPayday >= todayMidnight) {
    return thisMonthPayday;
  }

  // 今月が既に過ぎていれば来月の給料日
  return getPaydayForMonth(now.getFullYear(), now.getMonth() + 1);
}

/**
 * 次の休み（土曜日、日曜日、日本の祝日）を算出
 */
function getNextHoliday(now) {
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // 今日がすでに休みかどうか
  if (isHolidayOrWeekend(todayMidnight)) {
    return { date: todayMidnight, isToday: true };
  }

  // 明日以降で最も近い休みを探す
  let cur = new Date(todayMidnight);
  cur.setDate(cur.getDate() + 1);
  while (!isHolidayOrWeekend(cur)) {
    cur.setDate(cur.getDate() + 1);
  }
  return { date: cur, isToday: false };
}

/**
 * 次のプレミアムフライデー（毎月末の金曜日）を算出
 */
function getNextPremiumFriday(now) {
  function getLastFridayOfMonth(year, monthIndex) {
    // 翌月の0日 = 当月末日
    let d = new Date(year, monthIndex + 1, 0, 0, 0, 0, 0);
    while (d.getDay() !== 5) { // 金曜日は 5
      d.setDate(d.getDate() - 1);
    }
    return d;
  }

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // 今月の最終金曜日
  const thisMonthPF = getLastFridayOfMonth(now.getFullYear(), now.getMonth());
  if (thisMonthPF >= todayMidnight) {
    return thisMonthPF;
  }

  // 今月が既に過ぎていれば来月の最終金曜日
  return getLastFridayOfMonth(now.getFullYear(), now.getMonth() + 1);
}

/**
 * カウントダウンの初期化＆描画
 */
function initCountdown() {
  updateCountdown();
  // 1分ごとに更新（日付変更時にも追従）
  setInterval(updateCountdown, 60000);
}

function updateCountdown() {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  function diffInDays(targetDate) {
    const diffMs = targetDate.getTime() - todayMidnight.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  function formatDate(d) {
    const m = d.getMonth() + 1;
    const date = d.getDate();
    const w = weekdays[d.getDay()];
    return `${m}/${date} (${w})`;
  }

  // 1. 給料日
  const payday = getNextPayday(now);
  const paydayDiff = diffInDays(payday);
  const cdPaydayRow = document.getElementById('cdPaydayRow');
  const cdPaydayDate = document.getElementById('cdPaydayDate');

  if (cdPaydayRow && cdPaydayDate) {
    const isOriginal10 = payday.getDate() === 10;
    const noteText = isOriginal10 ? '' : ` (繰上)`;

    if (paydayDiff === 0) {
      cdPaydayRow.innerHTML = '<span class="countdown-prefix">あと</span><span class="countdown-value text-warning">0</span><span class="countdown-unit">日 (本日🎉)</span>';
    } else if (paydayDiff === 1) {
      cdPaydayRow.innerHTML = '<span class="countdown-prefix">あと</span><span class="countdown-value">1</span><span class="countdown-unit">日 (明日)</span>';
    } else {
      cdPaydayRow.innerHTML = `<span class="countdown-prefix">あと</span><span class="countdown-value">${paydayDiff}</span><span class="countdown-unit">日</span>`;
    }
    cdPaydayDate.innerHTML = `<span class="countdown-badge amber">次回: ${formatDate(payday)}${noteText}</span>`;
  }

  // 2. 次の休み
  const holidayInfo = getNextHoliday(now);
  const cdHolidayRow = document.getElementById('cdHolidayRow');
  const cdHolidayDate = document.getElementById('cdHolidayDate');

  if (cdHolidayRow && cdHolidayDate) {
    if (holidayInfo.isToday) {
      cdHolidayRow.innerHTML = '<span class="countdown-prefix">あと</span><span class="countdown-value text-success">0</span><span class="countdown-unit">日 (本日休日🎉)</span>';
      // 祝日名があれば表示
      const holidaysObj = getJapaneseHolidays(now.getFullYear());
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const holidayName = holidaysObj[key];
      cdHolidayDate.innerHTML = `<span class="countdown-badge emerald">${holidayName ? holidayName : '週末・休日を満喫中'}</span>`;
    } else {
      const holidayDiff = diffInDays(holidayInfo.date);
      if (holidayDiff === 1) {
        cdHolidayRow.innerHTML = '<span class="countdown-prefix">あと</span><span class="countdown-value">1</span><span class="countdown-unit">日 (明日)</span>';
      } else {
        cdHolidayRow.innerHTML = `<span class="countdown-prefix">あと</span><span class="countdown-value">${holidayDiff}</span><span class="countdown-unit">日</span>`;
      }

      const holidaysObj = getJapaneseHolidays(holidayInfo.date.getFullYear());
      const key = `${holidayInfo.date.getFullYear()}-${String(holidayInfo.date.getMonth() + 1).padStart(2, '0')}-${String(holidayInfo.date.getDate()).padStart(2, '0')}`;
      const holidayName = holidaysObj[key];
      const subLabel = holidayName ? `次回: ${formatDate(holidayInfo.date)} (${holidayName})` : `次回: ${formatDate(holidayInfo.date)}`;

      cdHolidayDate.innerHTML = `<span class="countdown-badge emerald">${subLabel}</span>`;
    }
  }

  // 3. プレミアムフライデー
  const premFri = getNextPremiumFriday(now);
  const premFriDiff = diffInDays(premFri);
  const cdPremFriRow = document.getElementById('cdPremFriRow');
  const cdPremFriDate = document.getElementById('cdPremFriDate');

  if (cdPremFriRow && cdPremFriDate) {
    if (premFriDiff === 0) {
      cdPremFriRow.innerHTML = '<span class="countdown-prefix">あと</span><span class="countdown-value text-danger">0</span><span class="countdown-unit">日 (本日🍻)</span>';
    } else if (premFriDiff === 1) {
      cdPremFriRow.innerHTML = '<span class="countdown-prefix">あと</span><span class="countdown-value">1</span><span class="countdown-unit">日 (明日)</span>';
    } else {
      cdPremFriRow.innerHTML = `<span class="countdown-prefix">あと</span><span class="countdown-value">${premFriDiff}</span><span class="countdown-unit">日</span>`;
    }
    cdPremFriDate.innerHTML = `<span class="countdown-badge pink">次回: ${formatDate(premFri)}</span>`;
  }
  // カレンダー描画も現在日付と同期
  if (typeof renderCalendar === 'function') {
    renderCalendar();
  }
}

/**
 * ==========================================================================
 * 日本のカレンダー（祝日対応・カウントダウン同期）
 * ==========================================================================
 */
let currentCalendarDate = new Date();

function initCalendar() {
  const btnPrev = document.getElementById('btnPrevMonth');
  const btnNext = document.getElementById('btnNextMonth');
  const btnToday = document.getElementById('btnTodayMonth');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      renderCalendar();
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      currentCalendarDate = new Date();
      renderCalendar();
    });
  }

  renderCalendar();
  initCountdownSyncHover();
}

/**
 * カレンダーグリッドの描画
 */
function renderCalendar() {
  const grid = document.getElementById('calendarDaysGrid');
  const monthLabel = document.getElementById('calendarMonthLabel');
  const holidaySummary = document.getElementById('calendarHolidaySummary');
  if (!grid || !monthLabel) return;

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();

  const calYear = currentCalendarDate.getFullYear();
  const calMonth = currentCalendarDate.getMonth();

  monthLabel.textContent = `${calYear}年 ${calMonth + 1}月`;

  // カウントダウン同期対象日を計算
  const paydayObj = getNextPayday(now);
  const holidayInfo = getNextHoliday(now);
  const nextHolidayObj = holidayInfo.isToday ? now : holidayInfo.date;
  const premFriObj = getNextPremiumFriday(now);

  const fmtKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const paydayKey = fmtKey(paydayObj);
  const nextHolidayKey = fmtKey(nextHolidayObj);
  const premFriKey = fmtKey(premFriObj);

  // 祝日データ取得（当年、前年、翌年をサポート）
  const holidaysCurrent = getJapaneseHolidays(calYear);
  const holidaysPrev = getJapaneseHolidays(calYear - 1);
  const holidaysNext = getJapaneseHolidays(calYear + 1);
  const getHolidayName = (y, m, d) => {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (y === calYear) return holidaysCurrent[k] || null;
    if (y < calYear) return holidaysPrev[k] || null;
    return holidaysNext[k] || null;
  };

  // 当月の祝日数カウント
  let monthHolidayCount = 0;
  for (let d = 1; d <= 31; d++) {
    const testDate = new Date(calYear, calMonth, d);
    if (testDate.getMonth() !== calMonth) break;
    if (getHolidayName(calYear, calMonth, d)) {
      monthHolidayCount++;
    }
  }
  if (holidaySummary) {
    if (monthHolidayCount > 0) {
      holidaySummary.textContent = `祝日 ${monthHolidayCount}日`;
      holidaySummary.style.display = 'inline-block';
    } else {
      holidaySummary.style.display = 'none';
    }
  }

  // カレンダーマトリックス作成
  grid.innerHTML = '';

  const firstDayIndex = new Date(calYear, calMonth, 1).getDay(); // 0(日) - 6(土)
  const lastDate = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthLastDate = new Date(calYear, calMonth, 0).getDate();

  // 1. 前月のはみ出し
  const prevMonthYear = calMonth === 0 ? calYear - 1 : calYear;
  const prevMonthIndex = calMonth === 0 ? 11 : calMonth - 1;
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDate - i;
    const cellDate = new Date(prevMonthYear, prevMonthIndex, dayNum);
    grid.appendChild(createCalendarCell(cellDate, true, getHolidayName, paydayKey, nextHolidayKey, premFriKey, todayYear, todayMonth, todayDate));
  }

  // 2. 当月の日付
  for (let d = 1; d <= lastDate; d++) {
    const cellDate = new Date(calYear, calMonth, d);
    grid.appendChild(createCalendarCell(cellDate, false, getHolidayName, paydayKey, nextHolidayKey, premFriKey, todayYear, todayMonth, todayDate));
  }

  // 3. 翌月のはみ出し（7の倍数まで埋める）
  const nextMonthYear = calMonth === 11 ? calYear + 1 : calYear;
  const nextMonthIndex = calMonth === 11 ? 0 : calMonth + 1;
  const totalCellsSoFar = firstDayIndex + lastDate;
  const trailingDays = (7 - (totalCellsSoFar % 7)) % 7;
  for (let d = 1; d <= trailingDays; d++) {
    const cellDate = new Date(nextMonthYear, nextMonthIndex, d);
    grid.appendChild(createCalendarCell(cellDate, true, getHolidayName, paydayKey, nextHolidayKey, premFriKey, todayYear, todayMonth, todayDate));
  }

  // カレンダーセルホバー時のカウントダウン連動リスナーを設定
  attachCellHoverListeners();
}

/**
 * 1日分のカレンダーセル要素を作成
 */
function createCalendarCell(cellDate, isOtherMonth, getHolidayName, paydayKey, nextHolidayKey, premFriKey, todayYear, todayMonth, todayDate) {
  const y = cellDate.getFullYear();
  const m = cellDate.getMonth();
  const d = cellDate.getDate();
  const dayOfWeek = cellDate.getDay();
  const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const holidayName = getHolidayName(y, m, d);
  const isToday = !isOtherMonth && (y === todayYear && m === todayMonth && d === todayDate);

  const isPayday = dateKey === paydayKey;
  const isNextHoliday = dateKey === nextHolidayKey;
  const isPremFri = dateKey === premFriKey;

  const cell = document.createElement('div');
  cell.className = 'cal-day-cell';
  if (isOtherMonth) cell.classList.add('other-month');
  if (dayOfWeek === 0) cell.classList.add('is-sun');
  if (dayOfWeek === 6) cell.classList.add('is-sat');
  if (holidayName) cell.classList.add('is-holiday');
  if (isToday) cell.classList.add('is-today');

  // カウントダウン同期属性
  const markers = [];
  const titles = [];

  if (isPayday) {
    cell.classList.add('sync-target-payday');
    cell.setAttribute('data-sync', 'payday');
    markers.push('<span class="cal-marker" title="次の給料日">💰</span>');
    titles.push('次回給料日');
  }
  if (isNextHoliday) {
    cell.classList.add('sync-target-holiday');
    if (!cell.hasAttribute('data-sync')) {
      cell.setAttribute('data-sync', 'holiday');
    }
    markers.push('<span class="cal-marker" title="次の休み">🏖️</span>');
    titles.push(holidayName ? `次の休み (${holidayName})` : '次の休み');
  }
  if (isPremFri) {
    cell.classList.add('sync-target-prem-fri');
    if (!cell.hasAttribute('data-sync')) {
      cell.setAttribute('data-sync', 'prem-fri');
    }
    markers.push('<span class="cal-marker" title="プレミアムフライデー">🍻</span>');
    titles.push('プレミアムフライデー');
  }

  if (holidayName) {
    titles.push(holidayName);
  }
  if (isToday) {
    titles.push('今日');
  }

  if (titles.length > 0) {
    cell.setAttribute('title', `${m + 1}/${d} (${['日','月','火','水','木','金','土'][dayOfWeek]}): ${titles.join(' / ')}`);
  }

  // HTML構築
  let html = `
    <div class="cal-day-top">
      <span class="cal-day-num">${d}</span>
      <div class="cal-markers-row">${markers.join('')}</div>
    </div>
  `;

  if (holidayName) {
    html += `<div class="cal-holiday-name" title="${holidayName}">${holidayName}</div>`;
  }

  cell.innerHTML = html;
  return cell;
}

/**
 * カウントダウンカードとカレンダーセルの双方向ホバー連携
 */
function initCountdownSyncHover() {
  const countdownCards = document.querySelectorAll('.countdown-card[data-sync-target]');
  countdownCards.forEach(card => {
    const targetType = card.getAttribute('data-sync-target');

    card.addEventListener('mouseenter', () => {
      const syncCells = document.querySelectorAll(`.cal-day-cell[data-sync="${targetType}"]`);
      syncCells.forEach(c => c.classList.add('sync-pulse'));
    });

    card.addEventListener('mouseleave', () => {
      const syncCells = document.querySelectorAll(`.cal-day-cell[data-sync="${targetType}"]`);
      syncCells.forEach(c => c.classList.remove('sync-pulse'));
    });
  });
}

function attachCellHoverListeners() {
  const syncCells = document.querySelectorAll('.cal-day-cell[data-sync]');
  syncCells.forEach(cell => {
    const targetType = cell.getAttribute('data-sync');
    const matchedCard = document.querySelector(`.countdown-card[data-sync-target="${targetType}"]`);

    if (matchedCard) {
      cell.addEventListener('mouseenter', () => {
        matchedCard.classList.add('sync-card-pulse');
      });

      cell.addEventListener('mouseleave', () => {
        matchedCard.classList.remove('sync-card-pulse');
      });
    }
  });
}




