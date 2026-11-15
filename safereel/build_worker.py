"""Bundle the standalone SafeReel page into a Cloudflare Worker module."""
from pathlib import Path
import json

root = Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
template = (root / "worker.template.js").read_text(encoding="utf-8")
(root / "worker.js").write_text(template.replace("__APP_HTML__", json.dumps(html, ensure_ascii=False)), encoding="utf-8")
