export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/dropbox-auth") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        return new Response("Authorization code missing from Dropbox.", { status: 400 });
      }

      try {
        const targetUri = state ? new URL(decodeURIComponent(state)) : null;

        if (targetUri) {

          targetUri.searchParams.set("code", code);

          return Response.redirect(targetUri.toString(), 302);
        }
      } catch (err) {
        console.error("Failed to parse state URI:", err);
      }

      const fallbackUri = new URL("vscode://chows0482.easy-code-backup/dropbox");
      fallbackUri.searchParams.set("code", code);
      return Response.redirect(fallbackUri.toString(), 302);
    }

    return new Response("Not Found", { status: 404 });
  },
};
