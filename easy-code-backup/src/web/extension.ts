import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const uriHandler = vscode.window.registerUriHandler({
		handleUri: async (uri) => {
			console.log("URI RECEIVED:", uri.toString());
			const params = new URLSearchParams(uri.query);
			const code = params.get("code");
			const state = params.get("state");

			if (!code) return;
			const verifier = await context.secrets.get("dropboxCodeVerifier");
			const response = await fetch("https://easycodebackup.chows0482.workers.dev/dropbox-auth?" + new URLSearchParams({
				code: code,
				state: state || "",
				verifier: verifier || ""
			}).toString());

			if (!response.ok) {
				vscode.window.showErrorMessage("Failed token fetch");
				return;
			}

			const tokens = await response.json();

			if (tokens.access_token) {
				await context.secrets.store("dropboxAccessToken", tokens.access_token);
			}
			if (tokens.refresh_token) {
				await context.secrets.store("dropboxRefreshToken", tokens.refresh_token);
			}
			vscode.window.showInformationMessage("Successfully connected to Dropbox!");
		}
	});

	context.subscriptions.push(uriHandler);

	const disposable = vscode.commands.registerCommand('easy-code-backup.backupDropbox', async () => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Backing up to Dropbox...",
			cancellable: true
		}, async (progress) => {
			
			progress.report({ increment: 0, message: "Connecting to Dropbox..." });

			const verifier = generateCodeVerifier();
			await context.secrets.store("dropboxCodeVerifier", verifier);
			const challenge = await generateCodeChallenge(verifier);

			vscode.env.openExternal(vscode.Uri.parse("https://www.dropbox.com/oauth2/authorize?" +
				new URLSearchParams({
					client_id: "hr16cwardesohx2",
					response_type: "code",
					token_access_type: "offline",
					redirect_uri: "https://easycodebackup.chows0482.workers.dev/dropbox-auth",
					state: vscode.env.uriScheme === "vscode-insiders" ? "insiders" : "stable", 
					scope: "files.content.write files.content.read",
					code_challenge: challenge,
					code_challenge_method: "S256"})
			));
		});
	});

	context.subscriptions.push(disposable);
}

function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);

    return Array.from(array)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 43);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const data = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export function deactivate() {}