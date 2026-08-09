import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const uriHandler =vscode.window.registerUriHandler({
		handleUri: async (uri) => {
			if (uri.path === "/dropbox-tokens") {
				console.log("URI received from Dropbox");
				const params = new URLSearchParams(uri.query);

				const accessToken = params.get("access_token");
				const refreshToken = params.get("refresh_token");

				if (accessToken) { await context.secrets.store("dropboxAuthAccessToken", accessToken); }
				if (refreshToken) { await context.secrets.store("dropboxRefreshToken", refreshToken); }
				vscode.window.showInformationMessage("Successfully connected to Dropbox!");
			}
		}
	});

	context.subscriptions.push(uriHandler);

	const disposable = vscode.commands.registerCommand('easy-code-backup.backupDropbox', async () => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Backing up to Dropbox...",
			cancellable: true
		}, async (progress) => {
			if (!context.secrets.get("dropboxAuthAccessToken")) {
				progress.report({ increment: 5, message: "Connecting to Dropbox..." });

				vscode.env.openExternal(vscode.Uri.parse("https://easycodebackup.chows0482.workers.dev/dropbox-auth?" +
					new URLSearchParams({
						"state-fromVSCode": vscode.env.uriScheme === "vscode-insiders" ? "insiders" : "stable",
					}).toString()));
			}
		});
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}