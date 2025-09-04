// GitHubに保存されるかのテスト変更するため

const express = require("express");
const path = require("path");
const { engine } =require('express-handlebars');

//　セッション定義
const session = require("express-session");

//　ルーティング定義
const adminRouter = express.Router();

require("dotenv").config(); // .envから設定を読み込む

//　mysql定義
const mysql =require("mysql2/promise");

//　ハッシュ定義
const bcrypt = require("bcrypt");
const saltRounds = 12; // 開発用は10〜12くらい。本番は12推奨

// ハッシュ偽造対策
const csrf = require("csurf");
// CSRF保護ミドルウェアを準備
const csrfProtection = csrf();

// loginリミット セキュリティ：ログインを一定時間で何度もできないように
const rateLimit = require("express-rate-limit");

//　セキュリティ：ヘッダー攻撃対策
const helmet = require("helmet");

// 問い合わせに対しgmailで通知が来るようにするNodemailer
const nodemailer = require('nodemailer');

//　入力バリデーション
const { body, validationResult } = require("express-validator");


const app = express();
const port = 3000;

//　handlebarsのテンプレ
app.engine('handlebars', engine({
  helpers: {
    inc: (v) => Number(v) + 1,
    dec: (v) => Number(v) - 1,
    gt:  (a, b) => Number(a) > Number(b),
    lt:  (a, b) => Number(a) < Number(b),

    // ← 追加：ページ側から差し込める「セクション」ヘルパー
    section(name, options) {
      if (!this._sections) this._sections = {};
      this._sections[name] = options.fn(this);
      return null;
    },
  },
}));
app.set('view engine', 'handlebars');
app.set('views', './views');

// MySQL 接続設定
const dbOptions = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "homepage_user",
  password: process.env.DB_PASS || "GXdpfRYYAc2j6xdnjAUQ",
  database: process.env.DB_NAME || "homepage",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // 日付の扱いが楽になる（任意）
};

// プールを作成
const pool = mysql.createPool(dbOptions);
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ MySQL connected");
  } catch (e) {
    console.error("❌ MySQL connect error:", e.message);
  }
})();

const MySQLStore = require("express-mysql-session")(session);
// セッションストアを作成
const sessionStore = new MySQLStore({}, pool);

// セッション設定
app.use(
  session({
    key: "sid", // クッキー名
    secret: process.env.SESSION_SECRET || "default_secret_key", // 環境変数から
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // 本番だけ true
      sameSite: "lax",
      maxAge: 1000 * 60 * 30 // 30分
    },
  })
); 

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// プロキシ環境（Nginxなど）で必須
app.set("trust proxy", 1);

// セッション確認用ミドルウェア
function requireLogin(req, res, next) {
  console.log(req.session.uid);
  if (req.session && req.session.uid) {
    // ログイン済みならそのまま進む
    return next();
  }
  // 未ログインならログイン画面へ
  return res.redirect("/login");
}

//　ログインリミットのミドルウェア
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分
  max: 10, // 最大10回
  message: "ログイン試行が多すぎます。しばらくしてから再試行してください。",
  standardHeaders: true,
  legacyHeaders: false,
});

// お問い合わせフォーム用レート制限
const contactLimitShort = rateLimit({
  windowMs: 2 * 60 * 1000,   // 2分間
  max: 3,                    // 最大3回
  message: "送信が短時間に集中しています。2分ほど待ってから再送信してください。",
  standardHeaders: true,
  legacyHeaders: false,
});
const contactLimitLong = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10分間
  max: 10,                   // 最大10回
  message: "送信が多すぎます。10分ほど待ってから再送信してください。",
  standardHeaders: true,
  legacyHeaders: false,
});

// ログインのバリデーション
const loginValidation = [
  // 社員ID：数字7桁
  body("employee_id")
    .trim()
    .matches(/^[0-9]{7}$/)
    .withMessage("社員IDは数字7桁で入力してください"),

  // パスワード：自分だけ6桁数字OK / 他は8〜20文字
  body("password")
    .trim()
    .custom((value, { req }) => {
      if (/^[0-9]{6}$/.test(value) && req.body.employee_id === process.env.SPECIAL_ID) {
        return true;
      }
      if (value.length >= 8 && value.length <= 20) {
        return true;
      }
      throw new Error("パスワードは8〜20文字で入力してください");
    }),
];

// --- 2) Nodemailer トランスポート ---
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // 465 じゃないので false
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false, // 念のため
    minVersion: 'TLSv1.2'
  }
});

