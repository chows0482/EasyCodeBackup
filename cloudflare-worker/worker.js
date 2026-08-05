export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/dropbox-auth")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "";

      if (url.searchParams.get("fromVSCode") === "true") {
        const verifierBytes = new Uint8Array(32);
        crypto.getRandomValues(verifierBytes);
        const verifier = Array.from(verifierBytes)
          .map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 43);
        const msgBuffer = new TextEncoder().encode(verifier);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

        const hashBytes = new Uint8Array(hashBuffer);
        let binaryString = "";
        for (let i = 0; i < hashBytes.byteLength; i++) {
          binaryString += String.fromCharCode(hashBytes[i]);
        }

        const challenge = btoa(binaryString)
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');

        const jsonStr = JSON.stringify({ e: state || "stable", v: verifier });
        const packedState = Array.from(new TextEncoder().encode(jsonStr))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        return Response.redirect("https://dropbox.com?" + new URLSearchParams({
          client_id: "hr16cwardesohx2",
          response_type: "code",
          token_access_type: "offline",
          redirect_uri: "https://workers.dev",
          state: packedState,
          scope: "files.content.write files.content.read",
          code_challenge: challenge,
          code_challenge_method: "S256"
        }).toString(), 302);
      }

      if (!code) {
        return new Response("Authorization code missing from Dropbox.", { status: 400 });
      }

      try {
        let verifier = "";
        let targetEditor = "stable";

        const decodedState = decodeURIComponent(state).trim();

        if (decodedState.includes("vscode-insiders") || decodedState === "insiders") {
          targetEditor = "insiders";
          verifier = ""; 
        } else if (decodedState === "stable") {
          targetEditor = "stable";
          verifier = "";
        } else if (/^[0-9a-fA-F]+$/.test(decodedState)) {
          const matches = decodedState.match(/.{1,2}/g);
          if (matches) {
            const bytes = new Uint8Array(matches.map(byte => parseInt(byte, 16)));
            const unpackedData = JSON.parse(new TextDecoder().decode(bytes));
            verifier = unpackedData.v;
            targetEditor = unpackedData.e;
          }
        }

        const tokenParams = {
          code: code,
          grant_type: "authorization_code",
          client_id: "hr16cwardesohx2",
          redirect_uri: "https://workers.dev"
        };

        if (verifier) {
          tokenParams.code_verifier = verifier;
        }

        const tokenResponse = await fetch("https://dropboxapi.com", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(tokenParams).toString()
        });

        if (!tokenResponse.ok) {
          const errRaw = await tokenResponse.text();
          return new Response(`Security Mismatch Rejection: ${errRaw}`, { status: 400 });
        }

        const tokens = await tokenResponse.json();
        let baseScheme = "vscode://chows0482.easy-code-backup/dropbox";
        if (targetEditor === "insiders" || decodedState.includes("vscode-insiders")) {
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