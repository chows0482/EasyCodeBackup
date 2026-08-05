export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/dropbox-auth")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const verifier = url.searchParams.get("verifier");
      
      if (!code) {
        return new Response("Authorization code missing from Dropbox.", { status: 400 });
      }

      try {
        const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: code,
            grant_type: "authorization_code",
            client_id: "hr16cwardesohx2",
            redirect_uri: "https://easycodebackup.chows0482.workers.dev/dropbox-auth" ,
            code_verifier: verifier
          }).toString()
        });

        if (!tokenResponse.ok) {
          const errRaw = await tokenResponse.text();
          return new Response(`Security Mismatch Rejection: ${errRaw}`, { status: 400 });
        }

        const tokens = await tokenResponse.json();
        const isInsiders = state === "insiders";
        const baseScheme = isInsiders 
          ? "vscode-insiders://chows0482.easy-code-backup/dropbox" 
          : "vscode://chows0482.easy-code-backup/dropbox";

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
