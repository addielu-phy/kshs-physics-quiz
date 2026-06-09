/* ===========================================================
   物理自學評量 — 主程式
   功能：學生登錄 → 作答 → 自動評分 → 錯題與單元分析＋詳解 → 重複練習
   支援：A–E 五選項、單選 / 多選題（指考型，全部選對才得分）、每題不同配分
   資料全部存在瀏覽器 localStorage（離線可用，換裝置不共用）
   =========================================================== */
"use strict";

const STORE = "kshsphy_v1";
const LETTERS = ["A", "B", "C", "D", "E"];
const app = document.getElementById("app");

/* ---------- localStorage 讀寫 ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { profiles: {}, last: "" }; }
  catch (e) { return { profiles: {}, last: "" }; }
}
function save(db) { localStorage.setItem(STORE, JSON.stringify(db)); }
function getProfile(name) {
  const db = load();
  if (!db.profiles[name]) { db.profiles[name] = { created: Date.now(), attempts: [] }; save(db); }
  return db.profiles[name];
}

/* ---------- 題目工具：配分、答案判定（支援多選） ---------- */
function qById(id) { return QUESTIONS.find(q => q.id === id); }
function qPoints(q) { return q && q.p != null ? q.p : (QUIZ_META.perScore || 4); }
function maxScoreOf(ids) { return ids.reduce((s, id) => s + qPoints(qById(id)), 0); }
function arrEq(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const x = a.slice().sort((p, q) => p - q), y = b.slice().sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}
function answered(ans, q) {
  if (ans === undefined || ans === null) return false;
  if (q.multi) return Array.isArray(ans) && ans.length > 0;
  return true;
}
function isCorrect(q, ans) {
  if (!answered(ans, q)) return false;
  if (q.multi) return arrEq(ans, q.a);
  return ans === q.a;
}
/* 得分：單選＝全有或全無；多選＝分科型部分給分（每選項各自判定，
   與標準答案一致 +題分/選項數、不一致倒扣同值，最低 0 分） */
