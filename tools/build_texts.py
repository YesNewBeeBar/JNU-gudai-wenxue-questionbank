import json, re

src = "materials/背诵文本.md"
txt = open(src, encoding="utf-8").read()

items = []
book = section = None
cur = None
for raw in txt.splitlines():
    line = raw.rstrip()
    if not line.strip():
        continue
    if line.startswith("### "):
        cur = {"book": book, "section": section, "title": line[4:].strip(), "lines": []}
        items.append(cur)
    elif line.startswith("## "):
        section = line[3:].strip()
        cur = {"book": book, "section": section, "title": section, "lines": []}
        items.append(cur)
    elif line.startswith("# "):
        book = line[2:].strip()
        section = None
        cur = {"book": book, "section": None, "title": book, "lines": []}
        items.append(cur)
    elif cur is not None:
        cur["lines"].append(line.strip())

items = [it for it in items if it["lines"]]
for it in items:
    it["text"] = "\n".join(it["lines"])

out = "window.TEXTS = " + json.dumps(items, ensure_ascii=False, separators=(",", ":")) + ";\n"
open("data/texts.js", "w", encoding="utf-8").write(out)
print("items", len(items), "chars", len(out))