// --- 3) 通知メール送信のユーティリティ ---
async function sendInquiryNotification(inq) {
  const fromName = process.env.MAIL_FROM_NAME || 'Site Notification';
  const from = `"${fromName}" <${process.env.SMTP_USER}>`;
  const to = process.env.ADMIN_EMAIL;

  const subject = `【問い合わせ通知】${inq.company || ''} / ${inq.name || ''}`;

  const html = `
    <h3>新しいお問い合わせが届きました</h3>
    <table border="0" cellpadding="6" cellspacing="0">
      <tr><td><b>受信日時</b></td><td>${inq.created_at}</td></tr>
      <tr><td><b>会社名</b></td><td>${inq.company || '-'}</td></tr>
      <tr><td><b>氏名</b></td><td>${inq.name || '-'}</td></tr>
      <tr><td><b>メール</b></td><td>${inq.email || '-'}</td></tr>
      <tr><td><b>IP</b></td><td>${inq.ip_address || '-'}</td></tr>
      <tr><td><b>内容</b></td><td><pre style="white-space:pre-wrap;">${inq.message || '-'}</pre></td></tr>
      <tr><td><b>ステータス</b></td><td>未対応(0)</td></tr>
    </table>
    <p>管理画面：/admin/contacts-list をご確認ください。</p>
    ${process.env.SITE_BASE_URL ? `<p><a href="${process.env.SITE_BASE_URL}/admin/contacts-list">管理画面を開く</a></p>` : ''}
  `;

  const text =
`新しいお問い合わせが届きました
受信日時: ${inq.created_at}
会社名: ${inq.company || '-'}
氏名: ${inq.name || '-'}
メール: ${inq.email || '-'}
IP: ${inq.ip_address || '-'}
内容:
${inq.message || '-'}

管理画面: /admin/contacts-list`;

  await mailer.sendMail({ from, to, subject, html, text });
  mailer.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log("SMTP_HOST:", process.env.SMTP_HOST);
      console.log("SMTP_PORT:", process.env.SMTP_PORT);
      console.log("SMTP_USER:", process.env.SMTP_USER);
      console.error("メール送信エラー:", err);
    } else {
      console.log("メール送信成功:", info.response);
    }
  });
}

// （任意）本人へのサンクスメール
async function sendThanksToCustomer(email, name) {
  if (!email) return;
  const fromName = process.env.MAIL_FROM_NAME || 'Respoint Okinawa';
  const from = `"${fromName}" <${process.env.SMTP_USER}>`;

  await mailer.sendMail({
    from,
    to: email,
    subject: '【自動返信】お問い合わせありがとうございます',
    text:
`${name || 'お客様'} 様

このたびはお問い合わせありがとうございます。
内容を確認のうえ、担当より折り返しご連絡いたします。
返信まで少々お待ちください。

株式会社 Respoint Okinawa`,
  });
}
app.use(express.static(path.join(__dirname, "public")));

// 認証チェックやcsrfをadmin専用で付ける
adminRouter.use(requireLogin, csrfProtection);

// ルーターをマウント
app.use("/admin", adminRouter);
// セキュリティヘッダ設定（helmet）
app.use(helmet());


// 公開ページのgetとpost

app.get("/", (req, res) => {
   res.render("home", {
      styles:'<link rel="stylesheet" href="/css/home.css">', 
      titles:'<title>ホーム | 株式会社Respoint Okinawa</title>',
      descriptions:'<meta name="description" content="沖縄でITエンジニアを目指す未経験の若手を積極採用中！株式会社Respoint Okinawaは充実した研修とサポート体制で、ゼロからITキャリアをスタートできます。採用情報はこちら。">'
   });
});

app.get("/about", (req, res) => {
   res.render("about", { 
      styles:'<link rel="stylesheet" href="/css/about.css">',
      titles:'<title>会社概要 | 株式会社Respoint Okinawa</title>',
      descriptions:'<meta name="description" content="株式会社Respoint Okinawaの会社概要。沖縄で未経験からエンジニアを育成し、若手が安心して成長できる環境を提供。SES事業を中心に、技術と人材を全国へ展開しています。">'
   });
});

app.get("/contact", (req, res) => {
   res.render("contact", { 
      styles:'<link rel="stylesheet" href="/css/contact.css">',
      titles:'<title>お問い合わせ | 株式会社Respoint Okinawa</title>',
      descriptions:'<meta name="description" content="未経験からエンジニアを目指す若手に向けた簡易システムデモ。株式会社Respoint Okinawaの業務イメージを体験でき、SESエンジニアの仕事をリアルに知ることができます。">'
   });
});

