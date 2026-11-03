// ブログ記事ページ：読み進み具合のバー
document.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('progress');
  const body = document.querySelector('.a-body');
  const onScroll = () => {
    const r = body.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (r.height + window.innerHeight * 0.2)));
    bar.style.transform = `scaleX(${p})`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});
