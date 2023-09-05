import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { ContextClients } from './clients';
import { getProjectFile, getObjectDir } from './helpers';
import { integer } from 'vscode-languageclient';

export let controller: vscode.TestController;
export let testRunProfile: vscode.TestRunProfile;

/*
    Types definition for the Gnattest XML file structure
*/
export type Root = {
    tests_mapping: TestMapping;
};

type TestMapping = {
    '@_mode': string;
    additional_tests: string;
    unit: [Unit] | Unit;
};

type Unit = {
    '@_source_file': string;
    test_unit: TestUnit;
};

type TestUnit = {
    '@_target_file': string;
    tested: [Tested] | Tested | undefined;
};

type Tested = {
    '@_line': string;
    '@_name': string;
    test_case: TestCase | [TestCase];
};

type TestCase = {
    '@_line': string;
    '@_name': string;
    test: Test;
};

type Test = {
    '@_column': string;
    '@_line': string;
    '@_file': string;
    '@_name': string;
};

/**
 * The Main function to initialize the test view
 * @param context - the extension contexts
 * @param clients - the language clients
 */
export async function initializeTestView(
    context: vscode.ExtensionContext,
    clients: ContextClients
) {
    if (vscode.workspace.workspaceFolders !== undefined) {
        controller = vscode.tests.createTestController(
            'gnattest-test-controller',
            'GNATtest Test Controller'
        );
        context.subscriptions.push(controller);

        await clients.adaClient.onReady();
        // Getting Paths Information from the server
        const projectFile = await getProjectFile(clients.adaClient);
        const objectDir: string = await getObjectDir(clients.adaClient);
        const gnattestPath = path.join(objectDir, 'gnattest');

        startTestRun(controller, projectFile, gnattestPath);
        await discoverTests(controller, gnattestPath);
    }
}

/**
 * Run Profile and other options configuration for the Test Controller
 * @param controller - the test controller
 * @param projectFile - the full path to the project file
 * @param gnattestPath - the full path to the gnattest folder
 */
function startTestRun(
    controller: vscode.TestController,
    projectFile: string,
    gnattestPath: string
) {
    // the controller's Run Handler
    const runHandler = (request: vscode.TestRunRequest) => {
        const run = controller.createTestRun(request, undefined, false);
        if (request.include == undefined) {
            // The Run All tests request
            const tests = gatherChildTestItems(controller.items);
            // Run all tests handler
            handleRunAll(tests, run, gnattestPath);
        } else {
            // specifique tests run request
            const tests = gatherChildTestItems(request.include);
            // test unit run handler
            handleUnitRun(tests, run, gnattestPath);
        }
    };

    testRunProfile = controller.createRunProfile(
        'GNATtest',
        vscode.TestRunProfileKind.Run,
        runHandler,
        true,
        undefined
    );
    // Tests Configuration Handler to Generates Tests for a Project.
    testRunProfile.configureHandler = () => {
        generateTests(projectFile);
    };
    // Refresh Button to re discover the tests on the project.
    controller.refreshHandler = async () => {
        controller.items.forEach((item) => {
            controller.items.delete(item.id);
        });
        await discoverTests(controller, gnattestPath);
    };
}

/**
 * Run all tests request handler
 * @param tests - test items to run
 * @param run - the current run context
 * @param gnattestPath - the full path to gnattest folder
 */
export function handleRunAll(tests: vscode.TestItem[], run: vscode.TestRun, gnattestPath: string) {
    run.appendOutput('Build Tests \r\n');
    try {
        tests.forEach((item) => {
            run.started(item);
        });
        buildTests(gnattestPath);
    } catch (e) {
        const message = e as Error;
        run.appendOutput('Compilation Failed \r\n');
        run.appendOutput(message.message);
        tests.forEach((item) => {
            run.errored(item, new vscode.TestMessage(message.message));
        });
        run.end();
        return;
    }
    run.appendOutput(`Running All Tests \r\n`);
    try {
        runTests(gnattestPath);
    } catch (e) {
        run.appendOutput('Test Running Failed \r\n');
        run.end();
        return;
    }

    const file = readResultFile(path.join(gnattestPath, 'result.txt'));
    if (file != undefined) {
        parseResults(tests, run, file);
    }
    run.end();
}

