"""Bundle the standalone SafeReel preview page into a Worker module."""
from pathlib import Path
import json

root = Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
worker = f'''const APP_HTML = {json.dumps(html, ensure_ascii=False)};

export default {{
  async fetch(request) {{
    const url = new URL(request.url);
    if (url.pathname === "/health") {{
      return Response.json({{ app: "SafeReel", status: "ready", mode: "local-preview" }});
    }}
    if (url.pathname.startsWith("/api/")) {{
      return Response.json({{ error: "AI scanning is not configured yet." }}, {{ status: 503 }});
    }}
    return new Response(APP_HTML, {{
      headers: {{ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }}
    }});
  }}
}};
'''
(root / "worker.js").write_text(worker, encoding="utf-8")
