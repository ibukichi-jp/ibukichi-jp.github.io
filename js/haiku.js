/**
 * 今日の一句（AI 俳句）の表示・過去アーカイブ・SNS シェア
 */
const HAIKU_ARCHIVE_COUNT = 5;
const HAIKU_SAMPLE = '春風や 朝日に映える 富士の嶺';

/** メイン表示とシェアリンクを指定の句に切り替える */
function showHaiku(haikuText, badgeLabel = '最新の一句') {
  const textEl = document.getElementById('latestHaikuText');
  if (textEl) {
    // 5・7・5 のスペース区切りを改行して表示
    const phrases = haikuText.trim().split(/[\s　]+/);
    if (phrases.length > 1) {
      const nodes = [];
      phrases.forEach((phrase, i) => {
        if (i > 0) nodes.push(el('br'));
        nodes.push(el('span', 'haiku-phrase', phrase));
      });
      textEl.replaceChildren(...nodes);
    } else {
      textEl.textContent = haikuText;
    }
  }

  const badgeEl = document.getElementById('haikuSelectedBadge');
  if (badgeEl) badgeEl.textContent = badgeLabel;

  const shareText = encodeURIComponent(`今日の一句: 「${haikuText}」\n#AI俳句 #ibukichi_jp\nhttps://ibukichi-jp.github.io/`);
  const twitter = document.getElementById('haikuShareTwitter');
  const bluesky = document.getElementById('haikuShareBluesky');
  if (twitter) twitter.href = `https://twitter.com/intent/tweet?text=${shareText}`;
  if (bluesky) bluesky.href = `https://bsky.app/intent/compose?text=${shareText}`;
}

function setHaikuListMessage(listEl, message) {
  listEl?.replaceChildren(el('li', 'past-haiku-item', message));
}

function renderHaikuArchive(listEl, haikus) {
  if (haikus.length === 0) {
    setHaikuListMessage(listEl, '過去のアーカイブはまだありません');
    return;
  }
  listEl.replaceChildren(...haikus.map(haiku => {
    const li = el('li', 'past-haiku-item', haiku);
    li.title = 'クリックしてこの句をメインに表示＆シェア';
    li.addEventListener('click', () => {
      listEl.querySelectorAll('.past-haiku-item').forEach(item => item.classList.remove('active'));
      li.classList.add('active');
      showHaiku(haiku, '過去の一句');
    });
    return li;
  }));
}

async function initHaiku() {
  const textEl = document.getElementById('latestHaikuText');
  const listEl = document.getElementById('pastHaikuList');

  try {
    const res = await fetch('./.data/haiku.log', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).split('\n').map(line => line.trim()).filter(Boolean);

    if (lines.length === 0) {
      if (textEl) textEl.textContent = '俳句データがまだありません。';
      setHaikuListMessage(listEl, '次回実行をお待ちください');
      return;
    }

    showHaiku(lines[lines.length - 1], '最新の一句');
    if (listEl) renderHaikuArchive(listEl, lines.slice(0, -1).reverse().slice(0, HAIKU_ARCHIVE_COUNT));
  } catch (err) {
    console.warn('俳句データの取得に失敗しました:', err);
    showHaiku(HAIKU_SAMPLE, 'サンプル句');
    setHaikuListMessage(listEl, '（サンプル俳句を表示中）');
  }
}
