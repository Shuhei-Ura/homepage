// お問い合わせページ
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  // 用件に応じて会社名欄と文言を切り替える
  const company = document.getElementById('f-company');
  const msgLabel = document.getElementById('msgLabel');
  const msg = document.getElementById('message');
  const copy = {
    recruit: ['聞いてみたいこと・今の思い', '例）未経験ですが、研修の進め方について詳しく聞いてみたいです。'],
    business: ['ご相談内容', '例）顧客管理をZohoで一元化したいと考えています。まずは相談させてください。']
  };
  const applyPurpose = value => {
    company.hidden = value !== 'business';
    msgLabel.textContent = copy[value][0];
    msg.placeholder = copy[value][1];
  };
  form.querySelectorAll('input[name="purpose"]').forEach(r => r.addEventListener('change', () => applyPurpose(r.value)));
  applyPurpose(form.querySelector('input[name="purpose"]:checked').value);

  // 送信前の簡易チェック（最終チェックはサーバー側）
  form.addEventListener('submit', e => {
    let ok = true;
    [['f-name', 'name'], ['f-email', 'email'], ['f-tel', 'tel'], ['f-message', 'message']].forEach(([f, id]) => {
      const el = document.getElementById(id);
      const bad = !el.value.trim() || !el.checkValidity();
      document.getElementById(f).classList.toggle('is-error', bad);
      if (bad) ok = false;
    });
    if (!ok) {
      e.preventDefault();
      form.querySelector('.is-error .input, .is-error .textarea').focus();
      return;
    }
    if (!window.confirm('この内容で送信してよろしいですか？')) e.preventDefault();
  });
});
