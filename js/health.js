/**
 * 体組成情報（KPI カード・推移グラフ・年の絞り込み）
 */

// 目標値・既定値はここで一元管理する（目標体重は身長と目標 BMI から算出）
const HEALTH_CONFIG = {
  defaultHeightCm: 175.0,
  targetBmi: 22.0,
  targetFatPercent: 19.9,
};

// 推移グラフの定義（体重・体脂肪率）
const HEALTH_CHARTS = [
  {
    field: 'weight', label: '体重', unit: 'kg',
    canvasId: 'weightChart', emptyId: 'weightEmptyState', statsId: 'weightStatsText',
    color: '#06b6d4', rgb: '6, 182, 212', tooltipColor: '#38bdf8',
  },
  {
    field: 'fat', label: '体脂肪率', unit: '%',
    canvasId: 'fatChart', emptyId: 'fatEmptyState', statsId: 'fatStatsText',
    color: '#a855f7', rgb: '168, 85, 247', tooltipColor: '#c084fc',
  },
];

const healthState = {
  data: null,
  selectedYear: String(getJSTNow().year),
  charts: {}, // field → Chart インスタンス
};

function targetWeightKg(heightCm) {
  const m = heightCm / 100;
  return HEALTH_CONFIG.targetBmi * m * m; // 175cm → 67.375kg
}

function setTargetBadge(elementId, color, text) {
  const target = document.getElementById(elementId);
  if (target) target.replaceChildren(el('span', `target-badge ${color}`, text));
}

/**
 * KPI カード（体重・体脂肪率・BMI）を描画する。latest が無ければ目標のみ表示
 */
function renderKpis(heightCm, latest) {
  const tWeight = targetWeightKg(heightCm);
  const { targetBmi, targetFatPercent } = HEALTH_CONFIG;
  const hasWeight = latest && latest.weight != null;
  const hasFat = latest && latest.fat != null;

  document.getElementById('kpiHeight').textContent = heightCm.toFixed(1);

  // 体重
  let weightNote = '';
  if (hasWeight) {
    const diff = latest.weight - tWeight;
    weightNote = ` (${diff < 0.1 ? '達成 🎉' : `あと -${diff.toFixed(1)}kg`})`;
  }
  document.getElementById('kpiWeight').textContent = hasWeight ? latest.weight.toFixed(1) : '--.-';
  setTargetBadge('kpiWeightTarget', 'cyan', `目標: ${tWeight.toFixed(1)}kg${weightNote}`);

  // 体脂肪率
  let fatNote = '';
  if (hasFat) {
    const diff = latest.fat - targetFatPercent;
    fatNote = ` (${diff <= 0 ? '達成 🎉' : `あと -${diff.toFixed(1)}%`})`;
  }
  document.getElementById('kpiFat').textContent = hasFat ? latest.fat.toFixed(1) : '--.-';
  setTargetBadge('kpiFatTarget', 'purple', `目標: ${targetFatPercent.toFixed(1)}%${fatNote}`);

  // BMI
  let bmiNote = '';
  if (hasWeight) {
    const m = heightCm / 100;
    const bmi = latest.bmi != null ? latest.bmi : latest.weight / (m * m);
    const diff = bmi - targetBmi;
    bmiNote = ` (${Math.abs(diff) < 0.1 ? '適正基準 🎉' : `差: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}`})`;
    document.getElementById('kpiBmi').textContent = bmi.toFixed(1);
  } else {
    document.getElementById('kpiBmi').textContent = '--.-';
  }
  setTargetBadge('kpiBmiTarget', 'indigo', `目標: ${targetBmi.toFixed(1)}${bmiNote}`);
}

// ==========================================================================
// 年の絞り込み
// ==========================================================================
function initYearFilterOptions(records) {
  const select = document.getElementById('yearFilterSelect');
  if (!select) return;

  const years = [...new Set(
    records.map(r => (r.date || '').match(/^(\d{4})/)?.[1]).filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));

  const allOpt = el('option', null, 'すべての年');
  allOpt.value = 'all';
  select.replaceChildren(allOpt, ...years.map(y => {
    const opt = el('option', null, `${y}年`);
    opt.value = y;
    return opt;
  }));

  // 初期値: 選択中の年 → 今年 → データのある最新の年 → すべて
  const currentYear = String(getJSTNow().year);
  let target = healthState.selectedYear;
  if (!years.includes(target)) {
    target = years.includes(currentYear) ? currentYear : (years[0] || 'all');
  }
  select.value = target;
  healthState.selectedYear = target;
}

