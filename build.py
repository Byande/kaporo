#!/usr/bin/env python3
"""Assemble Kaporo : src/head.html + src/body.html + src/js/*.js → docs/index.html (GitHub Pages)."""
import pathlib
here = pathlib.Path(__file__).parent
html = (here / "src/head.html").read_text(encoding="utf-8") + (here / "src/body.html").read_text(encoding="utf-8")
js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((here / "src/js").glob("*.js")))
html += "<script>\n" + js + "\n</script>\n</body>\n</html>\n"
out = here / "docs"; out.mkdir(exist_ok=True)
(out / "index.html").write_text(html, encoding="utf-8")
(out / "404.html").write_text(html, encoding="utf-8")
(out / "_app.js").write_text(js, encoding="utf-8")
(out / ".nojekyll").write_text("")
print("OK —", out / "index.html", f"{len(html.encode())/1e3:.0f} Ko")
