import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const uriHandler = vscode.window.registerUriHandler({
		handleUri: async (uri) => {
			console.log("URI RECEIVED:", uri.toString());
			const params = new URLSearchParams(uri.query);
			const code = params.get("code");

			if (!code) {
				return;
			}

			const verifier = await context.secrets.get(
				"dropboxCodeVerifier"
			);

			if (!verifier) {
				throw new Error("Missing PKCE verifier");
			}

			const tokens = await exchangeDropboxCode(
				code,
				verifier
			);

			console.log(tokens);
		}
	});

	context.subscriptions.push(uriHandler);

	const disposable = vscode.commands.registerCommand('easy-code-backup.backupDropbox', async () => {

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Backing up to Dropbox...",
			cancellable: true
		}, async (progress, token) => {
			
			token.onCancellationRequested(() => {
				vscode.window.showWarningMessage("Backup cancelled by user.");
			});

			progress.report({ increment: 0, message: "Checking connection to Dropbox..." });

				const dropboxVerifier = await context.secrets.get("dropboxCodeVerifier");
				if (true) {
					progress.report({ increment: 0, message: "Connecting to Dropbox..." });
						
						const externalRedirectUri = await vscode.env.asExternalUri(
							vscode.Uri.parse("vscode://chows0482.easy-code-backup/dropbox")
						);

						const workerRedirectUri = "https://easycodebackup.chows0482.workers.dev/dropbox-auth/";

						progress.report({ increment: 0, message: "Connecting to Dropbox..." });

						const verifier = generateCodeVerifier();
						await context.secrets.store("dropboxCodeVerifier", verifier);

						const challenge = await generateCodeChallenge(verifier);

						const authUrl =
							"https://www.dropbox.com/oauth2/authorize?" +
							new URLSearchParams({
								client_id: "hr16cwardesohx2",
								response_type: "code",
								token_access_type: "offline",
								code_challenge: challenge,
								code_challenge_method: "S256",
								redirect_uri: workerRedirectUri,
								state: vscode.env.uriScheme === "vscode-insiders" ? "insiders" : "stable", 
								scope: "files.content.write files.content.read"
							}).toString();

						vscode.env.openExternal(vscode.Uri.parse(authUrl));

				};
			
			await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate a delay for connecting to Dropbox

			progress.report({ increment: 50, message: "Uploading files..." });
			
			await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate a delay for uploading files

			progress.report({ increment: 100, message: "Backup complete!" });
			vscode.window.showInformationMessage("Backup successful!");
		});

	});

	context.subscriptions.push(disposable);
}

function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);

	return Array.from(array)
		.map(element => element.toString(16).padStart(2, "0"))
		.join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const data = new TextEncoder().encode(verifier);

	const hash = await crypto.subtle.digest(
		"SHA-256",
		data
	);

	return btoa(
		String.fromCharCode(...new Uint8Array(hash))
	)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

async function exchangeDropboxCode(
	code: string,
	verifier: string
) {
	const response = await fetch(
		"https://api.dropboxapi.com/oauth2/token",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				code,
				grant_type: "authorization_code",
				client_id: "hr16cwardesohx2",
				code_verifier: verifier
			})
		}
	);

	if (!response.ok) {
		throw new Error(
			`Dropbox token exchange failed: ${response.status}`
		);
	}

	return await response.json();
}

export function deactivate() {}
