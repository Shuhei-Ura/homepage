// 公開ページ共通：ヘッダー・メニュー・スクロール表示
document.addEventListener('DOMContentLoaded', () => {
  const hdr = document.getElementById('hdr');
  if (!hdr.classList.contains('is-solid')) {
    const onScroll = () => hdr.classList.toggle('is-scrolled', window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // スマホメニュー
  const menuBtn = document.getElementById('menuBtn');
  const setMenu = open => {
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  document.querySelectorAll('.drawer a').forEach(a => a.addEventListener('click', () => setMenu(false)));

  // .rv を画面に入ったらフェードイン
  const targets = document.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    io.unobserve(e.target);
  }), { rootMargin: '0px 0px -10% 0px' });
  targets.forEach(el => io.observe(el));
});
