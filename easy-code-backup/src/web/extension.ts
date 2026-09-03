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
	
	context.subscriptions.push(
		vscode.commands.registerCommand('easy-code-backup.backupDropbox', async () => {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Checking connection to Dropbox...",
				cancellable: true
			}, async (progress, token) => {
				await upload('default', progress, token);
			});
		}),
		vscode.commands.registerCommand('easy-code-backup.customBackupDropbox', async () => {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Checking connection to Dropbox...",
				cancellable: true
			}, async (progress, token) => {
				const localDate = new Intl.DateTimeFormat("en-CA", {
					timeZone: systemTimeZone || "UTC",
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
				}).format(new Date());

				const now = new Date();
				const timeParts = new Intl.DateTimeFormat("en-CA", {
					timeZone: systemTimeZone || "UTC",
					hour: "2-digit",
					minute: "2-digit",
					hour12: false,
				}).formatToParts(now);

				const hour = timeParts.find(p => p.type === 'hour')?.value;
				const minute = timeParts.find(p => p.type === 'minute')?.value;
				const localTime = `${hour}h${minute}m`;
				
				let folderName = await vscode.window.showInputBox({
					prompt: "Enter your backup folder name",
					placeHolder: "Leave empty to use timestamped folder name",
					ignoreFocusOut: true
				});

				if (!folderName) {
					folderName = `${localDate} at ${localTime}`;
				}

				await upload(folderName, progress, token);
			});
		}),
	);

	async function upload(
		uploadType: string,
		progress: vscode.Progress<{ increment: number; message?: string }>,
		token: vscode.CancellationToken
	): Promise<void> {
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
				let folderName = filepathURI.fsPath.split(/[\\/]/).pop() || 'archive';
				const refreshToken = await context.secrets.get("dropboxRefreshToken");

				folderName = uploadType === 'default' ? `/${folderName}/Project` : `/${folderName}/${uploadType}`;

				const rev = context.workspaceState.get("dropboxRev");

				const formData = new FormData();
					formData.append('zippedFile', zipBlob, folderName); 
					formData.append('accessToken', accessToken || '');
					formData.append('refreshToken', refreshToken || '');
					formData.append('systemTimeZone', systemTimeZone);
					formData.append('uploadMode', rev ? JSON.stringify({ ".tag": "update", "update": rev }) : JSON.stringify({ ".tag": "add" }));

				progress.report({ increment: 25, message: `Uploading ${folderName}.zip...` });
				
				const response = await fetch('https://easycodebackup.chows0482.workers.dev/dropbox', {
					method: 'POST',
					body: formData
				});

				if (response.ok) {
					const result = await response.json();
					context.workspaceState.update("dropboxRev", result.rev);
					progress.report({ increment: 100 });
					vscode.window.showInformationMessage(`Backup successful! Uploaded as: ${result.path_display}`);
				} else {
					const errText = await response.text();
					const errDoc = await vscode.workspace.openTextDocument({
						content: `### Upload Failed (${response.status})\n\n\`\`\`html\n${errText}\n\`\`\``,
						language: 'markdown'
					});
					await vscode.window.showTextDocument(errDoc, {
						preview: false, 
						viewColumn: vscode.ViewColumn.Active 
					});
					vscode.window.showErrorMessage(`Upload failed (${response.status}): ${errText}`);
				}

			} catch (error: any) {
				vscode.window.showErrorMessage(`Process error: ${error.message}`);
			}
	}

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
}

export function deactivate() {}