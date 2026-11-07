/**
 * モバイル専用 セクションスライダー（横スワイプ・左右矢印・ドット・位置の復元）
 *
 * スライドは .dashboard-slide-item の並び順そのもの。ドットはスライドから自動生成するので、
 * セクションを追加・並べ替えても HTML のドットを直す必要はない。
 * ドットの名前は data-slider-title、無ければ見出し（aria-labelledby）のテキストを使う。
 */
const SLIDER_STORAGE_KEY = 'dashboard_active_slide';

function sliderTitleOf(slide) {
  if (slide.dataset.sliderTitle) return slide.dataset.sliderTitle;
  const heading = document.getElementById(slide.getAttribute('aria-labelledby') || '');
  return heading ? heading.textContent.trim() : '';
}

function buildSliderDots(container, slides) {
  const dots = slides.map((slide, i) => {
    const dot = el('span', 'slider-dot');
    dot.dataset.index = String(i);
    dot.title = sliderTitleOf(slide);
    return dot;
  });
  container.replaceChildren(...dots);
  return dots;
}

function saveSlideIndex(index) {
  try {
    sessionStorage.setItem(SLIDER_STORAGE_KEY, String(index));
  } catch (e) {
    // プライベートブラウジング等で使えない場合は保存しない
  }
}

function loadSlideIndex(slideCount) {
  try {
    const saved = parseInt(sessionStorage.getItem(SLIDER_STORAGE_KEY), 10);
    return saved >= 0 && saved < slideCount ? saved : 0;
  } catch (e) {
    return 0;
  }
}

/** 最後のスライドより先へ進もうとしたときの「ページはもうないよ」通知 */
function createEndOfSlidesAlert(lastSlide) {
  const toastEl = document.getElementById('sliderToastAlert');
  let hideTimer = null;
  let lastShownAt = 0;

  // クラスを付け直してアニメーションを再生する
  const replay = (node, className) => {
    node.classList.remove(className);
    void node.offsetWidth; // リフローさせてアニメーションを最初から再生
    node.classList.add(className);
  };

  return function showEndOfSlidesAlert() {
    const now = Date.now();
    if (now - lastShownAt < 700) {
      if (toastEl && toastEl.classList.contains('show')) replay(toastEl, 'shake');
      return;
    }
    lastShownAt = now;

    if (lastSlide) {
      replay(lastSlide, 'slide-bounce-end');
      setTimeout(() => lastSlide.classList.remove('slide-bounce-end'), 400);
    }
    if (toastEl) {
      replay(toastEl, 'shake');
      toastEl.classList.add('show');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => toastEl.classList.remove('show', 'shake'), 2200);
    }
  };
}

function initMobileSectionSlider() {
  const track = document.getElementById('dashboardSliderTrack');
  const prevBtn = document.getElementById('cardSlidePrevBtn');
  const nextBtn = document.getElementById('cardSlideNextBtn');
  const dotsContainer = document.getElementById('sliderDotsContainer');
  const slides = Array.from(document.querySelectorAll('.dashboard-slide-item'));
  if (!track || slides.length === 0) return;

  const dots = dotsContainer ? buildSliderDots(dotsContainer, slides) : [];
  const lastIdx = slides.length - 1;
  // 体組成スライドではグラフのサイズを再計算させる（非表示中に描画されるため）
  const healthIdx = slides.findIndex(s => s.id === 'slideHealth');
  const showEndAlert = createEndOfSlidesAlert(slides[lastIdx]);
  let currentIdx = 0;

  function updateControls(index) {
    currentIdx = index;
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) {
      // 終端でも押せるようにして「ページはもうないよ」を出す
      const isEnd = index === lastIdx;
      const label = isEnd ? '最後のページです' : '次のセクションへ';
      nextBtn.disabled = false;
      nextBtn.classList.toggle('at-end', isEnd);
      nextBtn.title = label;
      nextBtn.setAttribute('aria-label', label);
    }
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  }

  function scrollToSlide(index, smooth = true) {
    if (index < 0 || index > lastIdx) return;
    const left = slides[index].offsetLeft - track.offsetLeft;
    if (smooth) {
      track.scrollTo({ left, behavior: 'smooth' });
    } else {
      track.style.scrollBehavior = 'auto';
      track.scrollLeft = left;
      requestAnimationFrame(() => { track.style.scrollBehavior = ''; });
    }
    updateControls(index);
    saveSlideIndex(index);
    if (index === healthIdx) {
      setTimeout(() => window.dispatchEvent(new Event('resize')), smooth ? 350 : 100);
    }
  }

  prevBtn?.addEventListener('click', () => scrollToSlide(currentIdx - 1));
  nextBtn?.addEventListener('click', () => {
    if (currentIdx < lastIdx) scrollToSlide(currentIdx + 1);
    else showEndAlert();
  });
  dots.forEach((dot, i) => dot.addEventListener('click', () => scrollToSlide(i)));

  // スワイプ後のスクロール位置に追従
  let scrollTimer = null;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const width = track.clientWidth || window.innerWidth;
      const index = Math.min(lastIdx, Math.max(0, Math.round(track.scrollLeft / width)));
      updateControls(index);
      saveSlideIndex(index);
      if (index === healthIdx) window.dispatchEvent(new Event('resize'));
      // ラバーバンドのオーバースクロールで終端を検知
      if (index === lastIdx && track.scrollLeft > track.scrollWidth - width + 15) showEndAlert();
    }, 60);
  }, { passive: true });

  // 最後のスライドで、さらに左へスワイプしようとしたときの検知
  let touchStart = null;
  track.addEventListener('touchstart', e => {
    const t = e.touches?.[0];
    touchStart = t ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  track.addEventListener('touchmove', e => {
    const t = e.touches?.[0];
    if (!touchStart || !t || currentIdx !== lastIdx) return;
    const deltaX = touchStart.x - t.clientX;
    const deltaY = Math.abs(t.clientY - touchStart.y);
    if (deltaX > 40 && deltaX > deltaY * 1.2) showEndAlert();
  }, { passive: true });
  const endTouch = () => { touchStart = null; };
  track.addEventListener('touchend', endTouch, { passive: true });
  track.addEventListener('touchcancel', endTouch, { passive: true });

  // トラックパッド / マウスホイールでの終端検知
  track.addEventListener('wheel', e => {
    if (currentIdx === lastIdx && e.deltaX > 25) showEndAlert();
  }, { passive: true });

  // 初期位置: URL の #スライドID → 前回の位置（sessionStorage） → 先頭
  const hashIdx = slides.findIndex(s => `#${s.id}` === window.location.hash);
  const initialIdx = hashIdx > 0 ? hashIdx : loadSlideIndex(slides.length);
  if (initialIdx > 0) {
    scrollToSlide(initialIdx, false);
    // 画像などの読み込み完了後にレイアウトが変わっても位置を合わせ直す
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => scrollToSlide(initialIdx, false), { once: true });
    }
  } else {
    updateControls(0);
  }
}
