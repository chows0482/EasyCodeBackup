export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/dropbox-auth")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        return new Response("Authorization code missing from Dropbox.", { status: 400 });
      }

      const baseScheme = state === "insiders"
        ? "vscode-insiders://chows0482.easy-code-backup/dropbox" 
        : "vscode://chows0482.easy-code-backup/dropbox";

      const targetUri = new URL(baseScheme);
      targetUri.searchParams.set("code", code);

      return Response.redirect(targetUri.toString(), 302);
    }

    return new Response("Not Found", { status: 404 });
  },
};
