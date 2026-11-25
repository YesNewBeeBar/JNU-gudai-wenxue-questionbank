"""生成单文件版：把 CSS/JS/题库全部内联，方便手机上直接上传或离线打开。
用法：python3 tools/build_standalone.py
"""
import re

root = "."
html = open(f"{root}/index.html", encoding="utf-8").read()

css = open(f"{root}/assets/style.css", encoding="utf-8").read()
html = html.replace('<link rel="stylesheet" href="assets/style.css">', "<style>\n" + css + "\n</style>")
html = re.sub(r'<link rel="manifest"[^>]*>\n?', "", html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', "", html)
html = re.sub(r"<script>if\('serviceWorker'.*?</script>\n?", "", html, flags=re.S)
html = html.replace("<title>中国古代文学史（一）· 题库</title>", "<title>中国古代文学史（一）· 题库（单文件版）</title>")

def inline(m):
    src = m.group(1)
    body = open(f"{root}/{src}", encoding="utf-8").read()
    return "<script>\n/* " + src + " */\n" + body + "\n</script>"

html = re.sub(r'<script src="([^"]+)"></script>', inline, html)

out = f"{root}/单文件版.html"
open(out, "w", encoding="utf-8").write(html)
print("written", out, len(html) // 1024, "KB")
