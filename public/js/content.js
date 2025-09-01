document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form.contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    const ok = window.confirm('この内容で送信してよろしいですか？');
    if (!ok) e.preventDefault();
  });
});