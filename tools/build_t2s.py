import zhconv

pairs = []
for cp in range(0x4E00, 0x9FA6):
    ch = chr(cp)
    s = zhconv.convert(ch, "zh-cn")
    if s != ch and len(s) == 1 and ord(s) <= 0xFFFF:
        pairs.append(ch + s)

out = "window.T2S_PAIRS = " + repr("".join(pairs)) + ";\n"
open("data/t2s.js", "w", encoding="utf-8").write(out)
print("pairs", len(pairs), "bytes", len(out))
