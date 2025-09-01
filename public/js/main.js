// ヘッダーのスクロール→背景変化
window.addEventListener("scroll", () => {
    // PC用
    const pcHeader = document.querySelector(".site-header");
    if (window.scrollY > 70) { // 70px以上スクロールしたら
        pcHeader.classList.add("scrolled");
    } else {
        pcHeader.classList.remove("scrolled");
    }
    // スマホ用
    const mobileHeader = document.querySelector(".mobile-header");
    if (window.scrollY > 70) { // 70px以上スクロールしたら
        mobileHeader.classList.add("scrolled");
    } else {
        mobileHeader.classList.remove("scrolled");
    }
});    