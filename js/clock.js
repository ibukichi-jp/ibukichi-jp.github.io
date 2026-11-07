/**
 * ヘッダーのデジタル時計（日本時間・1秒ごとに更新）とフッターの年表示
 */
function startDigitalClock() {
  const yearEl = document.getElementById('currentYear');
  if (yearEl) yearEl.textContent = getJSTNow().year;

  const dateEl = document.getElementById('clockDate');
  const timeEl = document.getElementById('clockTime');
  if (!dateEl || !timeEl) return;

  function update() {
    const j = getJSTNow();
    dateEl.textContent = `${j.year}/${pad2(j.month + 1)}/${pad2(j.date)} (${WEEKDAYS_JA[j.day]})`;
    timeEl.textContent = `${pad2(j.hours)}:${pad2(j.minutes)}:${pad2(j.seconds)}`;
  }

  update();
  setInterval(update, 1000);
}
