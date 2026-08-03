export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/dropbox-auth")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        return new Response("Authorization code missing from Dropbox.", { status: 400 });
      }

      try {
        const fullyDecodedState = decodeURIComponent(decodeURIComponent(state));
        
        let cleanState = fullyDecodedState;
        if (cleanState.includes("vscode://")) {
          cleanState = cleanState.substring(cleanState.indexOf("vscode://"));
        } else if (cleanState.includes("vscode-insiders://")) {
          cleanState = cleanState.substring(cleanState.indexOf("vscode-insiders://"));
        }

        const targetUri = new URL(cleanState);
        targetUri.searchParams.set("code", code);

        return Response.redirect(targetUri.toString(), 302);
      } catch (err) {
        console.error("State extraction crash:", err);
      }

      const fallbackUri = new URL("vscode-insiders://chows0482.easy-code-backup/dropbox");
      fallbackUri.searchParams.set("code", code);
      return Response.redirect(fallbackUri.toString(), 302);
    }

    return new Response("Not Found", { status: 404 });
  },
};