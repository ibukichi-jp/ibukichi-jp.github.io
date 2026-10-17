/**
 * ibukichi Dashboard - Frontend Application
 */

// グローバル状態
let weightChartInstance = null;
let fatChartInstance = null;
let muscleChartInstance = null;
let selectedYear = new Date().getFullYear().toString();
let realTanitaData = null;

// ==========================================================================
// 初期化
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  startDigitalClock();
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

  // 筋肉量 (最新値のみ表示、バッジ不要)
  const latestMuscle = latestAll.muscle != null
    ? latestAll.muscle
    : (latestAll.weight && latestAll.fat ? latestAll.weight * (1 - latestAll.fat / 100) : null);

  if (latestMuscle != null) {
    document.getElementById('kpiMuscle').textContent = latestMuscle.toFixed(1);
  } else {
    document.getElementById('kpiMuscle').textContent = '--.-';
  }

  // 3. グラフ用データのフィルタリング（選択された年）
  let displayRecords = allRecords;
  if (selectedYear !== 'all') {
    displayRecords = allRecords.filter(r => r.date && r.date.startsWith(selectedYear));
  }

  if (displayRecords.length === 0) {
    document.getElementById('weightEmptyState').classList.add('active');
    document.getElementById('fatEmptyState').classList.add('active');
    document.getElementById('muscleEmptyState').classList.add('active');
    destroyCharts();
    return;
  }

  document.getElementById('weightEmptyState').classList.remove('active');
  document.getElementById('fatEmptyState').classList.remove('active');
  document.getElementById('muscleEmptyState').classList.remove('active');

  // 4. グラフ上部統計テキスト更新
  const yearLabel = selectedYear === 'all' ? '全期間' : `${selectedYear}年`;
  updateStatsBadge('weightStatsText', displayRecords.map(r => r.weight), 'kg', yearLabel);
  updateStatsBadge('fatStatsText', displayRecords.map(r => r.fat), '%', yearLabel);
  updateStatsBadge('muscleStatsText', displayRecords.map(r => r.muscle || (r.weight && r.fat ? r.weight * (1 - r.fat / 100) : null)), 'kg', yearLabel);

  // 5. 3つのチャートを描画
  renderWeightChart(displayRecords);
  renderFatChart(displayRecords);
  renderMuscleChart(displayRecords);
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
  document.getElementById('kpiMuscle').textContent = '--.-';
  document.getElementById('kpiWeightTarget').innerHTML = '<span class="target-badge cyan">目標: 67.4kg</span>';
  document.getElementById('kpiFatTarget').innerHTML = '<span class="target-badge purple">目標: 19.9%</span>';
  document.getElementById('kpiBmiTarget').innerHTML = '<span class="target-badge indigo">目標: 22.0</span>';
  document.getElementById('latestMeasurementTime').textContent = '最新測定: 未測定';
  document.getElementById('weightEmptyState').classList.add('active');
  document.getElementById('fatEmptyState').classList.add('active');
  document.getElementById('muscleEmptyState').classList.add('active');
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
  if (muscleChartInstance) {
    muscleChartInstance.destroy();
    muscleChartInstance = null;
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

// ==========================================================================
// 3. 筋肉量チャート (Muscle Mass Chart: エメラルドグリーン系)
// ==========================================================================
function renderMuscleChart(records) {
  const canvas = document.getElementById('muscleChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (muscleChartInstance) {
    muscleChartInstance.destroy();
  }

  const labels = records.map(r => formatChartDate(r.date, selectedYear === 'all'));
  const data = records.map(r => r.muscle || (r.weight && r.fat ? roundTwo(r.weight * (1 - r.fat / 100)) : null));

  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
  grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  muscleChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '筋肉量 (kg)',
        data,
        borderColor: '#10b981',
        backgroundColor: grad,
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: records.length > 30 ? 2 : 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
      }]
    },
    options: createChartOptions('筋肉量', 'kg', '#34d399', '#10b981', records)
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
// 俳句データの読み込み
// ==========================================================================
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
      latestEl.textContent = '俳句データがまだありません。';
      pastListEl.innerHTML = '<li class="past-haiku-item">次回実行をお待ちください</li>';
      return;
    }

    const latestHaiku = lines[lines.length - 1];
    latestEl.textContent = latestHaiku;

    const pastHaikus = lines.slice(0, -1).reverse().slice(0, 5);
    pastListEl.innerHTML = '';

    if (pastHaikus.length === 0) {
      pastListEl.innerHTML = '<li class="past-haiku-item">過去のアーカイブはまだありません</li>';
    } else {
      pastHaikus.forEach(haiku => {
        const li = document.createElement('li');
        li.className = 'past-haiku-item';
        li.textContent = haiku;
        pastListEl.appendChild(li);
      });
    }

  } catch (err) {
    console.warn('俳句データの取得に失敗しました:', err);
    latestEl.textContent = '春風や 朝日に映える 富士の嶺';
    pastListEl.innerHTML = '<li class="past-haiku-item">（サンプル俳句を表示中）</li>';
  }
}
