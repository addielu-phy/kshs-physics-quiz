/* ===========================================================
   雲端設定（Firebase）— 老師端集中收集全班成績用
   -----------------------------------------------------------
   專案：kh-physics-self-20260607（Firebase 主控台「Grade 11 Physics Self Study」）
   已依 projectId 預填 projectId / authDomain。

   ★ 還差 3 個值（只在「專案設定 → 你的應用程式 → SDK 設定與配置 → Config」看得到）：
       apiKey、messagingSenderId、appId
     填好這 3 格、把 enabled 改成 true，雲端就會啟用。
     （storageBucket 本站沒用到，留空也行；要填就照 console 那串。）
   把整段 firebaseConfig 丟給我，我也可以直接幫你填好、上線並登入驗證。
   ※ apiKey 等公開在前端是正常的，安全由 Firestore 安全規則把關。
   ※ 在 apiKey 補上之前，請維持 enabled:false——否則老師登入會失敗。
   =========================================================== */
window.CLOUD = {
  enabled: false,                                       // ← 三個密鑰值補齊後改成 true
  teacherEmail: "cylcphychem@gmail.com",                // ← 老師登入 Email；要用別的就改這裡（須與安全規則一致）
  config: {
    apiKey: "",                                         // ← 待填（SDK 設定，例："AIzaSy....."）
    authDomain: "kh-physics-self-20260607.firebaseapp.com",
    projectId: "kh-physics-self-20260607",
    storageBucket: "",                                  // ← 本站未用到，可留空；要填例："kh-physics-self-20260607.firebasestorage.app"
    messagingSenderId: "",                              // ← 待填（一串數字）
    appId: ""                                           // ← 待填（例："1:1234567890:web:abc..."）
  }
};