function scoreOf(q, ans) {
  const full = qPoints(q);
  if (!answered(ans, q)) return 0;
  if (!q.multi) return ans === q.a ? full : 0;
  const n = q.o.length, per = full / n;
  let consistent = 0;
  for (let i = 0; i < n; i++) {
    const should = q.a.includes(i);
    const did = Array.isArray(ans) && ans.includes(i);
    if (should === did) consistent++;
  }
  const raw = (consistent - (n - consistent)) * per; // 對的減錯的
  return Math.max(0, Math.round(raw * 100) / 100);
}
/* 顯示用狀態：right=全對、partial=多選部分對、wrong=錯/未作答 */
function gradeOf(q, ans) {
  const pts = scoreOf(q, ans);
  if (isCorrect(q, ans)) return { state: "right", pts };
  if (q.multi && pts > 0) return { state: "partial", pts };
  return { state: "wrong", pts };
}
function fmtPts(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
function ansLetters(q) {
  if (q.multi) return q.a.slice().sort((a, b) => a - b).map(i => LETTERS[i]).join("、");
  return LETTERS[q.a];
}
/* 顯示用：把使用者輸入的名字做 HTML escape，避免 < > & 破版 */
function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---------- 雲端同步（Firebase，未設定時自動略過） ---------- */
function cloudOn() { return !!(window.CLOUD && CLOUD.enabled && typeof firebase !== "undefined" && CLOUD.config && CLOUD.config.projectId); }
function cloudInit() { if (cloudOn() && !firebase.apps.length) firebase.initializeApp(CLOUD.config); }
function cloudPayload(att, name) {
  return {
    name: name, mode: att.mode, attemptNo: att.n,
    score: att.score, maxScore: att.maxScore, correct: att.correct, total: att.total,
    ids: att.ids, wrongIds: att.wrongIds, durationSec: att.durationSec,
    clientTime: att.date
  };
}
async function cloudSendOne(p) {
  cloudInit();
  await firebase.firestore().collection("results").add(
    Object.assign({}, p, { ts: firebase.firestore.FieldValue.serverTimestamp() }));
}
function queueAdd(p) { const db = load(); (db.pending = db.pending || []).push(p); save(db); }
function setCloudStatus(txt, cls) {
  const el = document.getElementById("cloudStatus");
  if (!el) return;
  el.style.display = "inline-block";
  el.textContent = txt; el.className = "chip " + (cls || "");
}
async function cloudPush(att, name) {
  if (!cloudOn()) return;
  const p = cloudPayload(att, name);
  setCloudStatus("雲端上傳中…", "");
  try { await cloudSendOne(p); setCloudStatus("✓ 已上傳到老師端", "good"); }
  catch (e) { console.warn("cloud save failed", e); queueAdd(p); setCloudStatus("離線，已暫存，稍後自動補傳", "bad"); }
}
async function flushPending() {
  if (!cloudOn()) return;
  const list = (load().pending || []).slice();
  if (!list.length) return;
  const remain = [];
  for (const p of list) { try { await cloudSendOne(p); } catch (e) { remain.push(p); } }
  const db = load(); db.pending = remain; save(db);
}

/* ---------- 工具 ---------- */
const esc = s => String(s);
function fmtDate(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
function modeLabel(m) { return m === "practice" ? "隨手練習" : m === "wrong" ? "錯題練習" : "全卷測驗"; }
const ASSET_VER = "20260609c"; // 改圖後更新此值即可破除瀏覽器快取
function figuresHTML(q) {
  if (!q.img) return "";
  return `<div class="figure">` +
    q.img.map(src => { const u = src + "?v=" + ASSET_VER;
      return `<img src="${u}" loading="lazy" alt="第${q.id}題附圖" onclick="zoom('${u}')">`; }).join("") +
    `<div class="figcap">點圖可放大</div></div>`;
}
function multiHint(q) {
  return q.multi
    ? `<div class="chip warn" style="margin-bottom:10px">✦ 多選題（${qPoints(q)} 分）：可選多個答案，<b>答對的選項得分、答錯倒扣</b>（最低 0 分）</div>`
    : "";
}

/* ---------- 燈箱（放大圖） ---------- */
const lb = document.getElementById("lightbox");
const lbimg = document.getElementById("lbimg");
window.zoom = src => { lbimg.src = src; lb.classList.add("on"); };
lb.onclick = () => lb.classList.remove("on");

/* ---------- 全域狀態 ---------- */
let session = null; // 作答中的狀態

/* ========================================================
   1) 登錄畫面
   ======================================================== */
function viewLogin() {
  const db = load();
  const names = Object.keys(db.profiles);
  const list = names.length ? `
    <hr class="sep">
    <label class="lbl">曾經練習過的學生（點選即可繼續）</label>
    <div class="row">
      ${names.map(n => `<button class="btn sm" onclick="enter('${encodeURIComponent(n)}')">👤 ${escHtml(n)}
        <span class="muted small">（${db.profiles[n].attempts.length} 次）</span></button>`).join("")}
    </div>` : "";

  app.innerHTML = `
    <div class="brand"><div class="logo">物</div>
      <div><h1>物理自學評量</h1>
      <div class="sub">${QUIZ_META.grade}・${QUIZ_META.subject}</div></div>
    </div>
    <div class="card">
      <h3>歡迎！先登錄你的名字</h3>
      <p class="muted small">名字用來記錄你的作答與成績（只存在這台裝置的瀏覽器，不會上傳）。</p>
      <label class="lbl" for="nm">你的名字 / 暱稱</label>
      <input type="text" id="nm" placeholder="例如：小明" maxlength="20"
        onkeydown="if(event.key==='Enter')startLogin()">
      <div style="height:12px"></div>
      <button class="btn primary block" onclick="startLogin()">開始練習 →</button>
      ${list}
    </div>
    <div class="card tight">
      <div class="spread">
        <div><b>本卷</b><div class="muted small">${QUIZ_META.school}</div>
          <div class="muted small">${QUIZ_META.title}</div></div>
        <div class="center"><div class="qno">${QUESTIONS.length}</div><div class="muted small">題・滿分 ${QUIZ_META.total}</div></div>
      </div>
    </div>
    <div class="foot">${QUIZ_META.note || "題目來源：學校官方公開歷屆試題，僅供自學練習。"}<br>成績資料儲存在本機瀏覽器，清除瀏覽資料會一併刪除。</div>
  `;
  const inp = document.getElementById("nm");
  if (db.last) inp.value = db.last;
  inp.focus();
}
window.startLogin = function () {
  const name = document.getElementById("nm").value.trim();
  if (!name) { alert("請先輸入名字喔！"); return; }
  const db = load(); db.last = name; save(db);
  getProfile(name);
  viewDashboard(name);
};
window.enter = function (enc) { const name = decodeURIComponent(enc); const db = load(); db.last = name; save(db); viewDashboard(name); };

/* ========================================================
   2) 個人首頁 / 儀表板
   ======================================================== */
function viewDashboard(name) {
  const prof = getProfile(name);
  const atts = prof.attempts;
  const last = atts[atts.length - 1];

  // 練習紀錄
  let history = `<p class="muted">還沒有紀錄，開始第一次練習吧！</p>`;
  if (atts.length) {
    history = atts.map((a, i) => {
      // 只與「同一種練習模式」的上一次比較，避免隨手練習與正式測驗混在一起
      const prev = atts.slice(0, i).reverse().find(x => x.mode === a.mode) || null;
      let delta = "";
      if (prev) {
        const d = pct(a) - pct(prev);
        delta = d === 0 ? `<span class="muted small">與上次同模式持平</span>`
          : `<span class="delta ${d > 0 ? "up" : "down"}" title="與上一次${modeLabel(a.mode)}相比">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%</span>`;
      }
      return `<div class="att">
        <div class="badge">${a.score}</div>
        <div class="grow">
          <b>第 ${a.n} 次</b> <span class="chip">${modeLabel(a.mode)}</span> ${delta}
          <div class="muted small">答對 ${a.correct}/${a.total} 題・用時 ${fmtDur(a.durationSec)}・${fmtDate(a.date)}</div>
        </div>
        <button class="btn sm" onclick="viewResult('${encodeURIComponent(name)}',${i})">看解析</button>
      </div>`;
    }).reverse().join("");
  }

  // 弱點單元（依最近一次）
  let weak = "";
  if (last) {
    const bu = byUnit(last);
    const weakUnits = Object.entries(bu).filter(([, v]) => v.correct / v.total < 0.6)
      .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));
    if (weakUnits.length) {
      weak = `<div class="card"><h3>⚠️ 最近一次的弱點單元</h3>
        <div class="row">${weakUnits.map(([u, v]) =>
          `<span class="chip bad">${u}　${v.correct}/${v.total}</span>`).join("")}</div>
        <p class="muted small" style="margin-top:8px">建議用下方「只練我的錯題」加強，或重做全卷檢驗進步。</p></div>`;
    }
  }

  const wrongCount = last ? last.wrongIds.length : 0;

  app.innerHTML = `
    <div class="spread">
      <div class="brand"><div class="logo">物</div>
        <div><h1>${escHtml(name)} 的練習室</h1><div class="sub">${QUIZ_META.grade}・${QUIZ_META.subject}</div></div>
      </div>
      <button class="btn sm ghost" onclick="viewLogin()">切換 / 登出</button>
    </div>

    <div class="card">
      <h3>選擇練習方式</h3>
      <p class="muted small">${QUIZ_META.school}　${QUIZ_META.title}（${QUESTIONS.length} 題・滿分 ${QUIZ_META.total}）</p>
      <div class="modegrid">
        <button class="modecard p" onclick="startPractice('${encodeURIComponent(name)}')">
          <div class="mi">⚡</div>
          <div class="mt">隨手練習</div>
          <div class="md">一題一題作答，<b>選完馬上看對錯</b>，答錯立刻顯示詳解。題目會隨機洗牌，輕鬆學、隨時練。</div>
        </button>
        <button class="modecard" onclick="startQuiz('${encodeURIComponent(name)}','full')">
          <div class="mi">📝</div>
          <div class="mt">正式測驗</div>
          <div class="md">整卷作答，最後一次<b>評分</b>並提供<b>單元診斷</b>與逐題詳解，可比較歷次進步。像在考試。</div>
        </button>
      </div>
      ${wrongCount ? `<button class="btn accent block" style="margin-top:12px" onclick="startQuiz('${encodeURIComponent(name)}','wrong')">🎯 只練我的錯題（${wrongCount} 題・正式評分）</button>` : ""}
    </div>

    ${weak}

    <div class="card">
      <h3>練習紀錄 ${atts.length ? `<span class="muted small">（共 ${atts.length} 次）</span>` : ""}</h3>
      ${atts.length >= 2 ? trendBars(atts) : ""}
      ${history}
    </div>
    <div class="foot">資料儲存在本機瀏覽器。</div>
  `;
}
function pct(a) { return Math.round(a.correct / a.total * 100); }
function trendBars(atts) {
  const max = 100;
  return `<div class="row" style="align-items:flex-end;gap:8px;height:84px;margin:4px 0 14px">
    ${atts.map(a => {
      const h = Math.max(6, Math.round(pct(a) / max * 72));
      return `<div class="center" style="flex:1;min-width:24px">
        <div class="small" style="color:var(--accent2);font-weight:700">${a.score}</div>
        <div style="height:${h}px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,var(--accent),var(--accent2))"></div>
        <div class="muted small">${a.n}</div></div>`;
    }).join("")}
  </div><div class="muted small center" style="margin-top:-8px">各次得分趨勢</div>`;
}

