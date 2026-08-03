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
        // 1. Securely exchange the code for tokens on your backend worker
        const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: code,
            grant_type: "authorization_code",
            client_id: "hr16cwardesohx2",
            client_secret: env.DROPBOX_APP_SECRET,
            redirect_uri: "https://easycodebackup.chows0482.workers.dev"
          })
        });

        if (!tokenResponse.ok) {
          return new Response("Dropbox token exchange failed", { status: 500 });
        }

        const tokens = await tokenResponse.json();

        // 2. Pick the desktop scheme targeting the user's running environment
        const isInsiders = state === "insiders";
        const baseScheme = isInsiders 
          ? "vscode-insiders://chows0482.easy-code-backup/dropbox" 
          : "vscode://chows0482.easy-code-backup/dropbox";

        // 3. Append tokens directly onto your redirect deep link
        const targetUri = new URL(baseScheme);
        targetUri.searchParams.set("access_token", tokens.access_token);
        if (tokens.refresh_token) {
          targetUri.searchParams.set("refresh_token", tokens.refresh_token);
        }

        // 4. Return an HTML landing block that opens VS Code cleanly
        return new Response(`
          <!DOCTYPE html>
          <html>
          <body style="background: #1e1e1e; color: white; text-align: center; font-family: sans-serif; padding-top: 10vh;">
            <h2>Authorization Complete!</h2>
            <p>Transferring tokens back to your active VS Code window...</p>
            <a href="${targetUri.toString()}" style="color: #007acc;">Click here if your editor doesn't open automatically</a>
            <script>window.location.replace("${targetUri.toString()}");</script>
          </body>
          </html>
        `, { headers: { "Content-Type": "text/html" } });

      } catch (err) {
        return new Response(`Worker Interception Crash: ${err.message}`, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};