app.get("/demo", async (req, res) => {
  try {
    // DBから本一覧を取得
    const [books] = await pool.query(
      "SELECT id, title, price, date FROM books ORDER BY date DESC"
    );

    res.render("demo", { 
      styles:'<link rel="stylesheet" href="/css/demo.css">',
      titles:'<title>システムデモ | 株式会社Respoint Okinawa</title>',
      descriptions:'<meta name="description" content="株式会社Respoint Okinawaの会社概要。沖縄で未経験からエンジニアを育成し、若手が安心して成長できる環境を提供。SES事業を中心に、技術と人材を全国へ展開しています。">',

      // 本一覧をビューに渡す
      books
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("DB error");
  }
});

//　デモ用のpost
app.post("/demo", async (req, res) => {
  const { title, price } = req.body;

  // タイトルのバリデーション
  if (!title || title.length === 0 || title.length > 30) {
    return res.status(400).send("タイトルは1〜30文字以内で入力してください");
  }

  // 価格のバリデーション（整数のみ）
  if (!price || !/^[0-9]+$/.test(price) || Number(price) <= 0) {
    return res.status(400).send("価格は正の整数で入力してください");
  }

  try {
    await pool.query(
      "INSERT INTO books (title, price, date) VALUES (?, ?, NOW())",
      [title, price]
    );
    res.redirect("/demo");
  } catch (err) {
    console.error("DB insert error:", err.message);
    res.status(500).send("DB error");
  }
});


app.get("/recruit", (req, res) => {
   res.render("recruit", { 
      styles:'<link rel="stylesheet" href="/css/recruit.css">',
      titles:'<title>採用情報 | 株式会社Respoint Okinawa</title>',
      descriptions:'<meta name="description" content="沖縄でエンジニアを目指す若手未経験者を募集！株式会社Respoint Okinawaは研修制度とキャリア支援が整い、IT業界デビューを全力でサポートします。採用情報をご覧ください。">'
   });
});

// お問い合わせデータ登録
app.post("/contact", contactLimitShort, contactLimitLong, async (req, res) => {
  try {
    const { company, name, email, message } = req.body;

    // --- 入力バリデーション（最低限） ---
    if (!name || !email || !message) {
      return res.status(400).render("contact", {
        error: "お名前・メールアドレス・内容は必須です。",
        styles:'<link rel="stylesheet" href="/css/contact.css">',
        titles:'<title>お問い合わせ| 株式会社Respoint Okinawa</title>',
        descriptions:'<meta name="description" content="沖縄でエンジニアを目指す若手未経験者を募集！株式会社Respoint Okinawaは研修制度とキャリア支援が整い、IT業界デビューを全力でサポートします。採用情報をご覧ください。">',
      });
    }
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).render("contact", {
        error: "正しいメールアドレスを入力してください。",
        styles:'<link rel="stylesheet" href="/css/contact.css">',
        titles:'<title>お問い合わせ| 株式会社Respoint Okinawa</title>',
        descriptions:'<meta name="description" content="沖縄でエンジニアを目指す若手未経験者を募集！株式会社Respoint Okinawaは研修制度とキャリア支援が整い、IT業界デビューを全力でサポートします。採用情報をご覧ください。">',
      });
    }

    // IPアドレスを取得
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // --- pool を使ってDBにINSERT ---
    await pool.query(
      `INSERT INTO contact (company, name, email, content, status, created_at, ip_address) 
       VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
      [company || "", name.trim(), email.trim(), message.trim(), ipAddress]
    );

        // --- 追加：メール通知を送る（失敗してもUXは崩さない） ---
    const notifyPayload = {
      company: company || "",
      name: name?.trim(),
      email: email?.trim(),
      message: message?.trim(),
      ip_address: ipAddress,
      created_at: new Date().toLocaleString(),
    };

    // 通知は待ってもOKですが、UXを優先するなら Promise を投げっぱでも可
    try {
      await sendInquiryNotification(notifyPayload);
      // 必要なら本人へ自動返信
      await sendThanksToCustomer(email, name);
    } catch (mailErr) {
      console.error("CONTACT mail send error:", mailErr);
      // ここではエラーを握りつぶし、画面は成功で返す
    }

    // 成功時
    res.render("contact", {
      success: true,
      styles:'<link rel="stylesheet" href="/css/contact.css">',
      titles:'<title>お問い合わせ| 株式会社Respoint Okinawa</title>',
      descriptions:'<meta name="description" content="沖縄でエンジニアを目指す若手未経験者を募集！株式会社Respoint Okinawaは研修制度とキャリア支援が整い、IT業界デビューを全力でサポートします。採用情報をご覧ください。">',
    });
  } catch (err) {
    console.error("CONTACT INSERT error:", err);

    res.status(500).render("contact", {
      error: "送信中にエラーが発生しました。時間をおいて再度お試しください。",
      styles:'<link rel="stylesheet" href="/css/contact.css">',
      titles:'<title>お問い合わせ| 株式会社Respoint Okinawa</title>',
      descriptions:'<meta name="description" content="沖縄でエンジニアを目指す若手未経験者を募集！株式会社Respoint Okinawaは研修制度とキャリア支援が整い、IT業界デビューを全力でサポートします。採用情報をご覧ください。">',
    });
  }
});

// 公開用ブログ一覧
app.get("/blog-list", async (req, res) => {
  try {
    // 管理者投稿
    const [adminRows] = await pool.query(
      `SELECT b.id, b.title, b.content,
              DATE_FORMAT(b.created_at, '%Y-%m-%d') AS created_at,
              u.name AS author_name
       FROM blog b
       JOIN users u ON u.id = b.author_id
       WHERE b.admin = 1
       ORDER BY b.created_at DESC`
    );

    // 一般ユーザー投稿
    const [userRows] = await pool.query(
      `SELECT b.id, b.title, b.content,
              DATE_FORMAT(b.created_at, '%Y-%m-%d') AS created_at,
              u.name AS author_name
       FROM blog b
       JOIN users u ON u.id = b.author_id
       WHERE b.admin = 0
       ORDER BY b.created_at DESC`
    );

    // 抜粋を作る（contentの先頭100文字など）
    const makeExcerpt = (text) => {
      if (!text) return "";
      return text.length > 100 ? text.slice(0, 100) + "…" : text;
    };

    const adminPosts = adminRows.map((row) => ({
      ...row,
      excerpt: makeExcerpt(row.content),
      created_at_iso: new Date(row.created_at).toISOString().split("T")[0]
    }));

    const employeePosts = userRows.map((row) => ({
      ...row,
      excerpt: makeExcerpt(row.content),
      created_at_iso: new Date(row.created_at).toISOString().split("T")[0]
    }));

    res.render("blog-list", {
      titles: "<title>ブログ一覧</title>",
      styles: '<link rel="stylesheet" href="/css/blog-list.css">',
      descriptions: '<meta name="description" content="Respoint Okinawaのブログ一覧">',
      adminPosts,
      employeePosts,
      adminCount: adminPosts.length,
      employeeCount: employeePosts.length
    });
  } catch (err) {
    console.error("ブログ一覧取得エラー:", err);
    res.render("blog-list", {
      error: "ブログ一覧を取得できませんでした。",
      adminPosts: [],
      employeePosts: [],
      adminCount: 0,
      employeeCount: 0
    });
  }
});

// 公開ブログ詳細ページ
app.get("/blog/:id", async (req, res) => {
  const postId = req.params.id;

  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.title, b.content,
              DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i') AS created_at,
              u.name AS author_name,
              b.admin
       FROM blog b
       JOIN users u ON u.id = b.author_id
       WHERE b.id = ?`,
      [postId]
    );

    if (rows.length === 0) {
      return res.status(404).render("404", {
        titles: "<title>記事が見つかりません</title>"
      });
    }

    const post = rows[0];

    res.render("blog-content", {
      post,
      roleLabel: post.admin ? "経営者投稿" : "社員投稿",
      roleClass: post.admin ? "pill-admin" : "pill-emp",
      styles: '<link rel="stylesheet" href="/css/blog-content.css">',
      titles: `<title>${post.title}</title>`,
      descriptions: `<meta name="description" content="${post.content.slice(0, 80)}">`
    });
  } catch (err) {
    console.error("BLOG DETAIL error:", err);
    res.status(500).render("500", { error: "記事の読み込みに失敗しました。" });
  }
});




