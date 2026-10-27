import re, html, glob, os, sys
root = sys.argv[1]
chap = sorted(glob.glob(os.path.join(root, "chapters", "*.md")))
out = []
tables = []

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return s

for path in chap:
    lines = open(path, encoding="utf-8").read().replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        l = lines[i]
        if not l.strip() or l.strip() == "---":
            if l.strip() == "---": out.append("<hr>")
            i += 1; continue
        m = re.match(r"^(#{1,3}) (.*)", l)
        if m:
            lv = len(m.group(1))
            if path.endswith("00-hajimeni.md") and lv == 1:
                out.append(f'<div class="title-note">↓ この1行はnoteのタイトル欄に入れます</div><h1>{inline(m.group(2))}</h1>')
            else:
                tag = "h2" if lv == 1 else "h3"
                out.append(f"<{tag}>{inline(m.group(2))}</{tag}>")
            i += 1; continue
        m = re.match(r"^!\[(.*?)\]\(\.\./images/(.+?)\)", l)
        if m:
            out.append(f'<div class="img-slot" contenteditable="false"><div class="img-label">画像を入れる：{m.group(2)}</div><img src="../images/{m.group(2)}" alt=""></div>')
            i += 1; continue
        if l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"-+", c) for c in cells): rows.append(cells)
                i += 1
            n = len(tables) + 1
            name = f"table-{n:02d}.png"
            t = "<table><tr>" + "".join(f"<th>{inline(c)}</th>" for c in rows[0]) + "</tr>" + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:]) + "</table>"
            tables.append(t)
            out.append(f'<div class="img-slot" contenteditable="false"><div class="img-label">表を画像で入れる：paste/{name}（noteは表が使えません）</div><img src="{name}" alt=""></div>')
            continue
        if l.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(inline(lines[i].lstrip("> ").rstrip())); i += 1
            out.append("<blockquote><p>" + "<br>".join(buf) + "</p></blockquote>")
            continue
        m = re.match(r"^(\d+\.|-) (.*)", l)
        if m:
            ordered = m.group(1) != "-"
            items = []
            while i < len(lines):
                m2 = re.match(r"^(\d+\.|-) (.*)", lines[i])
                if m2 and ((m2.group(1) != "-") == ordered):
                    items.append([inline(m2.group(2))]); i += 1
                elif lines[i].startswith("   ") and lines[i].strip() and items:
                    items[-1].append(inline(lines[i].strip())); i += 1
                elif not lines[i].strip() and i + 1 < len(lines) and re.match(r"^(\d+\.|-) ", lines[i+1]) and ((re.match(r"^(\d+\.|-) ", lines[i+1]).group(1) != "-") == ordered):
                    i += 1
                else:
                    break
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join("<li>" + "<br>".join(it) + "</li>" for it in items) + f"</{tag}>")
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|!\[|\||>|\d+\. |- |---$)", lines[i]):
            buf.append(inline(lines[i].rstrip())); i += 1
        out.append("<p>" + "<br>".join(buf) + "</p>")

page = """<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>note貼り付け用</title><style>
body{font-family:sans-serif;max-width:720px;margin:0 auto;padding:16px;line-height:1.8;color:#222;background:#fff}
.guide{background:#fff6d6;border:1px solid #e6c84a;padding:12px 16px;border-radius:8px;font-size:14px}
.img-slot{border:2px dashed #e0457b;border-radius:8px;padding:8px;margin:16px 0;background:#fff0f5}
.img-label{color:#c0245e;font-weight:bold;font-size:14px;margin-bottom:6px}
.img-slot img{max-width:240px;display:block}
.title-note{color:#888;font-size:13px}
blockquote{border-left:4px solid #ccc;margin:12px 0;padding:0 12px;color:#444}
table{border-collapse:collapse}th,td{border:1px solid #999;padding:4px 10px}th{background:#eee}
</style></head><body>
<div class="guide"><b>使い方</b><br>
1. 下の線より後ろを全部選んでコピーし、noteの本文に貼り付けます（タイトルの1行はタイトル欄へ移します）。<br>
2. ピンクの枠は、noteでは画像に置き換える場所です。枠の中の文字を消して、書いてあるファイルをアップロードしてください（images/ と paste/ のフォルダにあります）。<br>
3. 第◯章の見出しは「大見出し」、その中の見出しは「小見出し」になって貼られるはずです。崩れていたら付け直してください。</div>
<hr>
""" + "\n".join(out) + "\n</body></html>"
os.makedirs(os.path.join(root, "paste"), exist_ok=True)
open(os.path.join(root, "paste", "index.html"), "w", encoding="utf-8").write(page)
tpage = """<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:sans-serif}
table{border-collapse:collapse;margin:12px;font-size:15px}th,td{border:1px solid #999;padding:6px 14px;text-align:center}th{background:#eee}</style></head><body>
""" + "\n".join(f'<div class="t" id="t{n+1}" style="display:inline-block">{t}</div><br>' for n, t in enumerate(tables)) + "</body></html>"
open(os.path.join(root, "paste", "_tables.html"), "w", encoding="utf-8").write(tpage)
print(len(out), "blocks", len(tables), "tables")
