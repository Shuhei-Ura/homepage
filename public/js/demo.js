//　　HTMLセクション
  document.addEventListener('DOMContentLoaded', () => {
    const TEMPLATES = {
      p:
`<p>これは段落の見本です。</p>`,
      input:
`<label>お名前
  <input type="text" placeholder="山田 太郎">
</label>`,
      select:
`<label>好きな言語
  <select>
    <option value="html" selected>HTML</option>
    <option value="css">CSS</option>
    <option value="js">JavaScript</option>
  </select>
</label>`,
      radio:
`<fieldset>
  <legend>職種</legend>
  <label><input type="radio" name="role" value="dev" checked> エンジニア</label>
  <label><input type="radio" name="role" value="sales"> セールス</label>
  <label><input type="radio" name="role" value="design"> デザイナー</label>
</fieldset>`,
      checkbox:
`<div>
  <label><input type="checkbox" checked> メールを受け取る</label>
  <label><input type="checkbox"> 利用規約に同意する</label>
</div>`,
      button:
`<div>
  <button type="button">送信</button>
  <button type="button">キャンセル</button>
</div>`,
      a:
`<a href="#top">ページのトップへ</a>`
    };

    const picker = document.getElementById('tagPicker');
    const codeEl = document.getElementById('tagCode');

    function render() {
      const key = picker.value;
      codeEl.textContent = TEMPLATES[key] || '';
    }

    picker.addEventListener('change', render);
    render(); // 初期表示（段落）
  });

// CSSセクション
    (function () {
    const form = document.getElementById('cssControls');
    const live = document.getElementById('liveBtn');
    const dump = document.getElementById('styleCode');
    const resetBtn = document.getElementById('resetBtn');

    const defaults = {
      width: 200,
      height: 44,
      backgroundColor: '#ff7a1a',
      color: '#ffffff',
      fontSize: 16,
      borderRadius: 999
    };

    function apply() {
      const w  = Number(form.width.value || defaults.width);
      const h  = Number(form.height.value || defaults.height);
      const bg = form.backgroundColor.value || defaults.backgroundColor;
      const tc = form.color.value || defaults.color;
      const fs = Number(form.fontSize.value || defaults.fontSize);
      const br = Number(form.borderRadius.value || defaults.borderRadius);

      // 右ボタンへ反映（縦中央のため inline-flex）
      Object.assign(live.style, {
        width: w + 'px',
        height: h + 'px',
        backgroundColor: bg,
        color: tc,
        fontSize: fs + 'px',
        borderRadius: br + 'px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      });

      dump.textContent =
`width: ${w}px;
height: ${h}px;
background-color: ${bg};
color: ${tc};
font-size: ${fs}px;
border-radius: ${br}px;`;
    }

    function setDefaults() {
      form.width.value = defaults.width;
      form.height.value = defaults.height;
      form.backgroundColor.value = defaults.backgroundColor;
      form.color.value = defaults.color;
      form.fontSize.value = defaults.fontSize;
      form.borderRadius.value = defaults.borderRadius;
      apply();
    }

    form.addEventListener('input', apply);
    resetBtn.addEventListener('click', setDefaults);
    setDefaults(); // 初期適用
  })();

//　Javascriptセクション
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('jsAlertBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        alert('あなたは送信ボタンを押しました');
      });
    }
  });

  // ===== 1) 計算 =====
  (function () {
    const PRICE = 2980;
    const qty = document.getElementById('qty');
    const total = document.getElementById('total');
    function updateTotal() {
      const n = Math.max(0, Number(qty.value || 0));
      total.textContent = (PRICE * n).toLocaleString('ja-JP');
    }
    qty.addEventListener('input', updateTotal);
    updateTotal();
  })();

  // ===== 2) カタカナチェック =====
  (function () {
    const input = document.getElementById('kana');
    const msg = document.getElementById('kanaMsg');
    // 全角カタカナ・スペース・長音符・中黒などを許可
    const katakanaRegex = /^[\u30A0-\u30FF\u3000\sー･・ﾞﾟ]+$/;

    function validate() {
      const v = input.value.trim();
      if (!v) {
        msg.textContent = '';
        msg.className = 'msg';
        return;
      }
      if (katakanaRegex.test(v)) {
        msg.textContent = 'OK：カタカナで入力されています。';
        msg.className = 'msg ok';
      } else {
        msg.textContent = 'NG：カタカナで入力してください（漢字・ひらがなは不可）。';
        msg.className = 'msg ng';
      }
    }
    input.addEventListener('input', validate);
  })();

  // ===== 3) いいねカウント =====
  (function () {
    const btn = document.getElementById('likeBtn');
    const countEl = document.getElementById('likeCount');
    let count = 0;
    btn.addEventListener('click', () => {
      count += 1;
      countEl.textContent = count;
    });
  })();

  // ===== 4) パスワード一致 =====
  (function () {
    const pw1 = document.getElementById('pw1');
    const pw2 = document.getElementById('pw2');
    const msg = document.getElementById('pwMsg');

    function check() {
      const a = pw1.value, b = pw2.value;
      if (!a && !b) { msg.textContent = ''; msg.className = 'msg'; return; }
      if (a === b) {
        msg.textContent = '一致：同じパスワードが入力されています。';
        msg.className = 'msg ok';
      } else {
        msg.textContent = '不一致：入力内容が異なります。';
        msg.className = 'msg ng';
      }
    }
    pw1.addEventListener('input', check);
    pw2.addEventListener('input', check);
  })();