/**
 * Test unit/case run request handler
 * @param tests - test items to run
 * @param run - the current run context
 * @param gnattestPath - the full path to gnattest folder
 */
function handleUnitRun(tests: vscode.TestItem[], run: vscode.TestRun, gnattestPath: string) {
    run.appendOutput('Build Tests \r\n');
    try {
        tests.forEach((item) => {
            run.started(item);
        });
        buildTests(gnattestPath);
    } catch (e) {
        const message = e as Error;
        run.appendOutput('Compilation Failed \r\n');
        tests.forEach((item) => {
            run.errored(item, new vscode.TestMessage(message.message));
        });
        run.end();
        return;
    }

    try {
        cleanResults(gnattestPath);
    } catch {
        run.appendOutput('No results to clean\r\n');
    }

    tests.forEach((item) => {
        try {
            run.appendOutput(`Running ${item.id}\r\n`);
            runTestCase(gnattestPath, item);
        } catch (e) {
            run.appendOutput('Running ${item.id} Failed \r\n');
        }
    });

    const file = readResultFile(path.join(gnattestPath, 'result.txt'));
    if (file != undefined) {
        parseResults(tests, run, file);
    }
    run.end();
}

/**
 * Generate the gnattest tests in the background
 * @param projectPath - the full path to project file
 * @returns the stdout from the execution
 */
export function generateTests(projectPath: string) {
    return cp.execSync('gnattest -P ' + projectPath, { timeout: 60000 });
}

/**
 * Build the tests in the background
 * @param gnattestPath - the full path to the gnattest folder
 * @returns the stdout from the execution
 */
export function buildTests(gnattestPath: string) {
    return cp.execSync('gprbuild -P ' + path.join(gnattestPath, 'harness', 'test_driver.gpr'), {
        timeout: 60000,
    });
}

/**
 * Run All the tests in the background
 * @param gnattestPath - the full path to the gnattest folder
 * @returns the stdout from the execution
 */
export function runTests(gnattestPath: string) {
    const ext: string = process.platform == 'win32' ? '.exe' : '';
    return cp.execSync(
        path.join(gnattestPath, 'harness', 'test_runner' + ext) +
            ' > ' +
            path.join(gnattestPath, 'result.txt'),
        { timeout: 60000 }
    );
}

/**
 * Run a single test case in the background
 * @param gnattestPath - the full path to the gnattest folder
 * @param test - the test case to run
 * @returns the stdout from the execution
 */
export function runTestCase(gnattestPath: string, test: vscode.TestItem) {
    const ext: string = process.platform == 'win32' ? '.exe' : '';
    const parent = getParentTestSourceName(test);
    const p: integer | undefined = test.parent?.parent?.range?.start.line;
    const line: integer = p ? p + 1 : 0;
    return cp.execSync(
        path.join(gnattestPath, 'harness', 'test_runner' + ext) +
            ' --routines=' +
            parent.id +
            ':' +
            line.toString() +
            ' >> ' +
            path.join(gnattestPath, 'result.txt'),
        { timeout: 60000 }
    );
}

/**
 * Clean the previous run results
 * @param gnattestPath - the full path to the gnattest folder
 * @returns the stdout from the execution
 */
function cleanResults(gnattestPath: string) {
    return cp.execSync(' > ' + path.join(gnattestPath, 'result.txt'), { timeout: 60000 });
}

/*
    Resolves Tests to run for a selected test item in the Explorer
*/

/**
 * Resolves Tests to run for a selected test item in the Explorer
 * @param collection - the test items selected in the Explorer
 * @returns tests to run
 */
export function gatherChildTestItems(
    collection: vscode.TestItemCollection | readonly vscode.TestItem[]
): vscode.TestItem[] {
    let items: vscode.TestItem[] = [];
    collection.forEach((item) => {
        if (item.children.size == 0) {
            items.push(item);
        } else {
            items = items.concat(gatherChildTestItems(item.children));
        }
    });
    return items;
}

