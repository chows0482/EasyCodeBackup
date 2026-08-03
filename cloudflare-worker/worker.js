export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/dropbox-auth") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        return new Response("Authorization code missing from Dropbox.", { status: 400 });
      }

      const vsCodeRedirectUri = new URL("vscode://chows0482.easy-code-backup/dropbox");
      vsCodeRedirectUri.searchParams.set("code", code);
      if (state) {
        vsCodeRedirectUri.searchParams.set("state", state);
      }

      return Response.redirect(vsCodeRedirectUri.toString(), 302);
    }
  return new Response("ERROR: 404 Not Found", { status: 404 });
  },
};