// ==========================================================================
// グラフ
// ==========================================================================
function formatChartDate(dateStr, includeYear = false) {
  const datePart = dateStr.split(' ')[0];
  if (datePart.length < 10) return datePart;
  const md = datePart.slice(5).replace('-', '/');
  return includeYear ? `${datePart.slice(2, 4)}/${md}` : md;
}

function updateStatsText(def, records, periodLabel) {
  const values = records.map(r => r[def.field]).filter(v => v != null);
  const target = document.getElementById(def.statsId);
  if (!target || values.length === 0) return;
  const f = v => v.toFixed(1);
  target.textContent = `[${periodLabel}] 最新: ${f(values[values.length - 1])}${def.unit}`
    + ` · 最小: ${f(Math.min(...values))}${def.unit} · 最大: ${f(Math.max(...values))}${def.unit}`;
}

function destroyCharts() {
  Object.values(healthState.charts).forEach(chart => chart.destroy());
  healthState.charts = {};
}

function createChartOptions(def, records) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: def.tooltipColor,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          title: items => records[items[0].dataIndex]?.date ?? items[0].label,
          label: context => `${def.label}: ${context.parsed.y.toFixed(1)} ${def.unit}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 10 },
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: def.color,
          font: { family: 'Inter', size: 11, weight: 600 },
          callback: value => `${value}${def.unit}`,
        },
      },
    },
  };
}

function renderLineChart(def, records) {
  const canvas = document.getElementById(def.canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  healthState.charts[def.field]?.destroy();

  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, `rgba(${def.rgb}, 0.4)`);
  grad.addColorStop(1, `rgba(${def.rgb}, 0.0)`);

  healthState.charts[def.field] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: records.map(r => formatChartDate(r.date, healthState.selectedYear === 'all')),
      datasets: [{
        label: `${def.label} (${def.unit})`,
        data: records.map(r => r[def.field]),
        borderColor: def.color,
        backgroundColor: grad,
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: records.length > 30 ? 2 : 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: def.color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
      }],
    },
    options: createChartOptions(def, records),
  });
}

function setChartsEmpty(isEmpty) {
  HEALTH_CHARTS.forEach(def => {
    document.getElementById(def.emptyId)?.classList.toggle('active', isEmpty);
  });
  if (isEmpty) destroyCharts();
}

// ==========================================================================
// 全体の描画
// ==========================================================================
function renderHealth(data) {
  const records = data.records || [];
  const heightCm = data.height_cm || HEALTH_CONFIG.defaultHeightCm;
  const latest = records[records.length - 1] || null;

  renderKpis(heightCm, latest);
  document.getElementById('latestMeasurementTime').textContent =
    `最新測定: ${latest ? latest.date : '未測定'}`;

  const year = healthState.selectedYear;
  const display = year === 'all' ? records : records.filter(r => r.date && r.date.startsWith(year));
  if (display.length === 0) {
    setChartsEmpty(true);
    return;
  }
  setChartsEmpty(false);

  const periodLabel = year === 'all' ? '全期間' : `${year}年`;
  HEALTH_CHARTS.forEach(def => {
    updateStatsText(def, display, periodLabel);
    renderLineChart(def, display);
  });
}

async function initHealth() {
  // データ取得前でも目標値は表示しておく
  renderKpis(HEALTH_CONFIG.defaultHeightCm, null);

  document.getElementById('yearFilterSelect')?.addEventListener('change', e => {
    healthState.selectedYear = e.target.value;
    if (healthState.data) renderHealth(healthState.data);
  });

  try {
    const data = await fetchJson('./.data/tanita.json', { cache: 'no-cache' });
    healthState.data = data;
    initYearFilterOptions(data.records || []);
    renderHealth(data);
  } catch (err) {
    console.warn('タニタデータの取得に失敗しました:', err);
    renderHealth({ height_cm: HEALTH_CONFIG.defaultHeightCm, records: [] });
  }
}