/* ========================================================
   3) 作答畫面（正式測驗 / 錯題練習）
   ======================================================== */
window.startQuiz = function (enc, mode) {
  const name = decodeURIComponent(enc);
  const prof = getProfile(name);
  let ids;
  if (mode === "wrong") {
    const last = prof.attempts[prof.attempts.length - 1];
    ids = (last ? last.wrongIds : []).slice();
    if (!ids.length) { alert("目前沒有錯題可練，先做一次全卷吧！"); return; }
  } else {
    ids = QUESTIONS.map(q => q.id);
  }
  session = { name, mode, ids, idx: 0, answers: {}, start: Date.now() };
  renderQuestion();
};

function renderQuestion() {
  const s = session;
  const id = s.ids[s.idx];
  const q = qById(id);
  const total = s.ids.length;
  const answeredN = s.ids.filter(qid => answered(s.answers[qid], qById(qid))).length;
  const cur = s.answers[id];

  const opts = q.o.map((txt, i) => {
    const on = q.multi ? (Array.isArray(cur) && cur.includes(i)) : cur === i;
    return `<button class="opt${on ? " sel" : ""}" onclick="pick(${i})">
      <span class="k">${LETTERS[i]}</span><span>${q.oi ? "選項 " + LETTERS[i] + "（見上方圖）" : txt}</span>${q.multi && on ? '<span class="mk">已選</span>' : ""}</button>`;
  }).join("");

  const nav = s.ids.map((qid, i) => {
    let c = "";
    if (i === s.idx) c += " cur";
    if (answered(s.answers[qid], qById(qid))) c += " done";
    return `<button class="${c.trim()}" onclick="goto(${i})">${i + 1}</button>`;
  }).join("");

  app.innerHTML = `
    <div class="spread">
      <div><b>${s.mode === "wrong" ? "錯題練習" : "全卷測驗"}</b>
        <span class="muted small">　${escHtml(s.name)}</span></div>
      <button class="btn sm ghost" onclick="quitQuiz()">離開</button>
    </div>
    <div class="card tight">
      <div class="spread" style="margin-bottom:8px">
        <span class="muted small">第 ${s.idx + 1} / ${total} 題</span>
        <span class="muted small">已作答 ${answeredN} / ${total}</span>
      </div>
      <div class="pbar"><span style="width:${answeredN / total * 100}%"></span></div>
    </div>

    <div class="card">
      <div class="qhead">
        <span class="qno">${q.id}.</span>
        <span class="chip unit">${q.u}</span>
        <span class="chip">${qPoints(q)} 分</span>
      </div>
      ${multiHint(q)}
      ${q.oi ? figuresHTML(q) : ""}
      <div class="stem">${q.s}</div>
      ${q.oi ? "" : figuresHTML(q)}
      <div class="opts">${opts}</div>
    </div>

    <div class="card tight">
      <label class="lbl">題號導覽（藍色＝已作答）</label>
      <div class="nav-grid">${nav}</div>
    </div>

    <div class="qbar">
      <div class="row">
        <button class="btn" onclick="prev()" ${s.idx === 0 ? "disabled" : ""}>← 上一題</button>
        ${s.idx < total - 1
          ? `<button class="btn primary grow" style="flex:1" onclick="next()">下一題 →</button>`
          : `<button class="btn accent grow" style="flex:1" onclick="submitQuiz()">✅ 交卷看成績</button>`}
      </div>
      ${s.idx === total - 1 ? "" : `<button class="btn ghost sm block" style="margin-top:8px" onclick="submitQuiz()">提早交卷</button>`}
    </div>
  `;
  window.scrollTo(0, 0);
}
window.pick = function (i) {
  const s = session, id = s.ids[s.idx], q = qById(id);
  if (q.multi) {
    let cur = Array.isArray(s.answers[id]) ? s.answers[id].slice() : [];
    const k = cur.indexOf(i);
    if (k >= 0) cur.splice(k, 1); else cur.push(i);
    if (cur.length) s.answers[id] = cur; else delete s.answers[id];
    renderQuestion(); // 多選：停留本題繼續勾選
  } else {
    s.answers[id] = i;
    if (s.idx < s.ids.length - 1) { s.idx++; renderQuestion(); } else renderQuestion();
  }
};
window.next = function () { if (session.idx < session.ids.length - 1) { session.idx++; renderQuestion(); } };
window.prev = function () { if (session.idx > 0) { session.idx--; renderQuestion(); } };
window.goto = function (i) { session.idx = i; renderQuestion(); };
window.quitQuiz = function () {
  if (confirm("離開後這次作答不會被記錄，確定離開？")) { const n = session.name; session = null; viewDashboard(n); }
};
window.submitQuiz = function () {
  const left = session.ids.filter(id => !answered(session.answers[id], qById(id))).length;
  if (left > 0 && !confirm(`還有 ${left} 題沒作答（將以未作答計為錯）。確定交卷？`)) return;
  const s = session;
  let correct = 0, score = 0; const wrongIds = [];
  s.ids.forEach(id => {
    const q = qById(id);
    score += scoreOf(q, s.answers[id]);
    if (isCorrect(q, s.answers[id])) correct++; else wrongIds.push(id);
  });
  score = Math.round(score * 100) / 100;
  const db = load();
  getProfile(s.name);
  const list = (db.profiles[s.name] || (db.profiles[s.name] = { created: Date.now(), attempts: [] })).attempts;
  const attempt = {
    n: list.length + 1,
    mode: s.mode,
    date: Date.now(),
    ids: s.ids.slice(),
    answers: Object.assign({}, s.answers),
    correct,
    total: s.ids.length,
    score,
    maxScore: maxScoreOf(s.ids),
    wrongIds,
    durationSec: Math.max(1, Math.round((Date.now() - s.start) / 1000))
  };
  list.push(attempt);
  save(db);
  const name = s.name, newIndex = list.length - 1;
  session = null;
  viewResult(encodeURIComponent(name), newIndex);
  cloudPush(attempt, name);
};

