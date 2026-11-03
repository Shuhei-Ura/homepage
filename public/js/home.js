// トップページ（LP）専用
document.addEventListener('DOMContentLoaded', () => {
  // 右下の「話を聞いてみる」：FVを過ぎたら表示し、最後のCTAが見えている間は隠す
  const fl = document.getElementById('float');
  const entry = document.getElementById('entry');
  const onScroll = () => {
    const er = entry.getBoundingClientRect();
    fl.classList.toggle('show', window.scrollY > window.innerHeight * 0.7 && er.top > window.innerHeight);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 給与グラフ：画面に入ったら伸ばす
  const stairs = document.getElementById('stairs');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      stairs.classList.add('in');
      io.disconnect();
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(stairs);
  } else {
    stairs.classList.add('in');
  }

  // ブログ：リスト内スクロールで過去記事を追加読み込み
  const list = document.getElementById('posts');
  const box = document.getElementById('postsBox');
  const sentinel = document.getElementById('postsSentinel');
  if (!sentinel || !('IntersectionObserver' in window)) return;

  const LIMIT = 5;
  let offset = Number(list.dataset.offset) || 0;
  let loading = false;

  const finish = text => {
    sentinel.className = 'end';
    sentinel.textContent = text;
    box.classList.add('is-end');
    observer.disconnect();
  };

  const loadMore = async () => {
    if (loading) return;
    loading = true;
    try {
      const res = await fetch(`/api/blog?offset=${offset}&limit=${LIMIT}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status);
      const { posts, hasMore } = await res.json();
      posts.forEach(p => {
        const li = document.createElement('li');
        li.className = 'new';
        const a = document.createElement('a');
        a.href = `/blog/${encodeURIComponent(p.id)}`;
        a.innerHTML = '<time></time><h3></h3><span class="go">→</span>';
        a.querySelector('time').textContent = p.created_at;
        a.querySelector('time').dateTime = p.created_at_iso;
        a.querySelector('h3').textContent = p.title;
        li.append(a);
        list.insertBefore(li, sentinel);
      });
      offset += posts.length;
      if (!hasMore) finish('すべての記事を表示しました');
    } catch (err) {
      console.error('ブログ追加読み込みエラー:', err);
      finish('記事を読み込めませんでした');
    } finally {
      loading = false;
    }
  };

  const observer = new IntersectionObserver(es => {
    if (es[0].isIntersecting) loadMore();
  }, { root: list, rootMargin: '0px 0px 60px 0px' });
  observer.observe(sentinel);
});