/**
 * Gets the Specification file name for a test item
 * Needed for the --routines switch
 * @param item - a test item
 * @returns - the spec file related test item
 */
export function getParentTestSourceName(item: vscode.TestItem) {
    let parent: vscode.TestItem = item;
    if (item.parent != undefined) {
        parent = getParentTestSourceName(item.parent);
    }
    return parent;
}

/**
 * Return the test_runner output stored in the result.txt file
 * @param resultPath - the full path to the result file
 * @returns the file content
 */
export function readResultFile(resultPath: string) {
    if (pathExists(resultPath)) {
        const file = fs.readFileSync(resultPath);
        return file.toString();
    }
    return undefined;
}

enum Test_State {
    PASSED = 'PASSED',
    FAILED = 'FAILED',
}

/**
 * Parses the result of the file 'result.txt'
 * @param tests - the tests running
 * @param run - the run profile
 * @param file - the tests results
 * @returns parsing state , True if succeded
 */
export function parseResults(
    tests: vscode.TestItem[],
    run: vscode.TestRun | undefined,
    file: string
): boolean {
    const matchs = file.match(
        /(^|\n)((\w|-)+).ad[b|s]:\d+:\d+: (info|error): corresponding test (\w+)/g
    );
    if (matchs) {
        for (let i = 0; i < matchs.length; i++) {
            matchs[i] = matchs[i].replace(/\n/, '');
            for (const e of tests) {
                // Check if the result line is for the test 'e'
                const test_src = getParentTestSourceName(e);
                const p: integer | undefined = e.parent?.range?.start.line;
                const test_line: integer = p ? p + 1 : 0;
                const check_line = matchs[i].match(test_src.label + ':' + test_line.toString());
                // update the state of the test
                if (check_line != null && run != undefined) {
                    const mm: string = matchs[i].substring(matchs[i].length - 6, matchs[i].length);
                    if (mm == Test_State.PASSED) {
                        run.passed(e);
                    } else {
                        run.failed(e, new vscode.TestMessage(matchs[i]));
                    }
                }
            }
        }
        run?.appendOutput(`Run Completed \r\n`);
        return true;
    }
    return false;
}

/**
 * Read the gnattest.xml file
 * @param harnessPath - the full path to the harness folder
 * @returns the content of the gnattest.xml file
 */
export async function readXMLfile(harnessPath: string): Promise<string | undefined> {
    if (pathExists(harnessPath)) {
        const file = await vscode.workspace.fs.readFile(
            vscode.Uri.file(path.join(harnessPath, 'gnattest.xml'))
        );
        return file?.toString().replace(/>\s+</g, '><').trim();
    }
    return undefined;
}

/**
 * Discover tests by parsing the xml input
 * @param controller - the test controller
 * @param gnattestPath - the full path to the gnattest folder
 * @returns the tests tree structure
 */
export async function discoverTests(controller: vscode.TestController, gnattestPath: string) {
    if (vscode.workspace.workspaceFolders !== undefined) {
        const mainPath = vscode.workspace.workspaceFolders[0].uri.path;
        const file = await readXMLfile(path.join(gnattestPath, 'harness'));
        const options = {
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
        };
        if (file !== undefined) {
            const parser = new XMLParser(options);
            const xmlDoc: Root = parser.parse(file) as Root;
            const rootNode = xmlDoc.tests_mapping;
            if (rootNode.unit instanceof Array) {
                for (const u of rootNode.unit) {
                    addUnitTestItems(u, controller, mainPath);
                }
            } else {
                addUnitTestItems(rootNode.unit, controller, mainPath);
            }
            return xmlDoc;
        }
    }
    return undefined;
}

/**
 * Creating nested test items to visuliaze in the view
 * @param unit - a test unit
 * @param controller - the test controller
 * @param mainPath - the full path of the current workspace
 */
