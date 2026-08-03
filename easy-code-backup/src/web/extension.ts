import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const uriHandler = vscode.window.registerUriHandler({
		handleUri: async (uri) => {
			console.log("URI RECEIVED:", uri.toString());
			const params = new URLSearchParams(uri.query);

			const accessToken = params.get("access_token");
			const refreshToken = params.get("refresh_token");

			if (accessToken) {
				await context.secrets.store("dropboxAccessToken", accessToken);
			}
			if (refreshToken) {
				await context.secrets.store("dropboxRefreshToken", refreshToken);
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

			const workerRedirectUri = "https://workers.dev";
			const isInsidersEnv = vscode.env.uriScheme === "vscode-insiders";

			// 2. Clean, basic OAuth URL with zero PKCE challenge bloat
			const authUrl =
				"https://dropbox.com?" +
				new URLSearchParams({
					client_id: "hr16cwardesohx2",
					response_type: "code",
					token_access_type: "offline",
					redirect_uri: workerRedirectUri,
					state: isInsidersEnv ? "insiders" : "stable", 
					scope: "files.content.write files.content.read"
				}).toString();

			vscode.env.openExternal(vscode.Uri.parse(authUrl));
		});
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}