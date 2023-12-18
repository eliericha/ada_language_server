import { createWriteStream, existsSync, unlinkSync } from 'fs';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { logger } from './extension';
import { logErrorAndThrow, setCustomEnvironment } from './helpers';

import fetch from 'node-fetch';
import { tmpdir } from 'os';
import { join } from 'path';
import * as process from 'process';

import { pipeline } from 'stream';
import { AbortSignal } from 'node-fetch/externals';
import { promisify } from 'util';

export function createClient(
    context: vscode.ExtensionContext,
    id: string,
    name: string,
    extra: string[],
    pattern: string
) {
    let serverExecPath: string;

    // If the ALS environment variable is specified, use it as the path of the
    // server executable.
    if (process.env.ALS) {
        serverExecPath = process.env.ALS;
        if (!existsSync(serverExecPath)) {
            logErrorAndThrow(
                `The Ada language server given in the ALS environment ` +
                    `variable does not exist: ${serverExecPath}`,
                logger
            );
        }
    } else {
        serverExecPath = getDefaultALSPath(context);

        if (process.arch == 'arm64' && process.platform == 'darwin') {
            // On arm64 darwin check if the executable exists, and if not, try to
            // fallback to the x64 darwin executable thanks to Apple Rosetta.
            if (!existsSync(serverExecPath)) {
                // The arm64 executable doesn't exist. Try x86.
                const alternateExecPath = context.asAbsolutePath(
                    `x64/${process.platform}/ada_language_server`
                );
                if (existsSync(alternateExecPath)) {
                    // The x86 executable exists, use that instead.
                    serverExecPath = alternateExecPath;
                }
            }
        } else if (process.platform == 'win32') {
            // Add the extension for the file lookup further below
            serverExecPath = `${serverExecPath}.exe`;
        }

        if (!existsSync(serverExecPath)) {
            logErrorAndThrow(
                `This installation of the Ada extension does not have the Ada ` +
                    `language server for your architecture (${process.arch}) ` +
                    `and platform (${process.platform}) ` +
                    `at the expected location: ${serverExecPath}`,
                logger
            );
        }
    }

    logger.info(`Using ALS at: ${serverExecPath}`);

    // Copy this process's environment
    const serverEnv: NodeJS.ProcessEnv = { ...process.env };
    // Set custom environment
    setCustomEnvironment(serverEnv);

    logger.debug(`Environment for ${name}:`);
    for (const key in serverEnv) {
        const value = serverEnv[key];
        if (value) {
            logger.debug(`${key}=${value}`);
        }
    }

    // Options to control the server
    const serverOptions: ServerOptions = {
        run: { command: serverExecPath, args: extra, options: { env: serverEnv } },
        debug: { command: serverExecPath, args: extra, options: { env: serverEnv } },
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for ada sources documents
        documentSelector: [{ scheme: 'file', language: id }],
        synchronize: {
            // Synchronize the setting section 'ada' to the server
            configurationSection: 'ada',
            // Notify the server about file changes to Ada files contain in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher(pattern),
        },
    };
    // Create the language client
    return new LanguageClient(id, name, serverOptions, clientOptions);
}

export function getDefaultALSPath(context: vscode.ExtensionContext): string {
    return context.asAbsolutePath(`${process.arch}/${process.platform}/ada_language_server`);
}

export async function downloadALS(context: vscode.ExtensionContext) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const alsPath = getDefaultALSPath(context);

    context.globalStorageUri;

    // if (existsSync(alsPath)) {
    //     return;
    // }
    const result = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: 'Downloading Ada Language Server',
        },
        (progress, token) => {
            try {
                return doDownloadALS(token, progress);
            } catch (error) {
                if (token.isCancellationRequested) {
                    return Promise.resolve(null);
                } else {
                    throw error;
                }
            }
        }
    );

    void vscode.window.showInformationMessage(`Result was: ${result}`);
}

async function doDownloadALS(
    token: vscode.CancellationToken,
    progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined }>
): Promise<string> {
    let urlOS: string;
    switch (process.platform) {
        case 'linux':
            urlOS = 'Linux';
            break;

        case 'darwin':
            urlOS = 'macOS';
            break;
        case 'win32':
        case 'cygwin':
            urlOS = 'Windows';
            break;

        default:
            throw Error(`Unsupported platform: ${process.platform}`);
            break;
    }

    let urlArch: string;
    switch (process.arch) {
        case 'x64':
            urlArch = 'amd64';
            break;

        case 'arm64':
            urlArch = 'aarch64';
            break;

        default:
            throw Error(`Unsupported architecture: ${process.arch}`);
            break;
    }

    /**
     * First let's figure out the version number of the latest release
     */
    // const urlBase = `https://github.com/AdaCore/ada_language_server`;
    const githubLatestReleaseUrl =
        'https://api.github.com/repos/AdaCore/ada_language_server/releases/latest';

    interface Asset {
        name: string;
        browser_download_url: string;
    }
    interface Release {
        name: string;
        assets: Asset[];
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
        abortController.abort();
    }, 5000);
    let release;
    try {
        logger.debug('Querying GitHub API for latest version', githubLatestReleaseUrl);
        const response = await fetch(githubLatestReleaseUrl, {
            signal: abortController.signal as AbortSignal,
        });
        if (!response.ok) {
            throw new Error(`Could not fetch release: ${response.statusText}`);
        }

        release = (await response.json()) as Release;
    } finally {
        clearTimeout(timeout);
    }

    const asset = release.assets.find((a) => a.name.includes(`${urlOS}_${urlArch}`));

    if (asset) {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        const response = await fetch(asset.browser_download_url, {
            signal: abort.signal as AbortSignal,
        });
        if (!response.ok) {
            throw new Error(response.statusText);
        }
        const size = Number(response.headers.get('content-length'));
        response.body?.on('data', (data: Buffer) => {
            progress.report({ increment: (data.length / size) * 100 });
        });
        const targetPath = join(tmpdir(), asset.name);
        const outStream = createWriteStream(targetPath);
        if (response.body) {
            try {
                await promisify(pipeline)(response.body, outStream);
            } catch (err) {
                if (existsSync(targetPath)) unlinkSync(targetPath);
                throw err;
            }
        }

        return 'Success';
    } else {
        return 'Error';
    }
}
