// Dedicated, isolated preview origin. Client-authored HTML must not share the studio admin origin.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "North Star client preview" });
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    const match = url.pathname.match(/^\/([a-z0-9][a-z0-9-]{0,54})\/?(?:index\.html)?$/);
    if (!match) return new Response("Preview not found", { status: 404 });
    const slug = match[1];
    const mapping = await env.REGISTRY.get("preview:" + slug, "json");
    if (!mapping || !/^build:prospect:[a-z0-9_-]+$/i.test(mapping.build_key || "")) {
      return new Response("Preview not ready", { status: 404 });
    }
    const job = await env.REGISTRY.get(mapping.build_key, "json");
    if (!job || job.id !== mapping.job_id || job.subdomain !== slug ||
        job.preview_route !== "studio" || !["branded", "verified", "ready"].includes(job.stage) ||
        typeof job.html !== "string" || job.html.length < 4000) {
      return new Response("Preview not ready", { status: 404 });
    }
    return new Response(request.method === "HEAD" ? null : job.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex,nofollow",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": "frame-ancestors 'none'",
        "cache-control": "public,max-age=30",
      }
    });
  }
};