//  ここからadminページのget,post



// loginのget

app.get("/login", csrfProtection, (req, res) => {
   res.render("login", { 
      styles:'<link rel="stylesheet" href="/css/login.css">',
      titles:'<title>ログイン</title>',
      descriptions:'<meta name="description" content="">',
      csrfToken: req.csrfToken()
   });
});

// ログアウト処理
app.post("/logout", csrfProtection, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("logout error:", err);
      // セッション破棄に失敗した場合もログイン画面へ
      return res.render("login", { 
        styles:'<link rel="stylesheet" href="/css/login.css">',
        titles:'<title>ログイン</title>',
        descriptions:'<meta name="description" content="">',
        csrfToken: req.csrfToken(),
        error: "ログアウト処理に失敗しました。もう一度お試しください。"
      });
    }
    // Cookie も削除
    res.clearCookie("sid");
    // ログイン画面へリダイレクト
    return res.redirect("/login");
  });
});


// adminのgetとpost

adminRouter.get("/", (req, res) => {
   res.render("admin/admin", { 
      styles:'<link rel="stylesheet" href="/css/admin.css">',
      titles:'<title>メニュー</title>',
      descriptions:'<meta name="description" content="">',
      isAdmin: req.session.isAdmin,
      csrfToken: req.csrfToken()
   });
});

// 社員情報のget
adminRouter.get("/users", csrfProtection, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, employee_id, name, admin FROM users ORDER BY created_at DESC"
    );

    return res.render("admin/users", {
      users: rows,
      styles: '<link rel="stylesheet" href="/css/users.css">',
      titles: '<title>社員情報</title>',
      descriptions: '<meta name="description" content="">',
      isAdmin: req.session.isAdmin,
      csrfToken: req.csrfToken(),
    });
  } catch (err) {
    console.error("GET /admin/users error:", err);
    return res.render("admin/users", {
      error: "読み込みに失敗しました。",
      users: [],
      styles: '<link rel="stylesheet" href="/css/users.css">',
      titles: '<title>社員情報</title>',
      descriptions: '<meta name="description" content="">',
      isAdmin: req.session.isAdmin,
      csrfToken: req.csrfToken(),
    });
  }
});