/* ========================================================
   4) 成績 / 解析畫面
   ======================================================== */
function byUnit(att) {
  const m = {};
  att.ids.forEach(id => {
    const q = qById(id);
    if (!m[q.u]) m[q.u] = { correct: 0, total: 0, wrong: [] };
    m[q.u].total++;
    if (isCorrect(q, att.answers[id])) m[q.u].correct++; else m[q.u].wrong.push(id);
  });
  return m;
}

let reviewFilter = "all";
window.viewResult = function (enc, index) {
  const name = decodeURIComponent(enc);
  const prof = getProfile(name);
  const att = prof.attempts[index];
  if (!att) { viewDashboard(name); return; }
  reviewFilter = "all";
  renderResult(name, index);
};

function renderResult(name, index) {
  const prof = getProfile(name);
  const att = prof.attempts[index];
  const p = pct(att);
  const bu = byUnit(att);
  const maxScore = att.maxScore != null ? att.maxScore : att.total * (QUIZ_META.perScore || 4);

  // 與上一次（同模式）的比較
  let cmp = "";
  const prevFull = prof.attempts.slice(0, index).reverse().find(a => a.mode === att.mode);
  if (prevFull) {
    const d = p - pct(prevFull);
    cmp = `<div class="kpi"><div class="b">
      <div class="n" style="color:${d > 0 ? "var(--good)" : d < 0 ? "var(--bad)" : "var(--soft)"}">
        ${d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}${d === 0 ? "持平" : Math.abs(d) + "%"}</div>
      <div class="t">與上一次${att.mode === "wrong" ? "錯題練習" : "全卷"}相比</div></div></div>`;
  }

  const grade = p >= 90 ? "太強了！" : p >= 80 ? "很不錯！" : p >= 60 ? "再加把勁～" : "別灰心，從錯題開始補！";

  // 單元診斷表（正確率低的排前面）
  const rows = Object.entries(bu).sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
    .map(([u, v]) => {
      const r = Math.round(v.correct / v.total * 100);
      const col = r >= 80 ? "var(--good)" : r >= 60 ? "var(--warn)" : "var(--bad)";
      return `<tr>
        <td>${u} ${r < 60 ? '<span class="chip bad small">弱點</span>' : ""}</td>
        <td class="r">${v.correct}/${v.total}</td>
        <td><div class="minibar"><span style="width:${r}%;background:${col}"></span></div></td>
        <td class="r" style="color:${col};font-weight:700">${r}%</td>
      </tr>`;
    }).join("");

  // 逐題檢討
  const showIds = reviewFilter === "wrong" ? att.wrongIds : att.ids;
  const review = showIds.length ? showIds.map(id => {
    const q = qById(id);
    const my = att.answers[id];
    const g = gradeOf(q, my);
    const itemCls = g.state === "right" ? "ok" : g.state === "partial" ? "pt" : "ng";
    const chipCls = g.state === "right" ? "good" : g.state === "partial" ? "warn" : "bad";
    const chipTxt = g.state === "right" ? "✓ 答對"
      : g.state === "partial" ? `◐ 部分對 ${fmtPts(g.pts)}/${qPoints(q)} 分` : "✗ 答錯";
    const opts = q.o.map((txt, i) => {
      const isAns = q.multi ? q.a.includes(i) : i === q.a;
      const isMy = q.multi ? (Array.isArray(my) && my.includes(i)) : i === my;
      let cls = "opt";
      if (isAns) cls += " correct";
      else if (isMy) cls += " wrong";
      const mk = isAns ? "正解" : (isMy ? "你選的" : "");
      return `<div class="${cls}"><span class="k">${LETTERS[i]}</span>
        <span>${q.oi ? "選項 " + LETTERS[i] : txt}</span>${mk ? `<span class="mk">${mk}</span>` : ""}</div>`;
    }).join("");
    return `<div class="review-item ${itemCls}">
      <div class="qhead">
        <span class="qno">${q.id}.</span>
        <span class="chip ${chipCls}">${chipTxt}</span>
        <span class="chip unit">${q.u}</span>
        ${q.multi ? '<span class="chip warn">多選</span>' : ""}
        ${!answered(my, q) ? '<span class="chip">未作答</span>' : ""}
      </div>
      <div class="stem">${q.s}</div>
      ${figuresHTML(q)}
      <div class="opts">${opts}</div>
      <div class="ansline"><b>正解：</b>${ansLetters(q)}${q.multi ? ` <span class="muted small">（你得 ${fmtPts(g.pts)} / ${qPoints(q)} 分）</span>` : ""}</div>
      <div class="expl"><b>💡 詳解：</b>${q.e}</div>
    </div>`;
  }).join("") : `<p class="muted center">這次全部答對，沒有錯題 🎉</p>`;

  app.innerHTML = `
    <div class="spread">
      <div class="brand"><div class="logo">物</div>
        <div><h1>成績與解析</h1><div class="sub">${escHtml(name)}・第 ${att.n} 次・${modeLabel(att.mode)}</div></div></div>
      <button class="btn sm ghost" onclick="viewDashboard('${encodeURIComponent(name)}')">回首頁</button>
    </div>

    <div class="card center">
      <div class="muted small">得分</div>
      <div class="score-big">${att.score}<span style="font-size:1.2rem;color:var(--muted)"> / ${maxScore}</span></div>
      <div style="margin:6px 0 2px">${grade}</div>
      <div class="kpi">
        <div class="b"><div class="n">${att.correct}/${att.total}</div><div class="t">答對題數</div></div>
        <div class="b"><div class="n">${p}%</div><div class="t">正確率</div></div>
        <div class="b"><div class="n">${att.wrongIds.length}</div><div class="t">錯題數</div></div>
        <div class="b"><div class="n" style="font-size:1.1rem">${fmtDur(att.durationSec)}</div><div class="t">作答用時</div></div>
      </div>
      ${cmp}
      <div style="margin-top:10px"><span id="cloudStatus" class="chip" style="display:none"></span></div>
    </div>

    <div class="card">
      <h3>📊 單元診斷</h3>
      <table class="diag">
        <tr><th>單元</th><th class="r">答對</th><th>掌握度</th><th class="r">正確率</th></tr>
        ${rows}
      </table>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">📝 逐題檢討</h3>
        <div class="row">
          <button class="btn sm ${reviewFilter === "all" ? "primary" : "ghost"}" onclick="setFilter('${encodeURIComponent(name)}',${index},'all')">全部</button>
          <button class="btn sm ${reviewFilter === "wrong" ? "primary" : "ghost"}" onclick="setFilter('${encodeURIComponent(name)}',${index},'wrong')">只看錯題（${att.wrongIds.length}）</button>
        </div>
      </div>
      ${review}
    </div>

    <div class="card">
      <h3>接下來</h3>
      <div class="row">
        <button class="btn primary" onclick="startQuiz('${encodeURIComponent(name)}','full')">🔁 再練一次全卷</button>
        ${att.wrongIds.length ? `<button class="btn accent" onclick="startWrongFrom('${encodeURIComponent(name)}',${index})">🎯 只練這次的錯題（${att.wrongIds.length}）</button>` : ""}
        <button class="btn ghost" onclick="viewDashboard('${encodeURIComponent(name)}')">回首頁</button>
      </div>
    </div>
    <div class="foot">第二次、第三次練習都會分別記錄，可在首頁比較進步幅度。</div>
  `;
  window.scrollTo(0, 0);
}
window.setFilter = function (enc, index, f) { reviewFilter = f; renderResult(decodeURIComponent(enc), index); };
window.startWrongFrom = function (enc, index) {
  const name = decodeURIComponent(enc);
  const att = getProfile(name).attempts[index];
  const ids = att.wrongIds.slice();
  if (!ids.length) { alert("沒有錯題！"); return; }
  session = { name, mode: "wrong", ids, idx: 0, answers: {}, start: Date.now() };
  renderQuestion();
};

