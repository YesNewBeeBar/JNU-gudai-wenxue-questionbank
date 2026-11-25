/* 考试、判分、练习、结果页 */
(function () {
  "use strict";
  const A = window.APP;
  const { norm, esc, $, $$, toast, go, shuffle, sample, DB, sectionName } = A;

  const SKEY = "gdwx.session.v1";
  const DUR = () => DB.data.settings.duration || 150;

  /* ================= 组卷 ================= */
  function pickWithChapters(pool, n) {
    if (!pool.length) return [];
    const byCh = {};
    pool.forEach((x) => (byCh[x.ch] = byCh[x.ch] || []).push(x));
    const chs = shuffle(Object.keys(byCh));
    const out = [];
    let i = 0;
    while (out.length < n && i < chs.length * 3) {
      const c = chs[i % chs.length];
      const arr = byCh[c];
      if (arr && arr.length) out.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]);
      i++;
    }
    if (out.length < n) {
      const rest = shuffle(pool.filter((x) => !out.includes(x)));
      out.push(...rest.slice(0, n - out.length));
    }
    return out.slice(0, n);
  }

  function pickFills(target) {
    const pool = shuffle(window.FILLS || []);
    const out = [];
    let total = 0;
    let guard = 0;
    while (total < target && guard++ < 400) {
      let picked = false;
      for (let i = 0; i < pool.length; i++) {
        const it = pool[i];
        const nb = it.blanks.length;
        if (total + nb <= target) {
          out.push(it);
          total += nb;
          pool.splice(i, 1);
          picked = true;
          break;
        }
      }
      if (!picked) break;
    }
    return out;
  }

  function buildPaper() {
    const terms = pickWithChapters(window.TERMS || [], 5);
    const fills = pickFills(30);
    const recites = sample(window.RECITES || [], 3);
    const shorts = pickWithChapters(window.SHORTS || [], 2);
    const essays = pickWithChapters(window.ESSAYS || [], 2);
    return {
      id: "p" + Date.now(),
      createdAt: Date.now(),
      duration: DUR(),
      terms,
      fills,
      recites,
      shorts,
      essays,
    };
  }

  function newSession(paper) {
    return {
      paper,
      ans: { terms: {}, fills: {}, recite: { id: null, text: "" }, shorts: {}, essays: {} },
      self: {},
      override: {},
      startedAt: Date.now(),
      deadline: Date.now() + (paper.duration || DUR()) * 60000,
      submitted: false,
      result: null,
    };
  }

  let session = null;
  let tick = null;

  function saveSession() {
    try {
      sessionStorage.setItem(SKEY, JSON.stringify(session));
    } catch (e) {}
  }
  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SKEY);
      if (raw) session = JSON.parse(raw);
    } catch (e) {}
  }

  /* ================= 计时 ================= */
  function startTimer() {
    stopTimer();
    tick = setInterval(() => {
      const left = Math.max(0, session.deadline - Date.now());
      const el = $("#timer");
      if (el) {
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        el.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        el.classList.toggle("warn", left < 5 * 60000);
      }
      if (left <= 0) {
        stopTimer();
        submitExam(true);
      }
    }, 1000);
  }
  function stopTimer() {
    if (tick) clearInterval(tick);
    tick = null;
  }

  /* ================= 开始考试 ================= */
  window.startExam = function () {
    const paper = buildPaper();
    session = newSession(paper);
    saveSession();
    location.hash = "#/exam";
  };

  /* ================= 渲染考试 ================= */
  function sectionHTML(title, rule) {
    return `<div class="section"><h2>${title}</h2><div class="rule">${rule}</div></div>`;
  }

  function renderExam(root) {
    if (!session) loadSession();
    if (!session || !session.paper) {
      session = newSession(buildPaper());
      saveSession();
    }
    if (session.submitted) return go("/result");

    const p = session.paper;
    const totalQ = 5 + p.fills.length + 3 + p.shorts.length + p.essays.length * 3;
    root.innerHTML = `
    <div class="exambar">
      <div class="row">
        <button class="iconbtn back" data-back="/home" data-back-confirm="离开考试？已填的答案会保留，回来可以接着答，计时不会停。">← 返回</button>
        <div class="bartitle" style="font-size:13px;letter-spacing:.06em">中国古代文学史（一）· 模拟卷</div>
        <div class="timer" id="timer">--:--</div>
      </div>
      <div class="progress"><i id="pbar"></i></div>
    </div>
    <div id="examBody">
      ${sectionHTML("一、名词解释", "共 5 题，每题 3 分，计 15 分。每题 150 字左右。")}
      <div id="sec-term">${p.terms.map((it, i) => termHTML(it, i)).join("")}</div>

      ${sectionHTML("二、填空题", "共 30 空，每空 0.5 分，计 15 分。出现错别字该空不得分。")}
      <div id="sec-fill">${p.fills.map((it, i) => fillHTML(it, i)).join("")}</div>

      ${sectionHTML("三、默写题", "共 3 题，选择其中 1 题作答，计 10 分。每个错别字扣 1 分，封顶 3 分。")}
      <div id="sec-recite">${reciteHTML(p.recites)}</div>

      ${sectionHTML("四、简答题", "共 2 题，每题 10 分，计 20 分。答出要点，每题 300 字左右。")}
      <div id="sec-short">${p.shorts.map((it, i) => shortHTML(it, i)).join("")}</div>

      ${sectionHTML("五、分析论述题", "共 2 题，每题 20 分，计 40 分。含标点、字词解释与论述。")}
      <div id="sec-essay">${p.essays.map((it, i) => essayHTML(it, i)).join("")}</div>
    </div>
    <div class="card" style="margin-top:20px">
      <p class="muted" style="margin-top:0">交卷前请检查：填空是否漏空、默写是否选好一题、论述是否写完标点。</p>
      <button class="btn primary" style="width:100%" id="submitBtn">交卷并批改</button>
    </div>`;

    startTimer();
    // restore answers
    restoreAnswers();
    // progress
    const upd = () => {
      const done = countAnswered();
      $("#pbar").style.width = Math.min(100, (done / totalQ) * 100) + "%";
    };
    upd();
    root.oninput = onInput;
    root.onchange = onInput;
    $("#submitBtn").addEventListener("click", () => {
      if (confirm("确认交卷？交卷后不能再修改答案。")) submitExam(false);
    });
    root.onclick = onExamClick;
  }

  function updateProgress() {
    const bar = $("#pbar");
    if (!bar || !session || !session.paper) return;
    const p = session.paper;
    const total = 5 + p.fills.length + 1 + p.shorts.length + p.essays.length;
    bar.style.width = Math.min(100, (countAnswered() / total) * 100) + "%";
  }

  function countAnswered() {
    const a = session.ans;
    let n = 0;
    Object.values(a.terms).forEach((v) => v && v.trim() && n++);
    session.paper.fills.forEach((it) => {
      const vals = a.fills[it.id] || [];
      if (vals.some((x) => x && x.trim())) n++;
    });
    if (a.recite.text && a.recite.text.trim()) n++;
    Object.values(a.shorts).forEach((v) => v && v.trim() && n++);
    session.paper.essays.forEach((it) => {
      const e = a.essays[it.id] || {};
      if ((e.text && e.text.trim()) || (e.p || []).some(Boolean)) n++;
    });
    return n;
  }

  function termHTML(it, i) {
    return `<div class="q" data-type="term" data-id="${it.id}">
      <div class="qh"><span class="no">${i + 1}.</span><span class="stem">${esc(it.term)}</span></div>
      <textarea class="ans" data-k="terms" data-id="${it.id}" placeholder="写下定义、来源、内容与影响，约 150 字"></textarea>
    </div>`;
  }

  function fillHTML(it, i) {
    const parts = it.stem.split(/＿+/);
    let html = "";
    parts.forEach((seg, k) => {
      html += esc(seg);
      if (k < parts.length - 1) {
        html += `<input class="blank" data-k="fill" data-id="${it.id}" data-b="${k}" autocomplete="off">`;
      }
    });
    return `<div class="q" data-type="fill" data-id="${it.id}">
      <div class="qh"><span class="no">${i + 1}.</span><span class="stem">${html}</span></div>
    </div>`;
  }

  function reciteHTML(list) {
    if (!list.length) return `<div class="empty">题库暂无默写题</div>`;
    return `<div class="q">
      <div class="chips" id="recitePick">
        ${list.map((it, i) => `<span class="chip" data-pick="${i}">第 ${i + 1} 题 · ${esc(it.title)}</span>`).join("")}
      </div>
      <div id="reciteHint" class="tiny" style="margin:4px 0 8px">先选一题，再默写。提示首句：<a href="#" id="hintToggle">显示</a></div>
      <div id="reciteStem" class="muted" style="margin-bottom:6px"></div>
      <textarea class="ans" id="reciteInput" data-k="recite" placeholder="在此默写所选篇目" style="min-height:160px"></textarea>
    </div>`;
  }

  function shortHTML(it, i) {
    return `<div class="q" data-type="short" data-id="${it.id}">
      <div class="qh"><span class="no">${i + 1}.</span><span class="stem">${esc(it.q)}</span></div>
      <textarea class="ans" data-k="shorts" data-id="${it.id}" placeholder="约 300 字，分点作答"></textarea>
    </div>`;
  }

  function essayHTML(it, i) {
    const clauses = it.clauses || [];
    return `<div class="q" data-type="essay" data-id="${it.id}">
      <div class="qh"><span class="no">${i + 1}.</span><span class="stem">${esc(it.title)}</span></div>
      <p class="tiny" style="margin:0 0 6px">① 给下面这段文字加标点（点标点框，再从下方选符号）</p>
      <div class="material" data-essay="${it.id}">${clauses
        .map((c, k) => `<span class="clause">${esc(c.t)}<span class="punct empty" data-p="${k}"></span></span>`)
        .join("")}</div>
      <div class="pal" data-pal="${it.id}">${["，", "。", "；", "：", "？", "！", "、", "“", "”", "《", "》", "「", "」"]
        .map((x) => `<button type="button" data-punct="${x}">${x}</button>`)
        .join("")}<button type="button" data-punct="__DEL__">退格</button></div>
      <p class="tiny" style="margin:10px 0 4px">② 解释加点词</p>
      <div class="terms">${(it.terms || [])
        .map((t, k) => `<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><b style="min-width:3.4em">${esc(t.w)}</b><input class="blank" style="flex:1;text-align:left;width:auto" data-k="essay-term" data-id="${it.id}" data-w="${esc(t.w)}" placeholder="释义"></div>`)
        .join("")}</div>
      <p class="tiny" style="margin:12px 0 4px">③ ${esc(it.q)}</p>
      <textarea class="ans" data-k="essay-text" data-id="${it.id}" placeholder="约 500 字"></textarea>
    </div>`;
  }

  /* ---------- 交互 ---------- */
  let activePunct = null;

  function onExamClick(e) {
    const chip = e.target.closest("[data-pick]");
    if (chip) {
      const i = +chip.dataset.pick;
      const it = session.paper.recites[i];
      session.ans.recite.id = it.id;
      $$("#recitePick .chip").forEach((c) => c.classList.toggle("on", c === chip));
      $("#reciteStem").textContent = "请默写：" + it.title;
      saveSession();
      return;
    }
    if (e.target.id === "hintToggle") {
      e.preventDefault();
      const it = session.paper.recites.find((x) => x.id === (session.ans.recite.id || ""));
      if (!it) return toast("先选一题");
      const el = $("#reciteStem");
      el.textContent = "请默写：" + it.title + "（首句：" + it.text.slice(0, 8) + "……）";
      return;
    }
    const pb = e.target.closest("[data-p]");
    if (pb) {
      const q = pb.closest("[data-essay]");
      $$(".punct", q).forEach((x) => x.classList.remove("active"));
      pb.classList.add("active");
      activePunct = pb;
      return;
    }
    const pbtn = e.target.closest("[data-punct]");
    if (pbtn) {
      if (!activePunct) return toast("先点一个标点框");
      const ch = pbtn.dataset.punct;
      if (ch === "__DEL__") activePunct.textContent = activePunct.textContent.slice(0, -1);
      else activePunct.textContent += ch;
      activePunct.classList.toggle("empty", !activePunct.textContent);
      const eid = activePunct.closest("[data-essay]").dataset.essay;
      const k = +activePunct.dataset.p;
      const entry = (session.ans.essays[eid] = session.ans.essays[eid] || {});
      entry.p = entry.p || [];
      entry.p[k] = activePunct.textContent;
      saveSession();
      return;
    }
  }

  function onInput(e) {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.k) return;
    const k = el.dataset.k;
    if (k === "terms" || k === "shorts") {
      session.ans[k][el.dataset.id] = el.value;
    } else if (k === "fill") {
      const arr = (session.ans.fills[el.dataset.id] = session.ans.fills[el.dataset.id] || []);
      arr[+el.dataset.b] = el.value;
    } else if (k === "recite") {
      session.ans.recite.text = el.value;
    } else if (k === "essay-term") {
      const en = (session.ans.essays[el.dataset.id] = session.ans.essays[el.dataset.id] || {});
      en.t = en.t || {};
      en.t[el.dataset.w] = el.value;
    } else if (k === "essay-text") {
      const en = (session.ans.essays[el.dataset.id] = session.ans.essays[el.dataset.id] || {});
      en.text = el.value;
    }
    saveSession();
    updateProgress();
  }

  function restoreAnswers() {
    const a = session.ans;
    Object.entries(a.terms || {}).forEach(([id, v]) => {
      const el = $(`textarea[data-k="terms"][data-id="${id}"]`);
      if (el) el.value = v || "";
    });
    Object.entries(a.shorts || {}).forEach(([id, v]) => {
      const el = $(`textarea[data-k="shorts"][data-id="${id}"]`);
      if (el) el.value = v || "";
    });
    Object.entries(a.fills || {}).forEach(([id, vals]) => {
      (vals || []).forEach((v, i) => {
        const el = $(`input[data-k="fill"][data-id="${id}"][data-b="${i}"]`);
        if (el) el.value = v || "";
      });
    });
    if (a.recite && a.recite.id) {
      const idx = session.paper.recites.findIndex((x) => x.id === a.recite.id);
      if (idx >= 0) {
        const chip = $(`#recitePick .chip[data-pick="${idx}"]`);
        if (chip) chip.classList.add("on");
        const it = session.paper.recites[idx];
        $("#reciteStem").textContent = "请默写：" + it.title;
      }
      const t = $("#reciteInput");
      if (t) t.value = a.recite.text || "";
    }
    session.paper.essays.forEach((it) => {
      const en = (a.essays || {})[it.id] || {};
      (en.p || []).forEach((v, k) => {
        if (!v) return;
        const el = $(`[data-essay="${it.id}"] .punct[data-p="${k}"]`);
        if (el) {
          el.textContent = v;
          el.classList.remove("empty");
        }
      });
      Object.entries(en.t || {}).forEach(([w, v]) => {
        const el = $(`input[data-k="essay-term"][data-id="${it.id}"][data-w="${esc(w)}"]`);
        if (el) el.value = v;
      });
      const ta = $(`textarea[data-k="essay-text"][data-id="${it.id}"]`);
      if (ta) ta.value = en.text || "";
    });
  }

  /* ================= 判分 ================= */
  function lcsDiff(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push(["=", a[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(["-", a[i]]); i++; }
      else { ops.push(["+", b[j]]); j++; }
    }
    while (i < n) { ops.push(["-", a[i]]); i++; }
    while (j < m) { ops.push(["+", b[j]]); j++; }
    return ops;
  }

  function gradeRecite(user, answer) {
    const u = norm(user), a = norm(answer);
    if (!u) return { score: 0, max: 10, empty: true, errors: a.length, ops: [] };
    const ops = lcsDiff(u, a);
    const errors = ops.filter((o) => o[0] !== "=").length;
    const score = Math.max(0, 10 - Math.min(3, errors));
    return { score, max: 10, errors, ops, u, a, capped: errors > 3 };
  }

  function punctKey(c) {
    return (c.p || c.punct || "").replace(/\s/g, "");
  }

  function gradeEssay(it, entry) {
    const clauses = it.clauses || [];
    let hit = 0;
    clauses.forEach((c, k) => {
      const user = punctKey({ p: (entry.p || [])[k] });
      const ans = punctKey(c);
      if (user === ans) hit++;
    });
    const punctScore = clauses.length ? (hit / clauses.length) * 5 : 0;
    const terms = it.terms || [];
    let thit = 0;
    terms.forEach((t) => {
      const u = norm((entry.t || {})[t.w] || "");
      const accepted = String(t.a).split("/").map(norm).filter(Boolean);
      if (u && accepted.some((x) => x === u || u.includes(x) || x.includes(u))) thit++;
    });
    const termScore = terms.length ? (thit / terms.length) * 5 : 0;
    return { punctScore, termScore, punctHit: hit, punctTotal: clauses.length, termHit: thit, termTotal: terms.length };
  }

  function maxOf(type) {
    return { term: 3, fill: 0.5, recite: 10, short: 10, essay: 20 }[type];
  }

  function selfScore(key, points) {
    const arr = session.self[key] || [];
    let s = 0;
    (points || []).forEach((p, i) => { if (arr[i]) s += p.w; });
    return s;
  }

  function computeResult() {
    const p = session.paper;
    const a = session.ans;
    const out = { sections: {}, details: {}, total: 0, max: 100 };

    // terms
    let ts = 0;
    p.terms.forEach((it) => {
      const key = "term:" + it.id;
      const s = session.override[key] != null ? session.override[key] : selfScore(key, it.points);
      ts += s;
      out.details[key] = s;
    });
    out.sections.term = { got: round1(ts), max: p.terms.length * 3 };

    // fills
    let fs = 0;
    const fillDetail = {};
    p.fills.forEach((it) => {
      const vals = a.fills[it.id] || [];
      it.blanks.forEach((b, k) => {
        const ok = norm(vals[k] || "") === norm(b.a) && norm(vals[k] || "") !== "";
        if (ok) fs += 0.5;
        fillDetail[it.id + ":" + k] = { ok, user: vals[k] || "", ans: b.a };
      });
    });
    out.sections.fill = { got: round1(fs), max: p.fills.reduce((s, x) => s + x.blanks.length, 0) * 0.5 };
    out.details.fill = fillDetail;

    // recite
    const chosen = p.recites.find((x) => x.id === a.recite.id);
    const rg = chosen ? gradeRecite(a.recite.text, chosen.text) : { score: 0, max: 10 };
    out.sections.recite = { got: rg.score, max: 10 };
    out.details.recite = { id: chosen ? chosen.id : null, grade: rg };

    // shorts
    let ss = 0;
    p.shorts.forEach((it) => {
      const key = "short:" + it.id;
      const s = session.override[key] != null ? session.override[key] : selfScore(key, it.points);
      ss += s;
      out.details[key] = s;
    });
    out.sections.short = { got: round1(ss), max: p.shorts.length * 10 };

    // essays
    let es = 0;
    const essayDetail = {};
    p.essays.forEach((it) => {
      const entry = a.essays[it.id] || {};
      const g = gradeEssay(it, entry);
      const key = "essay:" + it.id;
      const disc = session.override[key] != null ? session.override[key] : selfScore(key, it.points);
      const total = round1(g.punctScore + g.termScore + disc);
      es += total;
      essayDetail[it.id] = { g, disc, total };
    });
    out.sections.essay = { got: round1(es), max: p.essays.length * 20 };
    out.details.essay = essayDetail;

    out.total = round1(out.sections.term.got + out.sections.fill.got + out.sections.recite.got + out.sections.short.got + out.sections.essay.got);
    return out;
  }

  const round1 = (n) => Math.round(n * 10) / 10;

  /* ================= 交卷 ================= */
  function submitExam(auto) {
    if (!session || session.submitted) return;
    session.submitted = true;
    session.submittedAt = Date.now();
    session.minutes = Math.max(1, Math.round((session.submittedAt - session.startedAt) / 60000));
    stopTimer();
    session.result = computeResult();
    saveSession();
    recordMistakes();
    go("/result");
    toast(auto ? "时间到，已自动交卷" : "已交卷，答案已保存");
  }

  function recordMistakes() {
    const p = session.paper;
    const r = session.result;
    const put = (type, id) => A.addMistake(type, id, "exam");
    p.fills.forEach((it) => {
      const vals = session.ans.fills[it.id] || [];
      const bad = it.blanks.some((b, k) => norm(vals[k] || "") !== norm(b.a));
      if (bad) put("fill", it.id);
    });
    if (r.details.recite.grade && r.details.recite.grade.errors > 0 && r.details.recite.id) put("recite", r.details.recite.id);
    const a = session.ans;
    p.terms.forEach((it) => { if (!(a.terms[it.id] || "").trim()) put("term", it.id); });
    p.shorts.forEach((it) => { if (!(a.shorts[it.id] || "").trim()) put("short", it.id); });
    p.essays.forEach((it) => {
      const en = a.essays[it.id] || {};
      if (!(en.text || "").trim() && !(en.p || []).some(Boolean)) put("essay", it.id);
    });

    DB.data.history.push({
      ts: session.submittedAt,
      total: r.total,
      max: 100,
      minutes: session.minutes,
      bySection: r.sections,
      paperId: p.id,
    });
    if (DB.data.history.length > 80) DB.data.history.shift();
    DB.save();
  }

  /* ================= 结果页 ================= */
  function viewResult(root) {
    if (!session) loadSession();
    if (!session || !session.result) {
      root.innerHTML = `${A.topBar({ title: "成绩单", sub: "", back: "/home", fixed: true })}
        <div class="empty">没有可查看的成绩。<br><button class="btn" data-nav="/home">回首页</button></div>`;
      return;
    }
    const p = session.paper;
    const r = session.result;
    const grade = r.total >= 90 ? "稳" : r.total >= 80 ? "不错" : r.total >= 60 ? "要补" : "危险";
    root.innerHTML = `
      <div class="exambar"><div class="row">
        <button class="iconbtn back" data-back="/home" data-back-fixed="1">← 返回</button>
        <div class="bartitle" style="font-size:13px">成绩单</div>
      </div></div>
      <div class="card">
        <div class="score"><b>${r.total}</b><span> / 100 · ${grade}</span></div>
        <p class="muted" style="text-align:center;margin:4px 0 0">用时 ${session.minutes || "—"} 分钟 · 客观题已自动判分；主观题勾选得分点后，分数与错题本会同步更新</p>
        <table class="bt">
          <tr><th>题型</th><th>得分</th><th>满分</th></tr>
          ${["term", "fill", "recite", "short", "essay"].map((k) => `<tr><td>${sectionName(k)}</td><td><b>${r.sections[k].got}</b></td><td>${r.sections[k].max}</td></tr>`).join("")}
        </table>
      </div>
      <div id="review"></div>
      <div class="card">
        <div class="actions">
          <button class="btn primary" id="again">再考一次</button>
          <button class="btn" data-nav="/mistakes">去错题本</button>
        </div>
      </div>`;

    renderReview();

    $("#again").addEventListener("click", () => {
      session = null;
      sessionStorage.removeItem(SKEY);
      startExam();
    });
  }

  function renderReview() {
    const p = session.paper;
    const r = session.result;
    const host = $("#review");
    const parts = [];

    parts.push(`<div class="section"><h2>一、名词解释</h2><div class="rule">每题 3 分，对照得分点勾选</div></div>`);
    p.terms.forEach((it, i) => parts.push(termReview(it, i)));

    parts.push(`<div class="section"><h2>二、填空题</h2><div class="rule">每空 0.5 分</div></div>`);
    p.fills.forEach((it, i) => parts.push(fillReview(it, i)));

    parts.push(`<div class="section"><h2>三、默写题</h2><div class="rule">错一字扣 1 分，封顶扣 3 分</div></div>`);
    parts.push(reciteReview());

    parts.push(`<div class="section"><h2>四、简答题</h2><div class="rule">每题 10 分，对照要点勾选</div></div>`);
    p.shorts.forEach((it, i) => parts.push(shortReview(it, i)));

    parts.push(`<div class="section"><h2>五、分析论述题</h2><div class="rule">标点 5 分 · 字词 5 分 · 论述 10 分</div></div>`);
    p.essays.forEach((it, i) => parts.push(essayReview(it, i)));

    host.innerHTML = parts.join("");
    host.onclick = onReviewClick;
    host.onchange = onReviewChange;
  }

  function pointsHTML(type, it) {
    const key = type + ":" + it.id;
    const arr = session.self[key] || [];
    return `<ul class="points" data-pts="${key}">${(it.points || [])
      .map((pt, i) => `<li><input type="checkbox" data-check="${key}" data-i="${i}" ${arr[i] ? "checked" : ""}><span>${esc(pt.t)}</span><span class="w">${pt.w} 分</span></li>`)
      .join("")}</ul>`;
  }

  function termReview(it, i) {
    const key = "term:" + it.id;
    const s = session.result.details[key] || 0;
    return `<div class="q">
      <div class="qh"><span class="no">${i + 1}.</span><span class="stem">${esc(it.term)} <span class="badge ${s >= 1.8 ? "g" : "r"}">${s} / 3</span></span></div>
      <details><summary>你的答案</summary><div class="answer">${esc(session.ans.terms[it.id] || "（未作答）")}</div></details>
      <details open><summary>参考答案</summary><div class="answer">${esc(it.answer)}</div></details>
      <div class="tiny">对照下列得分点，答到即勾选（可改，总分实时更新）：</div>
      ${pointsHTML("term", it)}
      ${it.note ? `<div class="tiny">出处：${esc(it.note)}</div>` : ""}
      ${aiBtn(key)}
      <div id="ai-${it.id}"></div>
    </div>`;
  }

  function fillReview(it, i) {
    const det = session.result.details.fill;
    let body = "";
    const parts = it.stem.split(/＿+/);
    parts.forEach((seg, k) => {
      body += esc(seg);
      if (k < parts.length - 1) {
        const d = det[it.id + ":" + k] || {};
        body += `<span class="${d.ok ? "badge g" : "badge r"}">${esc(d.user || "空")}</span>`;
        if (!d.ok) body += `<b style="color:var(--red)">（${esc(d.ans)}）</b>`;
      }
    });
    return `<div class="q"><div class="qh"><span class="no">${i + 1}.</span><span class="stem">${body}</span></div>
      ${it.note ? `<div class="tiny">出处：${esc(it.note)}</div>` : ""}</div>`;
  }

  function reciteReview() {
    const d = session.result.details.recite;
    if (!d || !d.id) return `<div class="q">未选择默写题（0 分）</div>`;
    const it = A.getItem("recite", d.id);
    const g = d.grade;
    const diff = g.ops.length
      ? `<div class="diff">${g.ops
          .map(([op, ch]) => (op === "=" ? `<span class="ok">${esc(ch)}</span>` : op === "-" ? `<span class="wrong">${esc(ch)}</span>` : `<span class="miss">${esc(ch)}</span>`))
          .join("")}</div>`
      : "";
    return `<div class="q">
      <div class="qh"><span class="no">默写</span><span class="stem">${esc(it ? it.title : "")} <span class="badge ${g.score >= 7 ? "g" : "r"}">${g.score} / 10</span></span></div>
      <div class="tiny">错漏 ${g.errors} 字${g.capped ? "（已封顶扣 3 分）" : ""}。红色为你写错/多写的字，波浪线为漏写的字。</div>
      ${diff}
      <details><summary>你写的全文</summary><div class="answer">${esc(session.ans.recite.text || "")}</div></details>
      <details open><summary>原文</summary><div class="answer">${esc(it ? it.text : "")}</div></details>
    </div>`;
  }

  function shortReview(it, i) {
    const key = "short:" + it.id;
    const s = session.result.details[key] || 0;
    return `<div class="q">
      <div class="qh"><span class="no">${i + 1}.</span><span class="stem">${esc(it.q)} <span class="badge ${s >= 6 ? "g" : "r"}">${s} / 10</span></span></div>
      <details><summary>你的答案</summary><div class="answer">${esc(session.ans.shorts[it.id] || "（未作答）")}</div></details>
      <details open><summary>参考答案</summary><div class="answer">${esc(it.answer)}</div></details>
      ${pointsHTML("short", it)}
      ${it.note ? `<div class="tiny">依据：${esc(it.note)}</div>` : ""}
      ${aiBtn(key)}
      <div id="ai-${it.id}"></div>
    </div>`;
  }

  function essayReview(it, i) {
    const d = (session.result.details.essay || {})[it.id] || { g: { punctHit: 0, punctTotal: 0, termHit: 0, termTotal: 0, punctScore: 0, termScore: 0 }, disc: 0, total: 0 };
    const entry = session.ans.essays[it.id] || {};
    const g = d.g;
    const punct = (it.clauses || [])
      .map((c, k) => {
        const u = (entry.p || [])[k] || "";
        const ok = punctKey({ p: u }) === punctKey(c);
        return `<span class="${ok ? "ok" : "bad"}">${esc(c.t)}<b class="${ok ? "badge g" : "badge r"}">${esc(u || "无")}</b></span>`;
      })
      .join("");
    const terms = (it.terms || [])
      .map((t) => {
        const u = (entry.t || {})[t.w] || "";
        const ok = norm(u) && String(t.a).split("/").map(norm).some((x) => x === norm(u) || norm(u).includes(x));
        return `<div style="margin:4px 0"><b>${esc(t.w)}</b>：你答「${esc(u || "空")}」 ${ok ? '<span class="badge g">对</span>' : `<span class="badge r">错</span> 参考：${esc(t.a)}`}</div>`;
      })
      .join("");
    return `<div class="q">
      <div class="qh"><span class="no">${i + 1}.</span><span class="stem">${esc(it.title)} <span class="badge ${d.total >= 12 ? "g" : "r"}">${d.total} / 20</span></span></div>
      <div class="tiny">标点 ${g.punctHit}/${g.punctTotal}（${round1(g.punctScore)} 分）· 字词 ${g.termHit}/${g.termTotal}（${round1(g.termScore)} 分）· 论述自评 ${d.disc} 分</div>
      <details open><summary>标点对照</summary><div class="material" style="font-size:15px;line-height:2">${punct}</div></details>
      <details open><summary>标准标点与译文</summary><div class="answer">${esc((it.clauses || []).map((c) => c.t + punctKey(c)).join(""))}\n\n【译文】${esc(it.translation)}</div></details>
      <details><summary>字词</summary><div class="answer">${terms}</div></details>
      <details><summary>你的论述</summary><div class="answer">${esc(entry.text || "（未作答）")}</div></details>
      <details open><summary>参考答案</summary><div class="answer">${esc(it.answer)}</div></details>
      ${pointsHTML("essay", it)}
      ${aiBtn("essay:" + it.id)}
      <div id="ai-${it.id}"></div>
    </div>`;
  }

  function aiBtn(key) {
    return `<div class="actions"><button class="btn small ghost" data-ai="${key}">AI 批改（可选）</button></div>`;
  }

  function updateQBadge(q, type, id) {
    if (!q) return;
    const b = q.querySelector(".qh .badge");
    if (!b) return;
    let s = 0, max = 3;
    if (type === "term") { s = session.result.details["term:" + id] || 0; max = 3; }
    else if (type === "short") { s = session.result.details["short:" + id] || 0; max = 10; }
    else { s = ((session.result.details.essay || {})[id] || {}).total || 0; max = 20; }
    b.textContent = s + " / " + max;
    b.className = "badge " + (s >= max * 0.6 ? "g" : "r");
  }

  function onReviewChange(e) {
    const cb = e.target.closest("[data-check]");
    if (!cb) return;
    const key = cb.dataset.check;
    const i = +cb.dataset.i;
    session.self[key] = session.self[key] || [];
    session.self[key][i] = cb.checked;
    recomputeAndPaint();
    const [type, id] = key.split(":");
    updateQBadge(cb.closest(".q"), type, id);
  }

  function onReviewClick(e) {
    const b = e.target.closest("[data-ai]");
    if (b) return aiGrade(b.dataset.ai, b);
  }

  async function aiGrade(key, btn) {
    const cfg = DB.data.settings.ai;
    if (!cfg.key) return toast("先在设置里填 API Key");
    const [type, id] = key.split(":");
    const item = A.getItem(type === "term" ? "term" : type === "short" ? "short" : "essay", id);
    if (!item) return toast("找不到题目");
    const answer = type === "term" ? session.ans.terms[id] : type === "short" ? session.ans.shorts[id] : ((session.ans.essays[id] || {}).text || "");
    if (!answer || !answer.trim()) return toast("没有作答");
    const max = maxOf(type);
    const rubric = (item.points || []).map((p, i) => `${i + 1}. ${p.t}（${p.w}分）`).join("\n");
    btn.disabled = true;
    btn.textContent = "批改中…";
    try {
      const prompt = `你是一位中国古代文学史（一）的助教。请按得分点批改学生的答案。
题目：${type === "term" ? item.term : type === "short" ? item.q : item.title}
满分：${max} 分
得分点：
${rubric}
参考答案：
${item.answer}
学生答案：
${answer}
只输出 JSON：{"score": 数字, "comment": "两三句评语，指出缺了哪个要点"}`;
      const res = await fetch(cfg.base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.key },
        body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const txt = data.choices[0].message.content;
      const m = txt.match(/\{[\s\S]*\}/);
      const obj = JSON.parse(m ? m[0] : txt);
      session.override[key] = Math.max(0, Math.min(max, +obj.score || 0));
      const box = document.getElementById("ai-" + id);
      if (box) box.innerHTML = `<div class="fb info"><b>AI 评分 ${session.override[key]} / ${max}</b><br>${esc(obj.comment || "")}</div>`;
      recomputeAndPaint();
      updateQBadge(box && box.closest(".q"), type, id);
    } catch (err) {
      toast("AI 批改失败：" + err.message + "（可能是浏览器跨域限制）");
    } finally {
      btn.disabled = false;
      btn.textContent = "AI 批改（可选）";
    }
  }

  function syncMistakes() {
    const p = session.paper;
    const r = session.result;
    const put = (type, id) => A.touchMistake(type, id, "exam");
    p.terms.forEach((it) => {
      const s = r.details["term:" + it.id] || 0;
      if (s >= 3 * 0.6) delete DB.data.mistakes["term:" + it.id];
      else put("term", it.id);
    });
    p.shorts.forEach((it) => {
      const s = r.details["short:" + it.id] || 0;
      if (s >= 10 * 0.6) delete DB.data.mistakes["short:" + it.id];
      else put("short", it.id);
    });
    p.essays.forEach((it) => {
      const d = (r.details.essay || {})[it.id] || { total: 0 };
      if (d.total >= 20 * 0.6) delete DB.data.mistakes["essay:" + it.id];
      else put("essay", it.id);
    });
    const h = DB.data.history;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].ts === session.submittedAt) {
        h[i].total = r.total;
        h[i].bySection = r.sections;
        break;
      }
    }
    DB.save();
  }

  function recomputeAndPaint() {
    session.result = computeResult();
    syncMistakes();
    saveSession();
    const r = session.result;
    const scoreEl = $(".score b");
    if (scoreEl) scoreEl.textContent = r.total;
    updateSectionTable();
  }

  function updateSectionTable() {
    const r = session.result;
    const map = { 名词解释: "term", 填空: "fill", 默写: "recite", 简答: "short", 论述: "essay" };
    document.querySelectorAll(".card table.bt tr").forEach((tr) => {
      const first = tr.children[0];
      if (!first) return;
      const k = map[first.textContent.trim()];
      if (k && tr.children[1]) tr.children[1].innerHTML = "<b>" + r.sections[k].got + "</b>";
    });
  }

  /* ================= 练习模式 ================= */
  const practice = { list: [], idx: 0, ans: {}, checked: false, type: "" };

  function viewPractice(root, qs) {
    if (qs.get("only")) {
      const ids = qs.get("only").split(",").filter(Boolean);
      const list = ids.map((x) => {
        const [t, id] = x.split(":");
        const it = A.getItem(t, id);
        return it ? { type: t, item: it } : null;
      }).filter(Boolean);
      if (!list.length) return toast("没有可练的题");
      practice.list = list;
      practice.idx = 0;
      practice.ans = {};
      practice.checked = false;
      renderPracticeRun(root);
      return;
    }
    const chs = A.chapterList();
    const ch = qs.get("ch") || "";
    const type = qs.get("type") || "";
    root.innerHTML = `
      ${A.topBar({ title: "分章练习", sub: "选范围，立即批改" })}
      <div class="card">
        <h3>范围</h3>
        <select id="pch" style="width:100%"><option value="">全部章节</option>${chs.map((c) => `<option ${c === ch ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <h3 style="margin-top:14px">题型</h3>
        <select id="ptype" style="width:100%">
          <option value="">全部题型</option>
          ${[["term", "名词解释"], ["fill", "填空"], ["short", "简答"], ["essay", "分析论述"]].map(([v, n]) => `<option value="${v}" ${v === type ? "selected" : ""}>${n}</option>`).join("")}
        </select>
        <h3 style="margin-top:14px">题量</h3>
        <select id="pnum" style="width:100%"><option>5</option><option selected>10</option><option>20</option></select>
        <div class="actions"><button class="btn primary" id="pstart" style="width:100%">开始练习</button></div>
      </div>
      <p class="muted" style="padding:0 4px">练习会立即判分并显示答案，答错的题自动进错题本。</p>`;
    $("#pstart").addEventListener("click", () => {
      const c = $("#pch").value, t = $("#ptype").value, n = +$("#pnum").value;
      const pools = { term: window.TERMS, fill: window.FILLS, short: window.SHORTS, essay: window.ESSAYS };
      let list = [];
      Object.keys(pools).forEach((tp) => {
        if (t && t !== tp) return;
        (pools[tp] || []).forEach((it) => {
          if (!c || it.ch === c) list.push({ type: tp, item: it });
        });
      });
      if (!list.length) return toast("这个范围没有题");
      practice.list = sample(list, n);
      practice.idx = 0;
      practice.ans = {};
      practice.checked = false;
      renderPracticeRun(root);
    });
  }

  function renderPracticeRun(root) {
    if (practice.idx >= practice.list.length) {
      root.innerHTML = `${A.topBar({ title: "这一组练完了", sub: "", back: "/practice", fixed: true })}
        <div class="card" style="text-align:center">
        <h3>这一组练完了</h3><p class="muted">共 ${practice.list.length} 题</p>
        <div class="actions" style="justify-content:center"><button class="btn primary" data-nav="/practice">再来一组</button><button class="btn" data-nav="/mistakes">看错题</button></div></div>`;
      return;
    }
    const cur = practice.list[practice.idx];
    const it = cur.item;
    const type = cur.type;
    let body = "";
    if (type === "term") {
      body = `<div class="stem">${esc(it.term)}</div><textarea class="ans" id="pans" placeholder="约 150 字"></textarea>`;
    } else if (type === "fill") {
      const parts = it.stem.split(/＿+/);
      let html = "";
      parts.forEach((seg, k) => {
        html += esc(seg);
        if (k < parts.length - 1) html += `<input class="blank" id="pb${k}" autocomplete="off">`;
      });
      body = `<div class="stem">${html}</div>`;
    } else if (type === "short") {
      body = `<div class="stem">${esc(it.q)}</div><textarea class="ans" id="pans" placeholder="约 300 字"></textarea>`;
    } else if (type === "essay") {
      body = `<div class="stem">${esc(it.title)}</div><p class="muted" style="font-size:13px">练习模式下只练论述部分；标点请到模拟卷里练。</p><textarea class="ans" id="pans" placeholder="500 字"></textarea>`;
    }
    root.innerHTML = `
    ${A.topBar({
      title: `练习 ${practice.idx + 1}/${practice.list.length}`,
      sub: it.ch || "",
      back: "/practice",
      fixed: true,
      confirm: "退出练习？这道题的作答不会保存。",
    })}
      <div class="q">${body}</div>
      <div class="actions"><button class="btn primary" id="pcheck">对照答案</button><button class="btn" id="pnext">下一题</button></div>
      <div id="pfb"></div>`;

    $("#pcheck").addEventListener("click", () => checkPractice(cur, root));
    $("#pnext").addEventListener("click", () => {
      practice.idx++;
      practice.checked = false;
      renderPracticeRun(root);
    });
  }

  function markMistake(type, id, good, src) {
    const k = type + ":" + id;
    if (good) {
      delete DB.data.mistakes[k];
    } else {
      A.addMistake(type, id, src || "practice");
    }
    DB.save();
  }

  function checkPractice(cur, root) {
    const it = cur.item, type = cur.type;
    const fb = $("#pfb");
    if (type === "fill") {
      let all = true;
      it.blanks.forEach((b, k) => {
        const el = $("#pb" + k);
        const good = norm(el.value) === norm(b.a);
        el.style.borderColor = good ? "var(--green)" : "var(--red)";
        if (!good) all = false;
      });
      fb.innerHTML = `<div class="fb ${all ? "ok" : "bad"}"><b>${all ? "全对" : "有错"}</b><br>答案：${it.blanks
        .map((b) => esc(b.a)).join(" ／ ")}${it.note ? `<br><span class="tiny">出处：${esc(it.note)}</span>` : ""}</div>`;
      markMistake(type, it.id, all, "practice");
      return;
    }
    const pts = (it.points || []).map((p) => `<li><span>${esc(p.t)}</span><span class="w">${p.w} 分</span></li>`).join("");
    fb.innerHTML = `<div class="fb info"><b>参考答案</b><div class="answer" style="margin-top:6px">${esc(it.answer)}</div>
      ${pts ? `<div class="tiny" style="margin-top:8px">对照要点：</div><ul class="points">${pts}</ul>` : ""}
      <div class="actions"><button class="btn small" data-mark="ok">答对了，移出错题</button>
      <button class="btn small ghost" data-mark="bad">仍不会，留在错题本</button></div></div>`;
    fb.querySelectorAll("[data-mark]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const good = btn.dataset.mark === "ok";
        markMistake(type, it.id, good, "practice");
        fb.querySelectorAll("[data-mark]").forEach((b) => (b.disabled = true));
        toast(good ? "已移出错题" : "已记入错题本");
      });
    });
  }

  /* ================= 默写自测 ================= */
  // 篇名对应 RECITES 里的 id；RECITES 只收了必背篇目，其余用 t:篇名 当 id
  function reciteIdOf(title) {
    const rc = (window.RECITES || []).find((x) => x.title === title);
    return rc ? rc.id : "t:" + title;
  }

  function viewRecite(root, qs) {
    const title = qs.get("t") || "";
    const it = (window.TEXTS || []).find((x) => x.title === title);
    root.innerHTML = `
    ${A.topBar({ title: "默写自测", sub: title, back: "/texts" })}
      ${it ? `<div class="q"><textarea class="ans" id="rt" placeholder="默写全文或选段" style="min-height:200px"></textarea></div>
      <div class="actions"><button class="btn primary" id="rcheck">提交批改</button><button class="btn" id="rshow">直接看原文</button></div>
      <div id="rfb"></div>` : `<div class="empty">没有找到这篇</div>`}`;
    if (!it) return;
    $("#rcheck").addEventListener("click", () => {
      const g = gradeRecite($("#rt").value, it.text);
      const diff = g.ops.map(([op, ch]) => (op === "=" ? `<span class="ok">${esc(ch)}</span>` : op === "-" ? `<span class="wrong">${esc(ch)}</span>` : `<span class="miss">${esc(ch)}</span>`)).join("");
      const key = reciteIdOf(title);
      const existed = !!DB.data.mistakes["recite:" + key];
      markMistake("recite", key, g.errors === 0, "recite");
      const tip = g.errors === 0 ? (existed ? "全对，已从错题本移出" : "全对") : "已记入错题本 · 默写自测";
      $("#rfb").innerHTML = `<div class="card"><h3>得分 ${g.score} / 10</h3><p class="tiny">错漏 ${g.errors} 字 · ${tip}</p><div class="diff">${diff}</div>
        <details><summary>原文</summary><div class="answer">${esc(it.text)}</div></details></div>`;
    });
    $("#rshow").addEventListener("click", () => {
      $("#rfb").innerHTML = `<div class="card"><h3>原文</h3><div class="answer">${esc(it.text)}</div></div>`;
    });
  }

  /* 暴露 */
  A.stopTimer = stopTimer;
  A.startExam = startExam;
  A.viewResult = viewResult;
  A.viewPractice = viewPractice;
  A.viewRecite = viewRecite;
  A.buildPaper = buildPaper;

  VIEWS.exam = renderExam;
  VIEWS.result = viewResult;
  VIEWS.practice = viewPractice;
  VIEWS.recite = viewRecite;
})();