function addUnitTestItems(unit: Unit, controller: vscode.TestController, mainPath: string) {
    const srcFile = unit['@_source_file'];
    const srcPath = findFile(srcFile, mainPath);
    const uri = vscode.Uri.file(srcPath);
    const testUnit = controller.createTestItem(srcFile, srcFile, uri);
    const tested = unit.test_unit.tested;
    if (tested instanceof Array) {
        for (const t of tested) {
            addChildBlocks(controller, testUnit, t, mainPath);
        }
        controller.items.add(testUnit);
    } else if (tested) {
        addChildBlocks(controller, testUnit, tested, mainPath);
        controller.items.add(testUnit);
    }
    return;
}

/**
 * Adding Tested blocks to a Test Unit Item
 * @param controller - the test controller
 * @param parentUnit - the parent unit of the test
 * @param tested - a Tested item
 * @param mainPath - the full path of the current workspace
 */
function addChildBlocks(
    controller: vscode.TestController,
    parentUnit: vscode.TestItem,
    tested: Tested,
    mainPath: string
) {
    const featureName = tested['@_name'];
    const range = new vscode.Range(
        new vscode.Position(parseInt(tested['@_line']) - 1, 1),
        new vscode.Position(parseInt(tested['@_line']) - 1, 1)
    );
    const item = controller.createTestItem(featureName, featureName, parentUnit.uri);
    item.range = range;
    if (tested.test_case instanceof Array) {
        for (const e of tested.test_case) {
            addChildCase(controller, item, e, mainPath);
        }
    } else {
        addChildCase(controller, item, tested.test_case, mainPath);
    }
    parentUnit.children.add(item);
}

/**
 * Creating nested test items to visuliaze in the view
 * @param unit - a test unit
 * @param controller - the test controller
 * @param mainPath - the full path of the current workspace
 */
function addChildCase(
    controller: vscode.TestController,
    parentNode: vscode.TestItem,
    testCase: TestCase,
    mainPath: string
) {
    const parentID = parentNode.id;
    const caseName = testCase['@_name'];
    const caseRange = new vscode.Range(
        new vscode.Position(parseInt(testCase['@_line']) - 1, 1),
        new vscode.Position(parseInt(testCase['@_line']) - 1, 1)
    );
    const caseItem = controller.createTestItem(parentID + caseName, caseName, parentNode.uri);
    caseItem.range = caseRange;
    addChildTest(controller, caseItem, testCase, mainPath);
    parentNode.children.add(caseItem);
}

/**
 * Adding Test Child to a Test Case Item
 * @param controller - the test controller
 * @param parentCase - the parent test node
 * @param testCase - a test case
 * @param mainPath - the full path of the current workspace
 */
function addChildTest(
    controller: vscode.TestController,
    parentCase: vscode.TestItem,
    testCase: TestCase,
    mainPath: string
) {
    const test: Test = testCase.test;
    const testfile = test['@_file'];
    const testName = test['@_name'];

    const testrange = new vscode.Range(
        new vscode.Position(parseInt(test['@_line']), 1),
        new vscode.Position(parseInt(test['@_line']), 1)
    );
    const testuri = vscode.Uri.file(findFile(testfile, mainPath));
    const itemChild = controller.createTestItem(testName, testName, testuri);
    itemChild.range = testrange;
    parentCase.children.add(itemChild);
}

/**
 * looks for a specifique file in the workspace
 * @param name - the file name
 * @param directory - directory of the search
 * @returns the path of the file if found
 */
function findFile(name: string, directory: string): string {
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const absolute: string = path.join(directory, file);
        if (fs.statSync(absolute).isDirectory()) {
            const res = findFile(name, absolute);
            if (res != '') return res;
        } else {
            if (file == name) {
                return absolute;
            }
        }
    }
    return '';
}

/**
 * Checking if a path/file exists
 * @param p - the path/file to check
 * @returns boolean
 */
export function pathExists(p: string): boolean {
    try {
        fs.accessSync(p);
    } catch (err) {
        return false;
    }

    return true;
}
