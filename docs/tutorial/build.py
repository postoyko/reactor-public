"""Builds docs/dashboard-designer-tutorial.html (one file, screenshots embedded) from tutorial.md and img/.

    pip install markdown
    python3 docs/tutorial/build.py

Edit tutorial.md, put new screenshots in img/ and reference them as img/<name>.png, then rebuild.
"""
import markdown, base64, re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'tutorial.md')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'dashboard-designer-tutorial.html')
imgdir = sys.argv[3] if len(sys.argv) > 3 else here
md = open(src, encoding='utf8').read()
body = markdown.markdown(md, extensions=['tables', 'fenced_code', 'toc', 'md_in_html', 'sane_lists'], extension_configs={'toc': {'title': 'Contents', 'toc_depth': '2-2'}})
def inline(m):
    p = os.path.join(imgdir, m.group(1))
    return 'src="data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode() + '"'
body = re.sub(r'src="([\w./-]+\.png)"', inline, body)
body = re.sub(r'<p>(<img [^>]*alt="([^"]*)"[^>]*/?>)</p>', r'<figure>\1<figcaption>\2</figcaption></figure>', body)
css = """
:root{--bg:#f4f4f4;--paper:#fff;--ink:#161616;--muted:#525252;--line:#e0e0e0;--accent:#0f62fe;--code:#f2f4f8;--th:#f4f4f4}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--paper:#1e1e1e;--ink:#f4f4f4;--muted:#a8a8a8;--line:#393939;--accent:#78a9ff;--code:#262626;--th:#262626}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "IBM Plex Sans",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:1000px;margin:0 auto;padding:40px 16px 80px;background:var(--paper);min-height:100vh}
@media(min-width:700px){main{padding:56px 56px 96px}}
h1{font-size:2.2rem;font-weight:400;margin:0 0 4px}
h2{font-size:1.55rem;font-weight:500;margin:56px 0 12px;padding-top:16px;border-top:1px solid var(--line)}
h3{font-size:1.15rem;font-weight:600;margin:28px 0 8px}
.byline{color:var(--muted);margin:0 0 20px}
a{color:var(--accent)}
code{font:0.88em "IBM Plex Mono",Menlo,Consolas,monospace;background:var(--code);padding:1px 5px;border-radius:3px}
pre{background:var(--code);padding:14px 16px;overflow-x:auto;border-radius:4px}pre code{padding:0;background:none}
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:.93rem;display:block;overflow-x:auto}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{background:var(--th);font-weight:600}
figure{margin:20px 0}img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:4px;display:block}
figcaption{color:var(--muted);font-size:.85rem;margin-top:6px}
.narrow img{max-width:300px}.narrow2 img{max-width:620px}
.tabs4{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:16px 0}.tabs4 p{display:contents}
@media(min-width:800px){.tabs4{grid-template-columns:repeat(4,1fr)}}
.toc{background:var(--th);border:1px solid var(--line);border-radius:4px;padding:12px 20px;margin:24px 0}
.toc .toctitle{font-weight:600}.toc ul{margin:6px 0;padding-left:20px}
@media print{body{background:#fff}main{max-width:none;padding:0}h2{break-before:page;border:0}figure,table{break-inside:avoid}}
"""
html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard Designer tutorial</title><style>{css}</style></head><body><main>{body}</main></body></html>"""
open(out, 'w', encoding='utf8').write(html)
print(len(html))
