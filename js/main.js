/**
 * ibukichi Dashboard - エントリーポイント
 * 各機能の初期化を順に呼び出す（スクリプトは defer で読み込むため DOM は構築済み）
 *
 * どれか1つのスクリプトが読み込めなかったり初期化で例外が出たりしても、
 * 他の機能は動くように1つずつ独立して実行する。
 */
[
  'startDigitalClock',
  'initAnniversaries',
  'initMobileSectionSlider',
  'initHealth',
  'initHaiku',
  'initBluesky',
  'initBlog',
].forEach(name => {
  try {
    const init = window[name];
    if (typeof init !== 'function') throw new Error('関数が見つかりません（スクリプトの読み込み失敗）');
    const result = init();
    if (result instanceof Promise) {
      result.catch(err => console.error(`${name} の初期化に失敗しました:`, err));
    }
  } catch (err) {
    console.error(`${name} の初期化に失敗しました:`, err);
  }
});
