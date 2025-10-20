document.addEventListener('DOMContentLoaded', () => {
  // 対象: すべての <section> から .hero を除外
  const sections = Array.from(document.querySelectorAll('section:not(.hero)'));

  // 初期状態クラスを付与
  sections.forEach(sec => sec.classList.add('reveal'));

  // IntersectionObserver 設定
  const io = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const el = entry.target;
      el.classList.add('is-inview');

      // いったん表示した要素は監視解除（1回だけ発火）
      observer.unobserve(el);
    }
  }, {
    root: null,
    // 下 10% ほど余裕を持って少し早めに発火
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.45
  });

  sections.forEach(sec => io.observe(sec));

  // 安全策: IntersectionObserver 非対応ブラウザ（かなり古い）のフォールバック
  if (!('IntersectionObserver' in window)) {
    sections.forEach(sec => sec.classList.add('is-inview'));
  }
});