// ブログの新規投稿の場合の投稿フォームget
adminRouter.get("/newpost", (req, res) => {
   res.render("admin/posts-form", { 
      styles:'<link rel="stylesheet" href="/css/posts-form.css">',
      titles:'<title>ブログ投稿</title>',
      descriptions:'<meta name="description" content="">',
      isAdmin: req.session.isAdmin,
      csrfToken: req.csrfToken(),
      isEdit: false,
      post: {},                  // 空のデータ
      action: "/admin/newpost",    // POST先
      submitLabel: "投稿する"
   });
});

// ブログの一覧→編集：投稿フォーム GET（mysql2/promise 版）
adminRouter.get("/posts/:id/edit", csrfProtection, async (req, res) => {
  const postId = req.params.id;
  const uid = req.session.uid;
  const isAdmin = !!req.session.isAdmin;

  if (!uid) return res.redirect("/login"); // 念のため

  try {
    const [rows] = await pool.query("SELECT * FROM blog WHERE id = ?", [postId]);
    if (!rows.length) {
      // 記事が無ければ一覧へ
      return res.redirect("/admin/posts");
    }
    const post = rows[0];

    // 権限チェック（管理者 or 自分の投稿）
    if (!isAdmin && post.author_id !== uid) {
      return res.status(403).send("権限がありません");
    }

    return res.render("admin/posts-form", {
      styles: '<link rel="stylesheet" href="/css/posts-form.css">',
      titles: '<title>ブログ編集</title>',
      descriptions: '<meta name="description" content="">',
      isAdmin,
      csrfToken: req.csrfToken(),
      isEdit: true,
      post,
      action: `/admin/posts/${postId}/update`,
      submitLabel: "更新する",
    });
  } catch (err) {
    console.error("GET /admin/posts/:id/edit error:", err);
    // エラー時は一覧へ戻す or エラーページ
    return res.redirect("/admin/posts");
  }
});


// ブログ一覧：GET /admin/posts-list （mysql2/promise版）
adminRouter.get("/posts-list", csrfProtection, async (req, res) => {
  const uid = req.session.uid;
  const isAdmin = !!req.session.isAdmin;
  if (!uid) return res.redirect("/login");

  const perPage = 10;
  const pageRaw = parseInt(req.query.page, 10);
  const currentPage = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
  const offset = (currentPage - 1) * perPage;

  const q = (req.query.q || "").trim();
  const like = `%${q}%`;

  let countSql, listSql, paramsCount = [], paramsList = [];

  if (isAdmin) {
    const where = q
      ? "WHERE (b.title LIKE ? OR b.content LIKE ? OR u.name LIKE ?)"
      : "";
    countSql =
      `SELECT COUNT(*) AS cnt FROM blog b JOIN users u ON u.id = b.author_id ${where}`;
    paramsCount = q ? [like, like, like] : [];

    listSql =
      `SELECT b.id, b.title,
              DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i') AS created_at,
              u.name AS author_name
       FROM blog b
       JOIN users u ON u.id = b.author_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`;
    paramsList = q ? [like, like, like, perPage, offset] : [perPage, offset];
  } else {
    const where = q
      ? "WHERE b.author_id = ? AND (b.title LIKE ? OR b.content LIKE ?)"
      : "WHERE b.author_id = ?";
    countSql = `SELECT COUNT(*) AS cnt FROM blog b ${where}`;
    paramsCount = q ? [uid, like, like] : [uid];

    listSql =
      `SELECT b.id, b.title,
              DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i') AS created_at
       FROM blog b
       ${where}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`;
    paramsList = q ? [uid, like, like, perPage, offset] : [uid, perPage, offset];
  }

  try {
    const [countRows] = await pool.query(countSql, paramsCount);
    const total = countRows[0]?.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const [rows2] = await pool.query(listSql, paramsList);

    return res.render("admin/posts-list", {
      posts: rows2,
      isAdmin,
      q,
      currentPage,
      totalPages,
      csrfToken: req.csrfToken(),
      titles: `<title>ブログ一覧</title>`,
      styles: '<link rel="stylesheet" href="/css/posts-list.css">',
      descriptions: `<meta name="description" content="">`,
    });
  } catch (err) {
    console.error("GET /admin/posts-list error:", err);
    return res.render("admin/posts-list", {
      error: "一覧の取得に失敗しました。",
      posts: [],
      isAdmin,
      q,
      currentPage: 1,
      totalPages: 1,
      csrfToken: req.csrfToken(),
      titles: `<title>ブログ一覧</title>`,
      styles: '<link rel="stylesheet" href="/css/posts-list.css">',
      descriptions: `<meta name="description" content="">`,
    });
  }
});

