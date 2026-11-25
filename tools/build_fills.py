import json, re, hashlib

texts = json.loads(open("data/texts.js", encoding="utf-8").read().split("=", 1)[1].strip().rstrip(";"))

def h(s):
    return int(hashlib.md5(s.encode()).hexdigest(), 16)

CH = {
    "春秋左传": "左传", "离骚": "楚辞", "汉乐府": "乐府",
    "庄子·逍遥游（节选）": "庄子", "齐物论（节选）": "庄子",
    "史记·太史公自序（节选）": "史记", "礼记·大学（节选）": "礼记",
    "礼记·中庸（节选）": "礼记", "礼记·乐记（节选）": "礼记",
    "尚书·尧典（节选）": "尚书", "周易·系辞上（节选）": "周易",
    "周易·系辞下（节选）": "周易", "荀子·劝学（节选）": "荀子",
    "韩非子·喻老（节选）": "韩非子", "论语": "论语", "孟子": "孟子",
}

fills = []
seen = set()
idx = 0

for it in texts:
    book = it["book"]
    title = it["title"]
    text = it["text"]
    # split into sentences keeping no punctuation
    sents = re.split(r"(?<=[。！？])", text)
    made = 0
    limit = 6 if len(text) > 300 else 3 if len(text) > 120 else 2
    for si, sent in enumerate(sents):
        sent = sent.strip()
        if len(sent) < 8:
            continue
        if sent.count("“") != sent.count("”"):
            continue
        if sent[0] in "”’」』）》，。；：、！？":
            continue
        body = sent.rstrip("。！？")
        end = sent[len(body):]
        clauses = [c for c in re.split(r"(?<=[，；：])", body) if c.strip()]
        if len(clauses) < 2:
            continue
        clean = [c.rstrip("，；：") for c in clauses]
        puncts = [c[len(c.rstrip("，；：")):] for c in clauses]
        if max(len(c) for c in clean) > 14:
            continue
        nblank = 1 if len(clean) <= 3 else 2
        cand = [i for i in range(1, len(clean)) if len(clean[i]) >= 2 and "“" not in clean[i] and "”" not in clean[i] and "——" not in clean[i]]
        if not cand:
            continue
        nblank = min(nblank, len(cand))
        start = h(title + str(si)) % max(1, len(cand) - nblank + 1)
        picks = cand[start:start + nblank]
        if not picks:
            continue
        rest = sum(len(clean[i]) for i in range(len(clean)) if i not in picks)
        if rest < 4:
            continue
        stem = ""
        blanks = []
        for ci, (c, p) in enumerate(zip(clean, puncts)):
            if ci in picks:
                stem += "＿＿＿" + p
                blanks.append({"a": c})
            else:
                stem += c + p
        stem += end
        key = stem
        if key in seen:
            continue
        seen.add(key)
        idx += 1
        note = f"《{title}》" if book != title else title
        fills.append({"id": f"f{idx:03d}", "ch": CH.get(book, book), "stem": stem, "blanks": blanks, "note": note})
        made += 1
        if made >= limit:
            break

out = "window.FILLS = " + json.dumps(fills, ensure_ascii=False, separators=(",", ":")) + ";\n"
open("data/fills.js", "w", encoding="utf-8").write(out)
print("fills", len(fills), "blanks", sum(len(f["blanks"]) for f in fills), "kb", len(out) // 1024)
