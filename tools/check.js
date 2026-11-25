/* 数据自检：node tools/check.js */
const fs = require("fs");
const vm = require("vm");

const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ["t2s", "texts", "fills", "recites", "terms", "shorts", "essays"]) {
  vm.runInContext(fs.readFileSync(`data/${f}.js`, "utf8"), ctx, { filename: f });
}
const w = ctx.window;
let err = 0;
const bad = (m) => { console.log("✗ " + m); err++; };

// 简繁表
if ((w.T2S_PAIRS || "").length % 2) bad("T2S_PAIRS 长度不是偶数");

// id 唯一
const ids = new Set();
for (const [name, arr] of Object.entries({ terms: w.TERMS, shorts: w.SHORTS, essays: w.ESSAYS, recites: w.RECITES, fills: w.FILLS })) {
  arr.forEach((it) => {
    if (ids.has(it.id)) bad("重复 id " + it.id);
    ids.add(it.id);
  });
  console.log(`${name}: ${arr.length}`);
}

// 名词解释：3 分
w.TERMS.forEach((it) => {
  const sum = it.points.reduce((s, p) => s + p.w, 0);
  if (Math.abs(sum - 3) > 0.01) bad(`${it.id} 名词解释得分点合计 ${sum}`);
  if (!it.answer || it.answer.length < 60) bad(`${it.id} 答案过短`);
});

// 简答：10 分
w.SHORTS.forEach((it) => {
  const sum = it.points.reduce((s, p) => s + p.w, 0);
  if (Math.abs(sum - 10) > 0.01) bad(`${it.id} 简答得分点合计 ${sum}`);
});

// 论述
w.ESSAYS.forEach((it) => {
  const sum = it.points.reduce((s, p) => s + p.w, 0);
  if (Math.abs(sum - 10) > 0.01) bad(`${it.id} 论述得分点合计 ${sum}`);
  if (!it.clauses.length) bad(`${it.id} 无标点材料`);
  it.clauses.forEach((c, i) => {
    if (!c.p) bad(`${it.id} 第 ${i} 句缺标点`);
    if (!c.t) bad(`${it.id} 第 ${i} 句缺文本`);
  });
  if (!it.translation || it.translation.length < 40) bad(`${it.id} 译文过短`);
  if (!it.terms || it.terms.length < 3) bad(`${it.id} 字词太少`);
});

// 默写
w.RECITES.forEach((it) => {
  if (!it.text || it.text.length < 20) bad(`${it.id} 默写文本过短`);
  if (/[＿_]/.test(it.text)) bad(`${it.id} 默写文本含填空符`);
});

// 填空：占位符数量与答案数一致
w.FILLS.forEach((it) => {
  const n = (it.stem.match(/＿+/g) || []).length;
  if (n !== it.blanks.length) bad(`${it.id} 占位符 ${n} 个，答案 ${it.blanks.length} 个`);
  it.blanks.forEach((b) => { if (!b.a || b.a.length < 1) bad(`${it.id} 空答案`); });
  if (it.stem.includes("＿＿＿＿")) bad(`${it.id} 连续空`);
});

// 章分布
const chs = {};
for (const arr of [w.TERMS, w.SHORTS, w.ESSAYS, w.RECITES, w.FILLS]) arr.forEach((x) => (chs[x.ch] = (chs[x.ch] || 0) + 1));
console.log("章节分布:", chs);

const blanks = w.FILLS.reduce((s, x) => s + x.blanks.length, 0);
console.log(`填空共 ${blanks} 空`);

if (err) { console.log(`\n${err} 处问题`); process.exit(1); }
console.log("\n数据检查通过");
