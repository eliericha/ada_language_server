import * as dotenv from 'dotenv';
import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from './extension';

export function getEnvFile(): vscode.Uri | undefined {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.env');
    }

    return undefined;
}

export async function parseEnvFile(envFileUri: vscode.Uri): Promise<{ [name: string]: string }> {
    const content = (await vscode.workspace.fs.readFile(envFileUri)).toLocaleString();

    return dotenv.parse(content);
}

export async function applyEnvFile(
    targetEnv: NodeJS.ProcessEnv,
    envFileUri: vscode.Uri,
): Promise<void> {
    const envVars = await parseEnvFile(envFileUri);

    for (const [key, value] of Object.entries(envVars)) {
        if (isPathVariable(key)) {
            const existingValue = targetEnv[key];
            if (existingValue) {
                logger.debug('Appending value to existing path variable: %j', {
                    key,
                    existingValue,
                    delimiter: path.delimiter,
                    appendedValue: value,
                });
                targetEnv[key] = `${existingValue}${path.delimiter}${value}`;
            } else {
                logger.debug('Setting path variable with no pre-existing value: %j', {
                    key,
                    value,
                });
                targetEnv[key] = value;
            }
        } else {
            logger.debug('Setting environment variable: %j', { key, value });
            targetEnv[key] = value;
        }
    }
}

const pathVariableNames = [
    'PATH',
    'PYTHONPATH',
    'NODE_PATH',
    'CLASSPATH',
    'LD_LIBRARY_PATH',
    'DYLD_LIBRARY_PATH',
];

/**
 * Return true if the variable name is known to hold a list of paths, such as
 * PATH, PYTHONPATH, etc. This is important because such variables should be
 * merged with the existing value rather than overwritten.
 *
 * @param key - name of an environment variable
 */
function isPathVariable(key: string) {
    return pathVariableNames.includes(key);
}

export async function setEnvFileEnvironment(env: NodeJS.ProcessEnv) {
    const envFileUri = getEnvFile();
    if (envFileUri && (await fileExists(envFileUri))) {
        logger.info('Applying environment variables from env file: %j', {
            envFilePath: envFileUri.fsPath,
        });
        await applyEnvFile(env, envFileUri);
    }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}
