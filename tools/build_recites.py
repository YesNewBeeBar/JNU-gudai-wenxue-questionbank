import json, re

raw = open("data/texts.js", encoding="utf-8").read()
texts = json.loads(raw.split("=", 1)[1].strip().rstrip(";"))

def find(title, book=None):
    for t in texts:
        if t["title"] == title and (book is None or t["book"] == book):
            return t
    raise SystemExit("missing " + title)

specs = [
    ("r001", "诗经", "关雎", None, None),
    ("r002", "诗经", "静女", None, None),
    ("r003", "诗经", "七月", None, None),
    ("r004", "诗经", "氓", None, None),
    ("r005", "诗经", "硕鼠", None, None),
    ("r006", "诗经", "鹿鸣", None, None),
    ("r007", "论语", "学而篇第一", "子曰：“学而时习之", "传不习乎"),
    ("r008", "论语", "为政篇第二", "子曰：“吾十有五", "不逾矩"),
    ("r009", "老子", "第一章", None, None),
    ("r010", "老子", "第二十五章", None, None),
    ("r011", None, "庄子·逍遥游（节选）", "北冥有鱼", "天池也"),
    ("r012", "春秋左传", "桓公二年", "夏四月，取郜大鼎于宋", "君违，不忘谏之以德"),
    ("r013", "离骚", "离骚", "长太息以掩涕兮", "固前圣之所厚"),
    ("r014", "离骚", "离骚", "依前圣以节中兮", "沾余襟之浪浪"),
    ("r015", None, "史记·太史公自序（节选）", "昔西伯拘羑里", "思来者"),
    ("r016", "汉乐府", "饮马长城窟行", None, None),
    ("r017", "古诗十九首", "行行重行行", None, None),
    ("r018", "古诗十九首", "迢迢牵牛星", None, None),
    ("r019", None, "礼记·大学（节选）", "大学之道", "则近道矣"),
]

CH = {"春秋左传":"左传","离骚":"楚辞","汉乐府":"乐府","庄子·逍遥游（节选）":"庄子","史记·太史公自序（节选）":"史记","礼记·大学（节选）":"礼记"}

out = []
for rid, book, title, start, end in specs:
    t = find(title)
    text = t["text"]
    if start:
        i = text.find(start)
        if i < 0:
            raise SystemExit(f"start not found in {title}: {start}")
        j = text.find(end, i)
        if j < 0:
            raise SystemExit(f"end not found in {title}: {end}")
        j = j + len(end)
        k = 0
        while j < len(text) and text[j] in "。！？”’" and k < 2:
            j += 1
            k += 1
        text = text[i:j]
    text = text.replace("吾十有五而至于学", "吾十有五而志于学")
    out.append({"id": rid, "ch": CH.get(t["book"], t["book"]), "title": t["title"] if title == t["title"] else title, "text": text})

js = "window.RECITES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
open("data/recites.js", "w", encoding="utf-8").write(js)
for r in out:
    print(r["id"], r["title"], len(r["text"]), r["text"][:28], "...", r["text"][-14:])
