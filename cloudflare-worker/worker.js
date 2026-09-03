export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/dropbox") && request.method == "POST") {
      const formData = await request.formData();

      let accessToken = formData.get("accessToken");
      const refreshToken = formData.get("refreshToken");
      const zippedFile = formData.get("zippedFile");
      const systemTimeZone = formData.get("systemTimeZone");
      const uploadMode = formData.get("uploadMode");

      if (!zippedFile || typeof zippedFile === "string") {
        return new Response("No valid file attached.", { status: 400 });
      }

      const accessTokenValidity = await fetch(
        "https://api.dropboxapi.com/2/check/user",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "valid" }),
        },
      );

      const accessTokenValidityObject = await accessTokenValidity.json();

      if (accessTokenValidityObject.result !== "valid") {
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
        const tokenResponseObject = await tokenResponse.json();
        accessToken = tokenResponseObject.access_token;
      }

      let uploadSessionStartResponse;
      try {
        uploadSessionStartResponse = await fetch(
          "https://content.dropboxapi.com/2/files/upload_session/start",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Dropbox-API-Arg": JSON.stringify({ close: false }),
              "Content-Type": "application/octet-stream",
            },
          },
        );
      } catch (error) {
        return new Response(`Upload session start failed: ${error.message}`, {
          status: 500,
        });
      }

      const sessionData = await uploadSessionStartResponse.json();
      const sessionId = sessionData.session_id;
      const CHUNK_MiB = 64 * 1024 * 1024; // 64 MiB
      const zipSize = zippedFile.size;
      let offset = 0;

      while (offset < zipSize) {
        let nextOffset = Math.min(offset + CHUNK_MiB, zipSize);
        const chunkBlob = zippedFile.slice(offset, nextOffset);

        let uploadSessionAppendResponse;
        try {
          uploadSessionAppendResponse = await fetch(
            "https://content.dropboxapi.com/2/files/upload_session/append_v2",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Dropbox-API-Arg": JSON.stringify({
                  close: false,
                  cursor: {
                    offset: offset,
                    session_id: sessionId,
                  },
                }),
                "Content-Type": "application/octet-stream",
              },
              body: chunkBlob,
            },
          );
        } catch (error) {
          if (error.message.includes("concurrent_session_invalid_offset")) {
            nextOffset = offset;
          } else {
            return new Response(
              `Upload session append failed at offset ${offset}: ${error.message}`,
              { status: 500 },
            );
          }
        }
        offset = nextOffset;
      }

      let uploadSessionFinishResponse;

      try {
        uploadSessionFinishResponse = await fetch(
          "https://content.dropboxapi.com/2/files/upload_session/finish",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Dropbox-API-Arg": JSON.stringify({
                commit: {
                  autorename: true,
                  mode: JSON.parse(uploadMode),
                  mute: true,
                  path: zippedFile.name,
                  strict_conflict: false,
                },
                cursor: {
                  offset: zipSize,
                  session_id: sessionId,
                },
              }),
              "Content-Type": "application/octet-stream",
            },
          },
        );
      } catch (error) {
        return new Response(`Upload session finish failed: ${error.message}`, {
          status: 500,
        });
      }

      const uploadSessionFinishResponseObject =
        await uploadSessionFinishResponse.json();
      return new Response(
        await JSON.stringify(uploadSessionFinishResponseObject),
        {
          status: 201,
        },
      );
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
      let tokenResponse;
      try {
        tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
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
        });

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
          "https://api.dropboxapi.com/2/files/save_url",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa("hr16cwardesohx2:" + env.DROPBOX_APP_SECRET)}`,
              "Content-Type": "application/json",
            },
            body: {
              url: "https://raw.githubusercontent.com/chows0482/EasyCodeBackup/refs/heads/main/README.md",
              path: "/README.md",
            },
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
