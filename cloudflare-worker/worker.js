export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/dropbox-auth")) {
      if (url.searchParams.get("state-fromVSCode")) {
        const dropboxLoginUrl = new URL("https://www.dropbox.com/oauth2/authorize");
        dropboxLoginUrl.searchParams.set("client_id", "hr16cwardesohx2");
        dropboxLoginUrl.searchParams.set("response_type", "code");
        dropboxLoginUrl.searchParams.set("token_access_type", "offline");
        dropboxLoginUrl.searchParams.set("redirect_uri", "https://easy-code-backup.chows0482.workers.dev/dropbox-auth");
        dropboxLoginUrl.searchParams.set("state", url.searchParams.get("state-fromVSCode") || "stable");

        return Response.redirect(dropboxLoginUrl.toString(), 302);
      }

      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Authorization code missing from Dropbox", { status: 400 });
      }
      
      try {
        const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: code,
            grant_type: "authorization_code",
            client_id: "hr16cwardesohx2",
            client_secret: env.DROPBOX_APP_SECRET,
            redirect_uri: "https://easy-code-backup.chows0482.workers.dev/dropbox-auth"
          }).toString()
        });

        if (!tokenResponse.ok) {
          const errRaw = await tokenResponse.text();
          return new Response(`Security Mismatch Rejection: ${errRaw}`, { status: 400 });
        }

        const tokens = await tokenResponse.json();
        
        let baseScheme = "vscode://chows0482.easy-code-backup/dropbox";
        if (state === "insiders" || state.includes("insiders")) {
          baseScheme = "vscode-insiders://chows0482.easy-code-backup/dropbox";
        }

        const targetUri = new URL(baseScheme);
        targetUri.searchParams.set("access_token", tokens.access_token);
        if (tokens.refresh_token) {
          targetUri.searchParams.set("refresh_token", tokens.refresh_token);
        }

        return new Response(`
          <!DOCTYPE html>
          <html>
          <body style="background: #1e1e1e; color: white; text-align: center; font-family: sans-serif; padding-top: 10vh;">
            <h2>Security Verified!</h2>
            <p>Syncing encrypted credentials safely back to your editor profile...</p>
            <a href="${targetUri.toString()}" style="color: #007acc; font-weight: bold; text-decoration: none;">Click here if your editor doesn't open automatically</a>
            <script>window.location.replace("${targetUri.toString()}");</script>
          </body>
          </html>
        `, { headers: { "Content-Type": "text/html; charset=utf-8" } });

      } catch (err) {
        return new Response(`Worker Interception Crash: ${err.message}`, { status: 500 });
      }
    }
    return new Response("Not Found", { status: 404 });
  },
};