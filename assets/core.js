/* 中国古代文学史（一）题库 · 核心 */
(function () {
  "use strict";

  /* ---------- 简繁归一 ---------- */
  const T2S = new Map();
  (function () {
    const s = window.T2S_PAIRS || "";
    for (let i = 0; i + 1 < s.length; i += 2) T2S.set(s[i], s[i + 1]);
  })();

  const PUNCT_RE = /[\s\u3000，。；：、？！“”‘’《》〈〉（）()「」『』【】…—－·,.;:?!'"<>\[\]~`]/g;

  function norm(s) {
    if (!s) return "";
    return s
      .replace(PUNCT_RE, "")
      .split("")
      .map((c) => T2S.get(c) || c)
      .join("");
  }

  /* ---------- DOM ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 1800);
  }

  /* ---------- 存储 ---------- */
  const KEY = "gdwx.bank.v1";
  const DEFAULT_DB = () => ({
    history: [],
    mistakes: {},
    settings: {
      duration: 150,
      showPinyin: false,
      ai: { key: "", base: "https://api.deepseek.com", model: "deepseek-chat" },
    },
    stats: { started: 0, finished: 0 },
  });

  const DB = {
    data: DEFAULT_DB(),
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          this.data = Object.assign(DEFAULT_DB(), d);
          this.data.settings = Object.assign(DEFAULT_DB().settings, d.settings || {});
          this.data.settings.ai = Object.assign(DEFAULT_DB().settings.ai, (d.settings || {}).ai || {});
        }
      } catch (e) {
        console.warn("读取本地记录失败", e);
      }
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        toast("保存失败：浏览器存储空间不足");
      }
    },
  };

  /* ---------- 题库索引 ---------- */
  const INDEX = new Map();
  function buildIndex() {
    const add = (type, arr) => (arr || []).forEach((it) => INDEX.set(type + ":" + it.id, it));
    add("term", window.TERMS);
    add("fill", window.FILLS);
    add("short", window.SHORTS);
    add("essay", window.ESSAYS);
    add("recite", window.RECITES);
  }
  const getItem = (type, id) => INDEX.get(type + ":" + id) || null;

  /* ---------- 词库工具 ---------- */
  const shuffle = (a) => {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const uniqBy = (a, f) => {
    const seen = new Set();
    return a.filter((x) => {
      const k = f(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  function chapterList() {
    const set = new Set();
    (window.TERMS || []).forEach((x) => set.add(x.ch));
    (window.SHORTS || []).forEach((x) => set.add(x.ch));
    (window.ESSAYS || []).forEach((x) => set.add(x.ch));
    (window.RECITES || []).forEach((x) => set.add(x.ch));
    (window.FILLS || []).forEach((x) => set.add(x.ch));
    return Array.from(set);
  }

  /* ---------- 成绩 ---------- */
  function pct(n) {
    return Math.round(n * 100);
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------- 路由 ---------- */
  const VIEWS = {};
  let currentView = "";

  // 返回栈：记录走过的路由，返回键优先回上一页；栈里没有目标时用各页声明的 fallback
  const NAV_STACK = [];
  let pendingBack = null;

  function routeOf() {
    const raw = (location.hash || "#/home").replace(/^#/, "");
    const [path, qs] = raw.split("?");
    return (path || "/home") + (qs ? "?" + qs : "");
  }

  function go(hash) {
    if (location.hash === "#" + hash) render();
    else location.hash = hash;
  }

  // fixed=true 时忽略返回栈，直接回 fallback（交卷后的成绩单回考试页只会被重定向回来）
  function goBack(fallback, fixed) {
    let target = "";
    if (!fixed) {
      if (NAV_STACK[NAV_STACK.length - 1] === routeOf()) NAV_STACK.pop();
      target = NAV_STACK[NAV_STACK.length - 1] || "";
    }
    if (!target) target = fallback || "/home";
    pendingBack = target; // 返回本身不再入栈，否则连按两次会原地打转
    go(target);
  }

  function render() {
    const route = routeOf();
    if (pendingBack !== null && route === pendingBack) pendingBack = null;
    else if (NAV_STACK[NAV_STACK.length - 2] === route) NAV_STACK.pop(); // 浏览器后退键
    else if (NAV_STACK[NAV_STACK.length - 1] !== route) {
      NAV_STACK.push(route);
      if (NAV_STACK.length > 60) NAV_STACK.shift();
    }

    const raw = (location.hash || "#/home").replace(/^#/, "");
    const [path, qs] = raw.split("?");
    const name = (path || "/home").replace(/^\//, "") || "home";
    if (window.APP && window.APP.stopTimer) window.APP.stopTimer();
    const fn = VIEWS[name] || VIEWS.home;
    currentView = name;
    const app = $("#app");
    app.innerHTML = "";
    app.onclick = null;
    app.oninput = null;
    app.onchange = null;
    try {
      fn(app, new URLSearchParams(qs || ""));
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="empty">页面出错了：${esc(e.message)}</div>`;
    }
    window.scrollTo(0, 0);
  }

  /* ---------- 顶栏 ---------- */
  // back 传路由显示返回键，传 null 表示不显示（首页）；fixed 见 goBack；confirm 为点击时的确认文案
  function topBar(o) {
    const opt = o || {};
    const back = opt.back === undefined ? "/home" : opt.back;
    const title = opt.title || "中国古代文学史（一）";
    const sub = opt.sub === undefined ? "期末题库 · 复习使用" : opt.sub;
    const right = opt.right === undefined ? `<button class="iconbtn" data-nav="/settings">设置</button>` : opt.right;
    const backBtn = back
      ? `<button class="iconbtn back" data-back="${esc(back)}"${opt.fixed ? ' data-back-fixed="1"' : ""}${
          opt.confirm ? ` data-back-confirm="${esc(opt.confirm)}"` : ""
        } aria-label="返回">← 返回</button>`
      : "";
    return `<div class="top">
      ${backBtn}
      <div class="brand">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</div>
      <div class="sp"></div>
      ${right}
    </div>`;
  }

  /* ---------- 首页 ---------- */
  function viewHome(root) {
    const counts = {
      term: (window.TERMS || []).length,
      fill: (window.FILLS || []).length,
      recite: (window.RECITES || []).length,
      short: (window.SHORTS || []).length,
      essay: (window.ESSAYS || []).length,
    };
    const h = DB.data.history;
    const last = h[h.length - 1];
    const wrongN = Object.keys(DB.data.mistakes).length;
    const best = h.reduce((m, x) => Math.max(m, x.total || 0), 0);

    root.innerHTML = `${topBar({ back: null })}
    <div class="hero">
      <h1>考前复习</h1>
      <p>按 2026 期末题型组卷：名词解释 5×3、填空 30 空×0.5、默写 3 选 1、简答 2×10、分析论述 2×20。</p>
      <div class="grid">
        <div class="tile wide" data-nav="/exam">
          <b>开始模拟考 <span class="seal">100 分</span></b>
          <span>限时 ${DB.data.settings.duration} 分钟 · 交卷后逐题对答案</span>
        </div>
        <div class="tile" data-nav="/practice"><b>分章练习</b><span>按朝代/篇章刷题，立即看解析</span></div>
        <div class="tile" data-nav="/mistakes"><b>错题本</b><span>${wrongN ? wrongN + " 道待复习" : "还没有错题"}</span></div>
        <div class="tile" data-nav="/texts"><b>背诵篇目</b><span>${(window.TEXTS || []).length} 篇原文，可自测默写</span></div>
        <div class="tile" data-nav="/stats"><b>成绩统计</b><span>${h.length ? "最近 " + fmtDate(last.ts) + " " + last.total + " 分" : "暂无记录"}</span></div>
      </div>
      <div class="statrow">
        <div><b>${counts.term}</b><span>名词解释</span></div>
        <div><b>${counts.fill}</b><span>填空</span></div>
        <div><b>${counts.recite}</b><span>默写</span></div>
        <div><b>${counts.short}</b><span>简答</span></div>
        <div><b>${counts.essay}</b><span>论述</span></div>
      </div>
      <p class="tiny" style="margin-top:12px">最好成绩 ${best || "—"} 分 · 已完成 ${h.length} 次模拟</p>
    </div>
    <div class="foot">题库依据：课堂笔记（神话、《诗经》、毛诗序、尚书、左传）· 背诵文本 · 2026 题型说明</div>`;
  }

  /* ---------- 背诵篇目 ---------- */
  function viewTexts(root) {
    const all = window.TEXTS || [];
    root.innerHTML = `${topBar()}
      <h2 style="font-size:18px;margin:10px 2px">背诵篇目</h2>
      <p class="muted" style="margin:0 2px 10px">共 ${all.length} 篇。点篇名展开原文，可「默写自测」。</p>
      <input class="search" id="tsearch" placeholder="搜索篇名、句子或书名">
      <div id="tlist"></div>`;

    const list = $("#tlist");
    const draw = (kw) => {
      const q = (kw || "").trim();
      const items = all.filter((x) => !q || (x.title + x.book + x.text).includes(q));
      const groups = {};
      items.forEach((x) => {
        const k = x.book;
        (groups[k] = groups[k] || []).push(x);
      });
      list.innerHTML = Object.keys(groups)
        .map(
          (book) => `<div class="card"><h3>${esc(book)}</h3>${groups[book]
            .map(
              (x, i) => `<div class="titem" data-ti="${esc(x.title)}">
                <b>${esc(x.title)}</b><span class="meta">${x.text.length} 字</span>
                <div class="tbody" hidden>${esc(x.text)}</div>
                <div class="actions" hidden><button class="btn small" data-recite="${esc(x.title)}">默写自测</button></div>
              </div>`
            )
            .join("")}</div>`
        )
        .join("") || `<div class="empty">没有找到「${esc(q)}」</div>`;
    };
    draw("");
    $("#tsearch").addEventListener("input", (e) => draw(e.target.value));
    list.addEventListener("click", (e) => {
      const rc = e.target.closest("[data-recite]");
      if (rc) {
        e.stopPropagation();
        go("/recite?t=" + encodeURIComponent(rc.dataset.recite));
        return;
      }
      const it = e.target.closest(".titem");
      if (!it) return;
      const body = it.querySelector(".tbody");
      const act = it.querySelector(".actions");
      body.hidden = !body.hidden;
      act.hidden = body.hidden;
    });
  }

  /* ---------- 成绩统计 ---------- */
  function viewStats(root) {
    const h = DB.data.history;
    const byType = {};
    h.forEach((x) => {
      Object.entries(x.bySection || {}).forEach(([k, v]) => {
        byType[k] = byType[k] || { got: 0, max: 0 };
        byType[k].got += v.got;
        byType[k].max += v.max;
      });
    });
    const avg = h.length ? Math.round(h.reduce((s, x) => s + (x.total || 0), 0) / h.length) : 0;
    root.innerHTML = `${topBar()}
      <h2 style="font-size:18px;margin:10px 2px">成绩统计</h2>
      <div class="card">
        <div class="score"><b>${avg}</b><span> / 100 平均分</span></div>
        <p class="muted" style="text-align:center;margin:0">共完成 ${h.length} 次 · 错题 ${Object.keys(DB.data.mistakes).length} 道</p>
      </div>
      <div class="card"><h3>分题型正确率</h3>
        ${
          Object.keys(byType).length
            ? `<table class="bt"><tr><th>题型</th><th>得分</th><th>满分</th><th>正确率</th></tr>${Object.entries(byType)
                .map(([k, v]) => `<tr><td>${sectionName(k)}</td><td>${v.got.toFixed(1)}</td><td>${v.max}</td><td>${pct(v.got / (v.max || 1))}%</td></tr>`)
                .join("")}</table>`
            : `<div class="empty">还没有成绩</div>`
        }
      </div>
      <div class="card"><h3>历次记录</h3>
        ${
          h.length
            ? `<table class="bt"><tr><th>时间</th><th>得分</th><th>用时</th></tr>${h
                .slice()
                .reverse()
                .slice(0, 20)
                .map((x) => `<tr><td>${fmtDate(x.ts)}</td><td><b>${x.total}</b>/${x.max}</td><td>${x.minutes || "—"} 分</td></tr>`)
                .join("")}</table>`
            : `<div class="empty">完成一次模拟考后会出现在这里</div>`
        }
      </div>`;
  }

  function sectionName(k) {
    return { term: "名词解释", fill: "填空", recite: "默写", short: "简答", essay: "分析论述" }[k] || k;
  }

  /* ---------- 错题本 ---------- */
  function viewMistakes(root) {
    const ms = Object.entries(DB.data.mistakes).sort((a, b) => b[1].ts - a[1].ts);
    root.innerHTML = `${topBar()}
      <h2 style="font-size:18px;margin:10px 2px">错题本</h2>
      <p class="muted" style="margin:0 2px 10px">${ms.length} 道。重做后答对可移除。</p>
      <div class="actions" style="margin:0 2px 10px">
        <button class="btn small primary" id="redoAll">错题重练</button>
        <button class="btn small" id="clearM">清空错题</button>
      </div>
      <div id="mlist">${
        ms.length
          ? ms
              .map(([k, m]) => {
                const it = getItem(m.type, m.id);
                return `<div class="card" style="padding:12px">
                  <div class="bar"><span class="badge y">${sectionName(m.type)}</span><span class="tiny">${esc(it ? (it.ch || "") : "")} · 错 ${m.count || 1} 次</span></div>
                  <div style="margin:6px 0 2px">${esc(previewOf(it, m.type))}</div>
                  <div class="actions"><button class="btn small" data-redo="${m.type}:${m.id}">重做</button>
                  <button class="btn small ghost" data-drop="${k}">已掌握</button></div>
                </div>`;
              })
              .join("")
          : `<div class="empty">干干净净，继续保持。</div>`
      }</div>`;

    $("#mlist").addEventListener("click", (e) => {
      const r = e.target.closest("[data-redo]");
      if (r) return go("/practice?only=" + encodeURIComponent(r.dataset.redo));
      const d = e.target.closest("[data-drop]");
      if (d) {
        delete DB.data.mistakes[d.dataset.drop];
        DB.save();
        viewMistakes(root);
      }
    });
    $("#clearM").addEventListener("click", () => {
      if (!confirm("清空全部错题？")) return;
      DB.data.mistakes = {};
      DB.save();
      viewMistakes(root);
    });
    $("#redoAll").addEventListener("click", () => {
      const ids = ms.map(([k, m]) => m.type + ":" + m.id);
      if (!ids.length) return toast("没有错题");
      go("/practice?only=" + encodeURIComponent(ids.join(",")));
    });
  }

  function previewOf(it, type) {
    if (!it) return "（题目已从题库移除）";
    if (type === "term") return it.term;
    if (type === "fill") return it.stem.replace(/＿+/g, "＿＿");
    if (type === "recite") return "默写：" + it.title;
    if (type === "short") return it.q;
    if (type === "essay") return it.title;
    return "";
  }

  /* ---------- 设置 ---------- */
  function viewSettings(root) {
    const s = DB.data.settings;
    root.innerHTML = `${topBar()}
      <h2 style="font-size:18px;margin:10px 2px">设置</h2>
      <div class="card">
        <h3>考试</h3>
        <label class="muted">模拟考时长（分钟）</label>
        <input id="dur" type="number" min="30" max="300" value="${s.duration}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font:inherit">
        <div class="actions"><button class="btn small primary" id="saveDur">保存</button></div>
      </div>
      <div class="card">
        <h3>AI 批改（可选）</h3>
        <p class="muted" style="margin-top:0">填写后，主观题可以调用大模型按得分点批改。Key 只存在本机浏览器，不会上传到本仓库。</p>
        <label class="muted">API 地址</label>
        <input id="aiBase" value="${esc(s.ai.base)}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font:inherit">
        <label class="muted">模型</label>
        <input id="aiModel" value="${esc(s.ai.model)}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font:inherit">
        <label class="muted">API Key</label>
        <input id="aiKey" type="password" value="${esc(s.ai.key)}" placeholder="sk-..." style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font:inherit">
        <div class="actions"><button class="btn small primary" id="saveAi">保存</button><button class="btn small" id="testAi">测试</button></div>
      </div>
      <div class="card">
        <h3>数据</h3>
        <div class="actions">
          <button class="btn small" id="exp">导出记录</button>
          <button class="btn small" id="imp">导入记录</button>
          <button class="btn small" id="reset">清空全部</button>
        </div>
        <input type="file" id="impFile" accept="application/json" hidden>
        <p class="tiny" style="margin-bottom:0">换手机或换浏览器时，用导出/导入迁移成绩和错题。</p>
      </div>
      <div class="card">
        <h3>关于题库</h3>
        <p class="muted" style="margin:0">题库由课堂笔记与背诵文本整理，答案优先取自背诵篇目原文，其次取自笔记要点。发现错漏可在仓库里改 data/ 下的数据文件。</p>
      </div>`;

    $("#saveDur").addEventListener("click", () => {
      const v = Math.max(30, Math.min(300, parseInt($("#dur").value, 10) || 150));
      s.duration = v;
      DB.save();
      toast("已保存");
    });
    $("#saveAi").addEventListener("click", () => {
      s.ai = { base: $("#aiBase").value.trim().replace(/\/$/, ""), model: $("#aiModel").value.trim(), key: $("#aiKey").value.trim() };
      DB.save();
      toast("已保存");
    });
    $("#testAi").addEventListener("click", async () => {
      try {
        const r = await fetch(s.ai.base + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + ($("#aiKey").value.trim() || s.ai.key) },
          body: JSON.stringify({ model: $("#aiModel").value.trim() || s.ai.model, messages: [{ role: "user", content: "回复：好" }], max_tokens: 5 }),
        });
        toast(r.ok ? "连接成功" : "连接失败：" + r.status);
      } catch (e) {
        toast("连接失败（可能是浏览器跨域限制）");
      }
    });
    $("#exp").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(DB.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "古代文学史题库-记录-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });
    $("#imp").addEventListener("click", () => $("#impFile").click());
    $("#impFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (!d || typeof d !== "object") throw new Error("格式不对");
          DB.data = Object.assign(DEFAULT_DB(), d);
          DB.save();
          toast("导入成功");
          viewSettings(root);
        } catch (err) {
          toast("导入失败：" + err.message);
        }
      };
      rd.readAsText(f);
    });
    $("#reset").addEventListener("click", () => {
      if (!confirm("清空成绩、错题和设置？此操作不可撤销。")) return;
      DB.data = DEFAULT_DB();
      DB.save();
      toast("已清空");
      viewSettings(root);
    });
  }

  /* ---------- 事件委托：导航与返回 ---------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-back]");
    if (b) {
      if (b.dataset.backConfirm && !confirm(b.dataset.backConfirm)) return;
      e.preventDefault();
      goBack(b.dataset.back, b.dataset.backFixed === "1");
      return;
    }
    const n = e.target.closest("[data-nav]");
    if (n) {
      e.preventDefault();
      go(n.dataset.nav);
    }
  });

  /* ---------- 导出 ---------- */
  window.APP = {
    DB, INDEX, getItem, norm, esc, $, $$, toast, go, render, shuffle, sample, uniqBy, chapterList, buildIndex,
    sectionName, fmtDate, VIEWS, PUNCT_RE, topBar, goBack,
  };
  window.VIEWS = VIEWS;

  VIEWS.home = viewHome;
  VIEWS.texts = viewTexts;
  VIEWS.stats = viewStats;
  VIEWS.mistakes = viewMistakes;
  VIEWS.settings = viewSettings;

  DB.load();
  buildIndex();
  window.addEventListener("hashchange", render);
  // exam.js 排在本文件后面，等它的 VIEWS 注册完再首屏渲染，否则直接打开 #/exam 这类深链接会落到首页
  if (document.readyState === "complete") render();
  else window.addEventListener("load", render, { once: true });
})();
