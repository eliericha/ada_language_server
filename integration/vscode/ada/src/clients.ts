import { createWriteStream, existsSync, unlinkSync } from 'fs';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { logger } from './extension';
import { logErrorAndThrow, setCustomEnvironment } from './helpers';
import assert from 'assert';

import { FollowOptions, https } from 'follow-redirects';

import * as process from 'process';
import { basename, join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'url';
import { RequestOptions } from 'https';

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
    const alsPath = getDefaultALSPath(context);

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
            return new Promise<string>((resolve) => {
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
                const urlBase = `https://github.com/AdaCore/ada_language_server`;
                let resolvedUrl: string | null = null;
                const rq = https.request(`${urlBase}/releases/latest`, (response) => {
                    resolvedUrl = response.responseUrl;
                    response.resume();
                    const version = basename(resolvedUrl);
                    let totalSize: number;
                    // eslint-disable-next-line max-len
                    const url = `${urlBase}/releases/download/${version}/als-${version}-${urlOS}_${urlArch}.zip`;
                    const targetBasename = basename(url);
                    const targetPath = join(tmpdir(), targetBasename);
                    logger.debug(`Downloading ALS from ${url} to ${targetPath}`);
                    const targetWriteStream = createWriteStream(targetPath);

                    const options: RequestOptions & FollowOptions<RequestOptions> = parse(url);
                    options.maxRedirects = 1;
                    const rq = https
                        .request(options)
                        .on('response', (response) => {
                            if (response.statusCode !== 200) {
                                assert(response.statusCode);
                                const msg =
                                    'Ada Language Server download failed with status code ' +
                                    response.statusCode?.toString();
                                resolve(msg);
                                throw Error(msg);
                            }

                            if (response.headers['content-length']) {
                                totalSize = +response.headers['content-length'];
                                progress.report({ increment: 0 });
                            }

                            response
                                .on('data', (chunk) => {
                                    if ('length' in chunk) {
                                        // eslint-disable-next-line max-len
                                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                                        const length = +chunk.length;
                                        progress.report({
                                            increment: (length / totalSize) * 100,
                                        });
                                    }
                                })
                                .pipe(targetWriteStream)
                                .on('error', (err) => {
                                    const result = `Error: ${err.message}`;
                                    unlinkSync(alsPath);
                                    resolve(result);
                                });
                        })
                        .on('error', (err) => {
                            const result = `Error: ${err.message}`;
                            resolve(result);
                        });

                    token.onCancellationRequested(() => {
                        rq.destroy();
                        resolve('Cancelled');
                    });

                    targetWriteStream.on('error', (err) => {
                        const result = `Error: ${err.message}`;
                        unlinkSync(alsPath);
                        resolve(result);
                    });

                    targetWriteStream.on('finish', () => {
                        progress.report({ increment: 100 });
                        targetWriteStream.close();
                        resolve('Finished');
                    });

                    rq.end();
                });
                rq.on('error', (err) => {
                    resolve(`Error: ${err.message}`);
                });
                rq.end();
            });
        }
    );

    void vscode.window.showInformationMessage(`Result was: ${result}`);
}