/* ========================================================
   5) 隨手練習（即時對答案 + 錯題即時詳解）
   ======================================================== */
window.startPractice = function (enc, ids) {
  const name = decodeURIComponent(enc);
  ids = (ids && ids.length) ? ids.slice() : QUESTIONS.map(q => q.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } // 洗牌
  session = { name, mode: "practice", ids, idx: 0, answers: {}, revealed: false, start: Date.now() };
  renderPractice();
};

function renderPractice() {
  const s = session, id = s.ids[s.idx], q = qById(id), total = s.ids.length;
  const answeredCount = Object.keys(s.answers).length;
  const correctCount = s.ids.filter(qid => isCorrect(qById(qid), s.answers[qid])).length;
  const my = s.answers[id], revealed = s.revealed;
  const g = revealed ? gradeOf(q, my) : null;

  const opts = q.o.map((txt, i) => {
    let cls = "opt";
    const isAns = q.multi ? q.a.includes(i) : i === q.a;
    const isMy = q.multi ? (Array.isArray(my) && my.includes(i)) : my === i;
    if (revealed) { if (isAns) cls += " correct"; else if (isMy) cls += " wrong"; }
    else if (isMy) cls += " sel";
    const mk = revealed ? (isAns ? "正解" : (isMy ? "你選的" : "")) : (isMy && q.multi ? "已選" : "");
    const handler = revealed ? "" : `onclick="answerPractice(${i})"`;
    return `<button class="${cls}" ${handler} ${revealed ? 'disabled style="cursor:default;opacity:1"' : ""}>
      <span class="k">${LETTERS[i]}</span><span>${q.oi ? "選項 " + LETTERS[i] + "（見上方圖）" : txt}</span>${mk ? `<span class="mk">${mk}</span>` : ""}</button>`;
  }).join("");

  let feedback = "";
  if (revealed) {
    const cls = g.state === "right" ? "good" : g.state === "partial" ? "warn" : "bad";
    const border = g.state === "right" ? "var(--good)" : g.state === "partial" ? "var(--warn)" : "var(--bad)";
    const txt = g.state === "right" ? "✓ 答對了！"
      : g.state === "partial" ? `◐ 部分對：得 ${fmtPts(g.pts)} / ${qPoints(q)} 分，正解是 ${ansLetters(q)}`
      : "✗ 答錯了，正解是 " + ansLetters(q);
    feedback = `
    <div class="card tight" style="border-color:${border}">
      <div class="qhead"><span class="chip ${cls}">${txt}</span></div>
      <div class="expl"><b>💡 詳解：</b>${q.e}</div>
    </div>`;
  }

  let controls;
  if (!revealed) {
    controls = q.multi
      ? `<button class="btn primary block" onclick="confirmPractice()" ${answered(my, q) ? "" : "disabled"}>✓ 確認作答（多選）</button>
         <p class="muted small center" style="margin:6px 0">可選多個答案，選好後按「確認作答」看對錯與詳解</p>`
      : `<p class="muted small center" style="margin:6px 0">點一個答案，立刻看對錯與詳解</p>`;
  } else {
    controls = s.idx < total - 1
      ? `<button class="btn primary block" onclick="nextPractice()">下一題 →</button>`
      : `<button class="btn accent block" onclick="finishPractice()">看練習結果 →</button>`;
  }

  app.innerHTML = `
    <div class="spread">
      <div><b>⚡ 隨手練習</b><span class="muted small">　${escHtml(s.name)}</span></div>
      <button class="btn sm ghost" onclick="quitPractice()">離開</button>
    </div>
    <div class="card tight">
      <div class="spread" style="margin-bottom:8px">
        <span class="muted small">第 ${s.idx + 1} / ${total} 題</span>
        <span class="muted small">答對 ${correctCount} / 已答 ${answeredCount}</span>
      </div>
      <div class="pbar"><span style="width:${(s.idx + (revealed ? 1 : 0)) / total * 100}%"></span></div>
    </div>
    <div class="card">
      <div class="qhead"><span class="qno">${q.id}.</span><span class="chip unit">${q.u}</span><span class="chip">${qPoints(q)} 分</span></div>
      ${multiHint(q)}
      ${q.oi ? figuresHTML(q) : ""}
      <div class="stem">${q.s}</div>
      ${q.oi ? "" : figuresHTML(q)}
      <div class="opts">${opts}</div>
    </div>
    ${feedback}
    <div class="qbar">${controls}</div>
  `;
  window.scrollTo(0, 0);
}
window.answerPractice = function (i) {
  const s = session, id = s.ids[s.idx], q = qById(id);
  if (s.revealed) return;
  if (q.multi) {
    let cur = Array.isArray(s.answers[id]) ? s.answers[id].slice() : [];
    const k = cur.indexOf(i);
    if (k >= 0) cur.splice(k, 1); else cur.push(i);
    if (cur.length) s.answers[id] = cur; else delete s.answers[id];
    renderPractice();
  } else {
    s.answers[id] = i; s.revealed = true; renderPractice();
  }
};
window.confirmPractice = function () {
  const s = session, id = s.ids[s.idx], q = qById(id);
  if (!answered(s.answers[id], q)) return;
  s.revealed = true; renderPractice();
};
window.nextPractice = function () { session.idx++; session.revealed = false; renderPractice(); };
window.quitPractice = function () { if (confirm("離開隨手練習？這次練習不會被記錄。")) { const n = session.name; session = null; viewDashboard(n); } };
window.finishPractice = function () {
  const s = session; let correct = 0, score = 0; const wrongIds = [];
  s.ids.forEach(id => { const q = qById(id); score += scoreOf(q, s.answers[id]); if (isCorrect(q, s.answers[id])) correct++; else wrongIds.push(id); });
  score = Math.round(score * 100) / 100;
  wrongIds.sort((a, b) => a - b);
  const db = load(); getProfile(s.name);
  const list = (db.profiles[s.name] || (db.profiles[s.name] = { created: Date.now(), attempts: [] })).attempts;
  const attempt = {
    n: list.length + 1, mode: "practice", date: Date.now(),
    ids: s.ids.slice(), answers: Object.assign({}, s.answers),
    correct, total: s.ids.length, score, maxScore: maxScoreOf(s.ids), wrongIds,
    durationSec: Math.max(1, Math.round((Date.now() - s.start) / 1000))
  };
  list.push(attempt); save(db);
  const name = s.name; session = null;
  renderPracticeSummary(name, attempt);
  cloudPush(attempt, name);
};
function renderPracticeSummary(name, att) {
  const p = Math.round(att.correct / att.total * 100);
  const wrong = att.wrongIds.map(id => {
    const q = qById(id);
    const ansTxt = q.oi ? "見圖選項" : (q.multi ? q.a.slice().sort((a, b) => a - b).map(i => q.o[i]).join("、") : q.o[q.a]);
    return `<div class="review-item ng">
      <div class="qhead"><span class="qno">${q.id}.</span><span class="chip bad">✗ 當時答錯</span><span class="chip unit">${q.u}</span>${q.multi ? '<span class="chip warn">多選</span>' : ""}</div>
      <div class="stem">${q.s}</div>${figuresHTML(q)}
      <div class="opts"><div class="opt correct"><span class="k">${ansLetters(q)}</span><span>${ansTxt}</span><span class="mk">正解</span></div></div>
      <div class="expl"><b>💡 詳解：</b>${q.e}</div></div>`;
  }).join("") || `<p class="muted center">這次全部答對，太強了 🎉</p>`;

  app.innerHTML = `
    <div class="spread">
      <div class="brand"><div class="logo">⚡</div><div><h1>隨手練習結果</h1><div class="sub">${escHtml(name)}・隨手練習</div></div></div>
      <button class="btn sm ghost" onclick="viewDashboard('${encodeURIComponent(name)}')">回首頁</button>
    </div>
    <div class="card center">
      <div class="muted small">第一次就答對</div>
      <div class="score-big">${att.correct}<span style="font-size:1.2rem;color:var(--muted)"> / ${att.total}</span></div>
      <div style="margin:4px 0 2px">正確率 ${p}%・用時 ${fmtDur(att.durationSec)}</div>
      <div style="margin-top:10px"><span id="cloudStatus" class="chip" style="display:none"></span></div>
    </div>
    <div class="card"><h3>📝 錯題回顧與詳解（${att.wrongIds.length}）</h3>${wrong}</div>
    <div class="card"><h3>接下來</h3>
      <div class="row">
        <button class="btn primary" onclick="startPractice('${encodeURIComponent(name)}')">🔁 再練一次（重新洗牌）</button>
        ${att.wrongIds.length ? `<button class="btn accent" onclick="startPractice('${encodeURIComponent(name)}',[${att.wrongIds.join(",")}])">🎯 只練剛剛錯的（${att.wrongIds.length}）</button>` : ""}
        <button class="btn ghost" onclick="viewDashboard('${encodeURIComponent(name)}')">回首頁</button>
      </div>
    </div>
    <div class="foot">隨手練習也會記錄在你的練習紀錄中（標示為「隨手練習」）。</div>
  `;
  window.scrollTo(0, 0);
}

/* ---------- 啟動 ---------- */
viewLogin();
flushPending();
