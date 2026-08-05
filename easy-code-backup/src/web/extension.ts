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

			const authUrl = "https://easycodebackup.chows0482.workers.dev/dropbox-auth?" +
				new URLSearchParams({
					state: vscode.env.uriScheme === "vscode-insiders" ? "insiders" : "stable",
					fromVSCode: "true"
				}).toString();

			vscode.env.openExternal(vscode.Uri.parse(authUrl));
		});
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}