// 管理者用：問い合わせ一覧（ステータスマッピング付き）
adminRouter.get("/contacts-list", csrfProtection, async (req, res) => {
  try {
    const isAdmin = !!req.session.isAdmin;
    if (!isAdmin) return res.status(403).send("権限がありません");

    // 取得
    const [rows] = await pool.query(
      `SELECT id, company, name, email, content, status,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
              ip_address
       FROM contact
       ORDER BY created_at DESC`
    );

    // ステータスマッピング
    const statusMap = {
      0: { label: "未対応", class: "badge--open" },
      1: { label: "対応中", class: "badge--progress" },
      2: { label: "完了",   class: "badge--done" }
    };

    const contacts = rows.map((c) => {
      const s = statusMap[c.status] || statusMap[0];
      return {
        ...c,
        statusLabel: s.label,
        statusClass: s.class,
        // セレクト用（eqヘルパー不要化）
        selected0: Number(c.status) === 0,
        selected1: Number(c.status) === 1,
        selected2: Number(c.status) === 2,
      };
    });

    return res.render("admin/admin-contacts-list", {
      contacts,
      isAdmin,
      csrfToken: req.csrfToken(),
      titles: `<title>お問い合わせ一覧</title>`,
      styles: '<link rel="stylesheet" href="/css/admin-contacts-list.css">',
      descriptions: `<meta name="description" content="お問い合わせ管理画面">`,
    });
  } catch (err) {
    console.error("CONTACT error:", err);
    return res.render("admin/admin-contact", {
      contacts: [],
      error: "読み込みに失敗しました。",
      isAdmin: !!req.session.isAdmin,
      csrfToken: req.csrfToken(),
      titles: `<title>お問い合わせ一覧</title>`,
      styles: '<link rel="stylesheet" href="/css/admin-contacts-list.css">',
      descriptions: `<meta name="description" content="お問い合わせ管理画面">`,
    });
  }
});

// お問い合わせ詳細
adminRouter.get("/contacts-content/:id", csrfProtection, async (req, res) => {
  try {
    const id = req.params.id;

    // DBから1件取得
    const [rows] = await pool.query(
      "SELECT * FROM contact WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.render("admin/admin-contacts-content", {
        error: "指定された問い合わせが見つかりません。",
        contact: null,
        csrfToken: req.csrfToken(),
        styles: '<link rel="stylesheet" href="/css/admin-contacts-content.css">',
        titles: "<title>お問い合わせ詳細</title>",
        descriptions: '<meta name="description" content=""/>',
      });
    }

    const row = rows[0];

    // ステータスマッピング
    const statusMap = {
      0: { label: "未対応", class: "badge--open" },
      1: { label: "対応中", class: "badge--progress" },
      2: { label: "完了", class: "badge--done" },
    };
    const statusInfo = statusMap[row.status] || { label: "不明", class: "" };

    const contact = {
      ...row,
      statusLabel: statusInfo.label,
      statusClass: statusInfo.class,
      selected0: row.status === 0,
      selected1: row.status === 1,
      selected2: row.status === 2,
    };

    res.render("admin/admin-contacts-content", {
      contact,
      csrfToken: req.csrfToken(),
      styles: '<link rel="stylesheet" href="/css/admin-contacts-content.css">',
      titles: "<title>お問い合わせ詳細</title>",
      descriptions: '<meta name="description" content=""/>',
    });
  } catch (err) {
    console.error("CONTACT DETAIL error:", err);
    res.render("admin/admin-contacts-content", {
      error: "読み込みに失敗しました。",
      contact: null,
      csrfToken: req.csrfToken(),
      styles: '<link rel="stylesheet" href="/css/admin-contacts-content.css">',
      titles: "<title>お問い合わせ詳細</title>",
      descriptions: '<meta name="description" content=""/>',
    });
  }
});


// ログイン処理
app.post("/login", loginLimiter, csrfProtection, loginValidation, async (req, res) => {
    // バリデーションチェック
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render("login", {
        error: errors.array()[0].msg,
        csrfToken: req.csrfToken(),
        styles: '<link rel="stylesheet" href="/css/login.css">',
        titles: '<title>ログイン</title>',
        descriptions: '<meta name="description" content="">',
      });
    }

  const { employee_id, password } = req.body;
  try {
    // 1) ユーザー取得
    const [rows] = await pool.query(
      "SELECT id, password_hash, admin FROM users WHERE employee_id = ? LIMIT 1",
      [employee_id]
    );
    if (!rows.length) {
      return res.render("login", {
        error: "ID またはパスワードが違います。",
        csrfToken: req.csrfToken(),
        styles: '<link rel="stylesheet" href="/css/login.css">'
      });
    }
    const user = rows[0];

    // 2) パスワード照合
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render("login", {
        error: "ID またはパスワードが違います。",
        csrfToken: req.csrfToken(),
        styles: '<link rel="stylesheet" href="/css/login.css">'
      });
    }

    // 3) セッション作成 → 保存完了を待ってからリダイレクト
    req.session.regenerate((err) => {
      if (err) {
        console.error("session regenerate error:", err);
        return res.render("login", {
          error: "セッションエラーが発生しました。",
          csrfToken: req.csrfToken(),
          styles: '<link rel="stylesheet" href="/css/login.css">'
        });
      }
      req.session.uid = user.id;
      req.session.isAdmin = Number(user.admin) === 1;

      // ★ここが重要：保存完了後に redirect
      req.session.save((err2) => {
        if (err2) {
          console.error("session save error:", err2);
          return res.render("login", {
            error: "セッション保存に失敗しました。",
            csrfToken: req.csrfToken(),
            styles: '<link rel="stylesheet" href="/css/login.css">'
          });
        }
        return res.redirect("/admin");
      });
    });
  } catch (e) {
    console.error("login error:", e);
    return res.render("login", {
      error: "サーバーエラーが発生しました。",
      csrfToken: req.csrfToken(),
      styles: '<link rel="stylesheet" href="/css/login.css">'
    });
  }
});


