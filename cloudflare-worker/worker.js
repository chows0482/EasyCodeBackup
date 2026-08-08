export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/dropbox") && request.method == "POST") {
      const formData = await request.formData();

      let accessToken = formData.get("accessToken");
      const refreshToken = formData.get("refreshToken");
      const zippedFile = formData.get("zippedFile");

      const accessTokenValidity = await fetch(
        "https://api.dropboxapi.com/2/check/user",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "valid" }),
        },
      );

      if (accessTokenValidity.result !== "valid") {
        // Refresh the access token
        const tokenResponse = await fetch(
          "https://api.dropboxapi.com/oauth2/token",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa("hr16cwardesohx2:" + env.DROPBOX_APP_SECRET)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: refreshToken,
            }).toString(),
          },
        );
        accessToken = await tokenResponse.json().access_token;
      }

      return new Response("queued", { status: 202 });
    }

    if (url.pathname.startsWith("/dropbox-auth")) {
      if (url.searchParams.get("state-fromVSCode")) {
        const dropboxLoginUrl = new URL(
          "https://www.dropbox.com/oauth2/authorize",
        );
        dropboxLoginUrl.searchParams.set("client_id", "hr16cwardesohx2");
        dropboxLoginUrl.searchParams.set("response_type", "code");
        dropboxLoginUrl.searchParams.set("token_access_type", "offline");
        dropboxLoginUrl.searchParams.set(
          "redirect_uri",
          "https://easycodebackup.chows0482.workers.dev/dropbox-auth",
        );
        dropboxLoginUrl.searchParams.set(
          "state",
          url.searchParams.get("state-fromVSCode") || "stable",
        );

        return Response.redirect(dropboxLoginUrl.toString(), 302);
      }

      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Authorization code missing from Dropbox", {
          status: 400,
        });
      }

      try {
        const tokenResponse = await fetch(
          "https://api.dropboxapi.com/oauth2/token",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa("hr16cwardesohx2:" + env.DROPBOX_APP_SECRET)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              code: code,
              redirect_uri:
                "https://easycodebackup.chows0482.workers.dev/dropbox-auth",
              grant_type: "authorization_code",
            }).toString(),
          },
        );

        if (!tokenResponse.ok) {
          const errRaw = await tokenResponse.text();
          return new Response(`Security Mismatch Rejection: ${errRaw}`, {
            status: 400,
          });
        }

        const tokens = await tokenResponse.json();
        const state = url.searchParams.get("state") || "stable";

        let baseScheme = "vscode://chows0482.easy-code-backup/dropbox-tokens";
        if (state.includes("insiders")) {
          baseScheme =
            "vscode-insiders://chows0482.easy-code-backup/dropbox-tokens";
        }

        const targetUri = new URL(baseScheme);
        targetUri.searchParams.set("access_token", tokens.access_token);
        if (tokens.refresh_token) {
          targetUri.searchParams.set("refresh_token", tokens.refresh_token);
        }

        const testUpload = await fetch(
          "https://api.dropboxapi.com/2/files/upload",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa("hr16cwardesohx2:" + env.DROPBOX_APP_SECRET)}`,
              "Content-Type": "application/x-www-form-urlencoded",
              autorename: false,
              mode: "add",
              mute: false,
              path: "/README.md",
              strict_conflict: false,
            },
            body: "Easy Code Backup has been authorized and is working! You can now use the Easy Code Backup extension in VSCode to backup and sync your code to the Dropbox Easy Code Backup app folder.",
          },
        );

        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <body style="background: #000000; color: white; text-align: center; font-family: sans-serif; padding-top: 10vh;">
            <h2>Successfully Authorized!</h2>
            <p>Opening your editor...</p>
            <a href="${targetUri.toString()}" style="color: #007acc; font-weight: bold; text-decoration: none;">Click here if your editor doesn't open automatically</a>
            <script>window.location.replace("${targetUri.toString()}");</script>
          </body>
          </html>
        `,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      } catch (error) {
        return new Response(
          `Worker Interception Crash: ${error.message}: ${error.stack}`,
          { status: 500 },
        );
      }
    }
    return new Response("Not Found", { status: 404 });
  },
};
