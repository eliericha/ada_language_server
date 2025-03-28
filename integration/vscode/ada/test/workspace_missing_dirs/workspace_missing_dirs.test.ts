import * as assert from 'assert';
import { activate } from '../utils';

import * as vscode from 'vscode';

suite('Extensions Advanced Test Suite', function () {
    // Make sure the extension is activated
    this.beforeAll(async () => {
        await activate();
    });
    test('Test Add Missing Source Dirs To Workspace', async () => {
        if (vscode.workspace.workspaceFolders !== undefined) {
            let folders = vscode.workspace.workspaceFolders;

            // We should start with only one workspace folder (the root one)
            assert.strictEqual(folders.length, 1);

            // Execute the 'ada.addMissingDirsToWorkspace' command, that imports the missing
            // source directories into the current workspace if needed
            await vscode.commands.executeCommand('ada.addMissingDirsToWorkspace', false, false);

            /**
             * The extension host will restart shortly after the above call. So
             * the test has just the time to do the checks below, yielding a
             * successful test, and the restart of the extension host yields a
             * non-zero process exit code. Callers of this testsuite should not
             * check the process return code.
             */

            // Check that we have 3 workspace folders after executing the command
            folders = vscode.workspace.workspaceFolders;
            assert.strictEqual(folders.length, 3);
        } else {
            throw new Error('No workspace folder found for the specified URI');
        }
    });
});
