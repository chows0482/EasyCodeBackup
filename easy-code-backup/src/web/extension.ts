import * as vscode from 'vscode';
import * as fflate from 'fflate';

export function activate(context: vscode.ExtensionContext) {
	const systemTimeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

	let resolveAuthPromise: ((token: string) => void) | null = null;
	const uriHandler = vscode.window.registerUriHandler({
		handleUri: async (uri) => {
			if (uri.path === "/dropbox-tokens") {
				console.log("URI received from Dropbox");
				const params = new URLSearchParams(uri.query);

				const accessToken = params.get("access_token");
				const refreshToken = params.get("refresh_token");

				if (accessToken) { await context.secrets.store("dropboxAuthAccessToken", accessToken); }
				if (refreshToken) { await context.secrets.store("dropboxRefreshToken", refreshToken); }

				if (accessToken && resolveAuthPromise) {
					resolveAuthPromise(accessToken);
					resolveAuthPromise = null;
				}
			}
		}
	});

	context.subscriptions.push(uriHandler);

	const disposable = vscode.commands.registerCommand('easy-code-backup.backupDropbox', async () => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Checking connection to Dropbox...",
			cancellable: true
		}, async (progress, token) => {
			try {
				let accessToken = await context.secrets.get("dropboxAuthAccessToken");
				if (!accessToken) {
					progress.report({ increment: 5, message: "Connecting to Dropbox..." });

					vscode.env.openExternal(vscode.Uri.parse("https://easycodebackup.chows0482.workers.dev/dropbox-auth?" +
						new URLSearchParams({
							"state-fromVSCode": vscode.env.uriScheme === "vscode-insiders" ? "insiders" : "stable",
						}).toString()));

					accessToken = await new Promise<string>((resolve, reject) => {
						resolveAuthPromise = resolve;
						
						token.onCancellationRequested(() => {
							resolveAuthPromise = null;
							reject(new Error("Authentication cancelled by user."));
						});
					});

					progress.report({ increment: 10, message: "Authenticated! Resuming backup..." });

				}
				const folders = vscode.workspace.workspaceFolders;
				
				if (!folders || folders.length === 0) {
					vscode.window.showErrorMessage('Please open a folder before running a backup.');
					return;
				}

				const filepathURI = folders[0].uri;

				const zipStructure: fflate.Zippable = {};
				await buildZipStructure(filepathURI, '', zipStructure, token);

				if (Object.keys(zipStructure).length === 0) {
					vscode.window.showWarningMessage("The selected folder is empty or contains no readable files.");
					return;
				}

				if (token.isCancellationRequested) { throw new Error("Backup cancelled by user."); }
				
				progress.report({ increment: 15, message: "Compressing folder..." });
				const zippedData = fflate.zipSync(zipStructure);

				const zipBlob = new Blob([zippedData], { type: 'application/zip' });
				const folderName = filepathURI.fsPath.split(/[\\/]/).pop() || 'archive';
				const refreshToken = await context.secrets.get("dropboxRefreshToken");

				const formData = new FormData();
					formData.append('zippedFile', zipBlob, `${folderName}.zip`); 
					formData.append('accessToken', accessToken || '');
					formData.append('refreshToken', refreshToken || '');
					formData.append('systemTimeZone', systemTimeZone);

				progress.report({ increment: 25, message: `Uploading ${folderName}.zip...` });
				
				const response = await fetch('https://easycodebackup.chows0482.workers.dev/dropbox', {
					method: 'POST',
					body: formData
				});

				if (response.ok) {
					const result = await response.text();
					progress.report({ increment: 100, message: `Uploaded as: ${result}` });
				} else {
					const errText = await response.text();
					vscode.window.showErrorMessage(`Upload failed (${response.status}): ${errText}`);
				}

			} catch (error: any) {
				vscode.window.showErrorMessage(`Process error: ${error.message}`);
			}
		});
	});

	async function buildZipStructure(
		dirUri: vscode.Uri, 
		currentRelativePath: string, 
		structure: fflate.Zippable,
		token: vscode.CancellationToken
	): Promise<void> {
		const entries = await vscode.workspace.fs.readDirectory(dirUri);
		for (const [name, type] of entries) {
			if (token.isCancellationRequested) { return; }
			if (name === 'node_modules' || name === '.git' || name === 'dist') {
				continue;
			}

			const entryUri = vscode.Uri.joinPath(dirUri, name);
			const relativePath = currentRelativePath ? `${currentRelativePath}/${name}` : name;

			if (type === vscode.FileType.Directory) {
				await buildZipStructure(entryUri, relativePath, structure, token);
			} else if (type === vscode.FileType.File) {
				const fileData = await vscode.workspace.fs.readFile(entryUri);
				structure[relativePath] = fileData;
			}
		}
	}

	context.subscriptions.push(disposable);
}

export function deactivate() {}