// 一覧を再表示する時に使う小ヘルパー
function renderUserPage(res, req, { error, message } = {}) {
  pool.query(
    "SELECT id, employee_id, name, admin FROM users ORDER BY created_at DESC",
    (e, rows = []) => {
      res.render("admin/users", {
        users: e ? [] : rows,
        error: e ? "一覧の取得に失敗しました。" : error,
        message,
        csrfToken: req.csrfToken(),
        styles: '<link rel="stylesheet" href="/css/users.css">'
      });
    }
  );
}

// 社員追加（mysql2/promise 版）
adminRouter.post("/users", csrfProtection, /* requireAdmin, */ async (req, res) => {
  try {
    const { employee_id, name, password } = req.body;
    const admin = Number(req.body.admin) === 1 ? 1 : 0;

    if (!employee_id || !name || !password) {
      return renderUserPage(res, req, { error: "社員ID・氏名・パスワードは必須です。" });
    }

    const passwordHash = await bcrypt.hash(password, saltRounds);

    await pool.query(
      "INSERT INTO users (employee_id, name, admin, password_hash) VALUES (?, ?, ?, ?)",
      [employee_id.trim(), name.trim(), admin, passwordHash]
    );

    return res.redirect("/admin/users");
  } catch (err) {
    console.error("INSERT user error:", err);
    const msg =
      err && err.code === "ER_DUP_ENTRY"
        ? "その社員IDは既に登録されています。"
        : "登録に失敗しました。";
    return renderUserPage(res, req, { error: msg });
  }
});

// 社員更新（mysql2/promise 版）
adminRouter.post("/users/update", csrfProtection, /* requireAdmin, */ async (req, res) => {
  try {
    const { employee_id, name, password } = req.body;
    const admin = Number(req.body.admin) === 1 ? 1 : 0;

    if (!employee_id) {
      return renderUserPage(res, req, { error: "社員IDが必要です。" });
    }

    // 動的に SET 句を組み立て
    const fields = [];
    const params = [];

    if (name && name.trim()) {
      fields.push("name = ?");
      params.push(name.trim());
    }

    // admin は常に反映（チェックボックスやセレクトの変更を拾うため）
    fields.push("admin = ?");
    params.push(admin);

    if (password && password.length > 0) {
      const hash = await bcrypt.hash(password, saltRounds);
      fields.push("password_hash = ?");
      params.push(hash);
    }

    if (fields.length === 0) {
      return renderUserPage(res, req, { error: "更新する項目がありません。" });
    }

    params.push(employee_id.trim());

    const sql = `UPDATE users SET ${fields.join(", ")} WHERE employee_id = ?`;
    const [result] = await pool.query(sql, params);

    if (result.affectedRows === 0) {
      return renderUserPage(res, req, { error: "指定された社員IDが見つかりません。" });
    }

    return res.redirect("/admin/users");
  } catch (e) {
    console.error("UPDATE user error:", e);
    return renderUserPage(res, req, { error: "更新に失敗しました。" });
  }
});



// 社員削除　mysql2
adminRouter.post("/users/delete", csrfProtection, /* requireAdmin, */ async (req, res) => {
  const { employee_id } = req.body;
  if (!employee_id) return renderUserPage(res, req, { error: "社員IDが必要です。" });

  try {
    const [result] = await pool.query(
      "DELETE FROM users WHERE employee_id = ?",
      [employee_id.trim()]
    );
    if (result.affectedRows === 0) {
      return renderUserPage(res, req, { error: "指定された社員IDが見つかりません。" });
    }
    return res.redirect("/admin/users");
  } catch (err) {
    console.error("DELETE user error:", err);
    return renderUserPage(res, req, { error: "削除に失敗しました。" });
  }
});


