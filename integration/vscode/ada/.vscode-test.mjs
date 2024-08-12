import { defineConfig } from '@vscode/test-cli';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import * as os from 'os';
import { join, normalize, resolve } from 'path';

let baseMochaOptions = {
    ui: 'tdd',
    color: true,
};

if (process.env.MOCHA_REPORTER) {
    // If a reporter was specified externally, use it. For example, the CI
    // environment could set this to 'mocha-junit-reporter' to produce JUnit
    // results.
    baseMochaOptions.reporter = process.env.MOCHA_REPORTER;
}

if (!baseMochaOptions.reporterOptions) {
    baseMochaOptions.reporterOptions = {
        maxDiffSize: 0,
    };
}

if (process.env['MOCHA_TIMEOUT']) {
    baseMochaOptions.timeout = process.env['MOCHA_TIMEOUT'];
} else {
    /**
     * Some tests involve calling gprbuild which takes time. So we disable test
     * timeouts altogether.
     */
    baseMochaOptions.timeout = '0';
}

if (process.env['MOCHA_GREP']) {
    baseMochaOptions.grep = process.env['MOCHA_GREP'];
}

/**
 * The Extension Test Runner extension for VS Code starts runs test in a VS
 * Code instance that inherits the parent process's environment but doesn't
 * take into consideration the terminal.integrated.env.* setting. So tests that
 * rely on a GNAT toolchain won't find one in the environment, unless it was
 * provided in the environment prior to starting the development VS Code
 * instance which can be difficult in a remote environment.
 *
 * This function reads the settings of the workspace folder, extracts the
 * applicable terminal.integrated.env.* setting and returns the value so that
 * it may be used for test execution.
 */
function getEnv(workspacePath) {
    /**
     * Obtain env from VS Code workspace
     */
    const wsPath = resolve(workspacePath);
    const wsSettingsPath = join(wsPath, '.vscode', 'settings.json');
    let wsEnv = {};
    if (existsSync(wsSettingsPath)) {
        const data = readFileSync(wsSettingsPath).toLocaleString();
        const wsSettings = JSON.parse(data);
        let osName;
        switch (process.platform) {
            case 'win32':
                osName = 'windows';
                break;

            case 'darwin':
                osName = 'osx';
                break;

            default:
                osName = process.platform;
                break;
        }
        const setting = `terminal.integrated.env.${osName}`;
        if (setting in wsSettings) {
            wsEnv = wsSettings[setting];
            // console.info('Found env: ' + JSON.stringify(wsEnv, undefined, 2));
            evalEnv(wsEnv, wsPath);
            // console.info('Evaluated env: ' + JSON.stringify(wsEnv, undefined, 2));
        }
    }

    return wsEnv;

    function evalEnvValue(value, workspaceFolder) {
        const wsRe = /\${workspaceFolder}/g;
        value = value.replace(wsRe, workspaceFolder);

        const envRe = /\${env:(\w+)}/g;
        value = value.replace(envRe, function (variable) {
            return process.env[variable.match(envRe)[1]] || '';
        });

        return value;
    }

    function evalEnv(env, workspaceFolder) {
        for (const k in env) {
            env[k] = evalEnvValue(env[k], workspaceFolder);
        }
    }
}

let env;
if ('MOCHA_RESULTS_DIR' in process.env) {
    /**
     * If called by outer automation, do not set up the environment because the
     * automation already sets that up.
     */
    env = {};
} else {
    env = getEnv('./../../..');
}

const testsuites = ['general', 'gnattest', 'workspace_missing_dirs'];

export default defineConfig(
    testsuites.map((suiteName) => {
        // --user-data-dir is set to a unique directory under the OS
        // default tmp directory for temporary files to avoid
        // warnings related to longs paths in IPC sockets created by
        // VSCode. The directory is made unique to avoid
        // interference between successive runs.
        //
        // It also allows multiple testsuites to run concurrently with each VS
        // Code instance using a different User data directory. This can happen
        // when tests are launched from the VS Code UI.
        const tmpdir = mkdtempSync(`${os.tmpdir()}/vsc-ada-test-`);

        // Create a mocha options objects by copying the base one
        let mochaOptions = { ...baseMochaOptions };

        if (process.env.MOCHA_REPORTER) {
            /**
             * Produce results for each testsuite separately
             */
            const mochaFile = process.env.MOCHA_RESULTS_DIR
                ? join(process.env.MOCHA_RESULTS_DIR, `${suiteName}.xml`)
                : `${suiteName}.xml`;
            mochaOptions.reporterOptions = { mochaFile: mochaFile };
        }

        return {
            label: `Ada extension testsuite: ${suiteName}`,
            files: `out/test/suite/${suiteName}/**/*.test.js`,
            workspaceFolder: `./test/workspaces/${suiteName}`,
            mocha: mochaOptions,
            env: env,
            launchArgs: [
                // It's important to use the --user-data-dir=<path> form. The
                // --user-data-dir <path> form sometimes gets <path> considered
                // as another workspace root directory.
                `--user-data-dir=${tmpdir}`,
            ],
            // Use external installation if provided in the VSCODE env variable
            useInstallation: process.env.VSCODE ? { fromPath: process.env.VSCODE } : undefined,
        };
    })
);
