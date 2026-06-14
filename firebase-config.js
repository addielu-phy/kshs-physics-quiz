/* ===========================================================
   雲端設定（Firebase）— 老師端集中收集全班成績用
   -----------------------------------------------------------
   還沒設定前，enabled 維持 false：學生網站照常運作（成績只存本機），
   老師後台會顯示「尚未設定雲端」。
   設定步驟見 FIREBASE_SETUP.md。

   ★ 只要做兩件事就會啟用：
     (1) 把下面 config 的 6 個值，換成 Firebase 主控台「專案設定 →
         你的應用程式 → SDK 設定與配置」裡那段 firebaseConfig 的對應值。
         （每個 key 名稱一模一樣，照著貼即可。）
     (2) 填好 teacherEmail，並把 enabled 改成 true。
   把整段 firebaseConfig 連同老師 Email 丟給我，我也可以直接幫你填好上線。
   ※ apiKey 等公開在前端是正常的，安全由 Firestore 安全規則把關。
   =========================================================== */
window.CLOUD = {
  enabled: false,                 // ← 全部填好後改成 true，學生端才會開始上傳
  teacherEmail: "",               // ← 老師登入用 Email，例：cylcphychem@gmail.com（要與安全規則內的 Email 完全一致）
  config: {
    apiKey: "",                   // ← 例："AIzaSyD....."
    authDomain: "",               // ← 例："你的專案ID.firebaseapp.com"
    projectId: "",                // ← 例："kshs-phy-quiz"
    storageBucket: "",            // ← 例："你的專案ID.appspot.com"
    messagingSenderId: "",        // ← 例："1234567890"（一串數字）
    appId: ""                     // ← 例："1:1234567890:web:abc123..."
  }
};