// ブログ投稿 保存（mysql2/promise 版）
adminRouter.post("/newpost", csrfProtection, async (req, res) => {
  const { title, content } = req.body;
  const authorId = req.session.uid;              // ログイン時に入れてある想定
  const adminFlag = req.session.isAdmin ? 1 : 0; // セッションから

  if (!authorId) return res.redirect("/login"); // 念のため

  if (!title || !content) {
    return res.render("admin/posts-form", {
      error: "タイトルと本文は必須です。",
      isEdit: false,
      post: { title, content },
      submitLabel: "投稿する",
      action: "/admin/posts",
      csrfToken: req.csrfToken(),
      styles: '<link rel="stylesheet" href="/css/posts-form.css">',
    });
  }

  try {
    await pool.query(
      "INSERT INTO blog (author_id, title, content, admin) VALUES (?, ?, ?, ?)",
      [authorId, title.trim(), content, adminFlag]
    );
    return res.redirect("/admin/posts-list"); // 一覧へ
  } catch (err) {
    console.error("INSERT blog error:", err);
    return res.render("admin/posts-form", {
      error: "投稿の保存に失敗しました。",
      isEdit: false,
      post: { title, content },
      submitLabel: "投稿する",
      action: "/admin/posts",
      csrfToken: req.csrfToken(),
      styles: '<link rel="stylesheet" href="/css/posts-form.css">',
    });
  }
});

// ブログの削除：POST /admin/posts/:id/delete（mysql2/promise版）
adminRouter.post("/posts/:id/delete", csrfProtection, async (req, res) => {
  const postId = req.params.id;
  const uid = req.session.uid;
  const isAdmin = !!req.session.isAdmin;

  if (!uid) return res.redirect("/login");

  // 管理者は全件OK／一般は自分の投稿のみ
  const sql = isAdmin
    ? "DELETE FROM blog WHERE id = ?"
    : "DELETE FROM blog WHERE id = ? AND author_id = ?";

  const params = isAdmin ? [postId] : [postId, uid];

  try {
    const [result] = await pool.query(sql, params);

    // 対象なし（権限不足 or ID不一致など）
    if (result.affectedRows === 0) {
      // フラッシュ運用があればメッセージを入れてから redirect してね
      return res.redirect("/admin/posts-list");
    }

    // 成功
    return res.redirect("/admin/posts-list");
  } catch (err) {
    console.error("DELETE post error:", err);
    // ここもシンプルに一覧へ戻す（フラッシュ等があれば活用）
    return res.redirect("/admin/posts-list");
  }
});


// 投稿更新
adminRouter.post("/posts/:id/update", csrfProtection, async (req, res) => {
  const postId = req.params.id;
  const { title, content } = req.body;
  const uid = req.session.uid;
  const isAdmin = req.session.isAdmin;

  if (!uid) {
    return res.redirect("/login");
  }

  try {
    // 投稿を取得
    const [rows] = await pool.query("SELECT * FROM blog WHERE id = ?", [postId]);
    if (rows.length === 0) {
      return res.status(404).send("記事が存在しません");
    }
    const post = rows[0];

    // 権限チェック（管理者 or 自分の投稿ならOK）
    if (!isAdmin && post.author_id !== uid) {
      return res.status(403).send("権限がありません");
    }

    // 更新処理
    await pool.query(
      "UPDATE blog SET title = ?, content = ? WHERE id = ?",
      [title, content, postId]
    );

    console.log("記事を更新しました:", postId);
    res.redirect("/admin/posts-list"); // 更新後は一覧へ
  } catch (err) {
    console.error("UPDATE エラー:", err);
    res.render("admin/posts-form", {
      error: "投稿の更新に失敗しました。",
      post: { id: postId, title, content },
      mode: "edit",
      isAdmin,
      csrfToken: req.csrfToken(),
      styles: '<link rel="stylesheet" href="/css/posts-form.css">',
      submitLabel: "更新する",
      action: `/admin/posts/${postId}/update`,
    });
  }
});

// お問い合わせの対応ステータス更新
adminRouter.post("/contact/:id/status", csrfProtection, async (req, res) => {
  try {
    // 管理者のみ更新可（一般ユーザは閲覧のみを想定）
    if (!req.session.isAdmin) {
      return res.status(403).send("権限がありません");
    }

    const id = req.params.id;
    const status = Number(req.body.status);

    // 0=未対応, 1=対応中, 2=完了 のみ許可
    if (![0, 1, 2].includes(status)) {
      return res.status(400).send("無効なステータスです。");
    }

    const [result] = await pool.query(
      "UPDATE contact SET status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      // id 不正など
      return res.status(404).send("対象が見つかりません。");
    }

    // 直前のページに応じて戻り先を分岐（詳細 or 一覧）
    const ref = req.get("referer") || "";
    if (ref.includes(`/admin/contacts/${id}`)) {
      return res.redirect(`/admin/contacts-list`);
    }
    return res.redirect("/admin/contacts-list");
  } catch (err) {
    console.error("CONTACT STATUS UPDATE error:", err);
    return res.status(500).send("更新に失敗しました。");
  }
});






app.listen(port, '127.0.0.1', () => {
  console.log("サーバー起動中");
});