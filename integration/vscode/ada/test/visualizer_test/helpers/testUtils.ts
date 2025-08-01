export enum WebViewName {
    CALL = 'Show Call Hierarchy Graph',
    TYPE = 'Show Type Hierarchy Graph',
    FILE = 'Show File Dependencies Graph',
    GPR = 'Show GPR Dependencies Graph',
}

export enum SubButtonType {
    HIERARCHY,
    FOLD_OPENED,
    FOLD_CLOSED,
}

export const SHA1_LEN = 40;

/**
 * Open a specific file in a VS Code workspace and then open the Graph WebView from a specific
 * position in the file.
 * It is also possible to specify which type of WebView to open by specify its button name.
 *
 * @param fileName - The name of the file to open.
 * @param lineNb - The 0-based line number of the symbol used to create the graph.
 * @param symbolName - The name of the symbol used to create the graph.
 * @param graphKind - The kind of graph to open.
 */
export async function openWebView(
    fileName: string,
    lineNb: number,
    symbolName: string,
    graphKind: WebViewName,
) {
    await browser.executeWorkbench(
        async (vscode, { fileName }) => {
            const workspacePath = vscode.Uri.joinPath(
                vscode.workspace.workspaceFolders[0].uri,
                fileName,
            );

            // Open and show the text document.
            const doc = await vscode.workspace.openTextDocument(workspacePath);
            await vscode.window.showTextDocument(doc);
        },
        { fileName },
    );

    const workbench = await browser.getWorkbench();

    // Get the line the wanted symbol is in.
    const line = await $(`div.view-lines > div.view-line:nth-child(${lineNb + 1})`);
    await line.waitForExist();

    // Get the wanted symbol.
    const word = await line.$(`span=${symbolName}`);
    await word.waitForExist();
    // Right click on the word to open the context menu.
    word.click({ button: 'right' });

    // The context menu is located in a "shadow-root" so it must be accessed a bit differently.
    const shadow = await $('.shadow-root-host');
    await shadow.waitForExist();
    //Get the button associated with the right kind of graph.
    const item = await shadow.shadow$(
        `.action-menu-item .action-label[aria-label*="${graphKind.valueOf()}"`,
    );
    item.waitForExist();
    // Click on the button to open the webView.
    item.click();

    const webview = await workbench.getAllWebviews();
    // Focus on the opened webView.
    await webview[0].open();
}

/**
 * Get the node object id by its position in the code base.
 * There is not really other ways to reliably get the Id of the node
 * other than giving the precise location of the symbol and then searching
 * each node for one with the same information.
 *
 * @param line - The 0-based line number the definition of the symbol is located in.
 * @param column - The 0-based column number the definition of the symbol is located in.
 * @param fileName - The name of the file the definition of the symbol is located in.
 * @returns The node id.
 */
export async function getNodeId(line: number, column: number, fileName: string): Promise<string> {
    const nodes = await $$('.visualizer__basic_node');

    let promises: Promise<never>[] = [];
    nodes.forEach((node) => promises.push(node.waitForDisplayed()));
    await Promise.all(promises);

    let target: WebdriverIO.Element | undefined = undefined;
    for (const node of nodes) {
        const texts = await node.$('.visualizer__node-body');

        await texts.waitForDisplayed();

        let textValue = await texts.getHTML();
        texts.getText();

        if (textValue.includes(`${fileName}`) && textValue.includes(`Ln ${line}, Col ${column}`)) {
            target = node;
            break;
        }
    }

    expect(target).not.toBe(undefined);

    if (target !== undefined) {
        await target.waitForExist();

        const id = await target.getAttribute('data-node-id');

        expect(id.length).toBe(SHA1_LEN);

        return id;
    }

    // Should not be possible as the expect above already handle this case.
    return '';
}

/**
 * Return the node associated with a specific id.
 *
 * @param id - The id of the node searched.
 * @returns The node object.
 */
export async function getNodeFromId(id: string) {
    const node = await $(`div[data-node-id="${id}"]`);

    await node.waitForExist();

    return node;
}

/**
 * Returns all the nodes present in the graph.
 * @returns An array containing all the node element of the graph.
 */
export async function getNodes(): Promise<WebdriverIO.ElementArray> {
    const nodes = await $$('.visualizer__basic_node');
    const promises: Promise<never>[] = [];
    nodes.forEach((node) => promises.push(node.waitForExist()));
    await Promise.all(promises);
    return nodes;
}

/**
 * Get the sub hierarchy button or the fold button for a specific node found by name.
 * @param id- The name of the node.
 * @returns The button to request for the children of the node.
 */
export async function getSubButton(
    id: string,
): Promise<{ button: WebdriverIO.Element; buttonType: SubButtonType }> {
    // First select the parent node and then find the element that is a button with the whole class
    // visualizer__hierarchy-button and the beginning of visualizer__sub-button  (the rest of the class can
    // change depending on the layout of the graph).
    const button = await $(
        `div[data-node-id='${id}'] button.visualizer__hierarchy-button[class*="visualizer__sub-button"]`,
    );
    await button.waitForClickable();
    const buttonClass = await button.getAttribute('class');
    const buttonType = buttonClass.includes('codicon-chevron-down')
        ? SubButtonType.FOLD_OPENED
        : buttonClass.includes('codicon-chevron-right')
          ? SubButtonType.FOLD_CLOSED
          : SubButtonType.HIERARCHY;

    return { button: button, buttonType: buttonType };
}

/**
 * Get the super hierarchy button for a specific node found by name.
 * @param id- The name of the node.
 * @returns The button to request for the children of the node.
 */
export async function getSuperButton(id: string): Promise<WebdriverIO.Element> {
    // First select the parent node and then find the element that is a button with the whole class
    // visualizer__hierarchy-button and the beginning of visualizer__super-button  (the rest of the class can
    // change depending on the layout of the graph).
    const button = await $(
        `div[data-node-id='${id}'] button.visualizer__hierarchy-button[class*="visualizer__super-button"]`,
    );
    await button.waitForClickable();
    return button;
}

/**
 * Zoom on the graph nbTimes.
 *
 * @param nbTime - The number of time to press the zoom button.
 */
export async function zoom(nbTime: number = 1) {
    const zoomButton = await $('button.react-flow__controls-zoomin');

    await zoomButton.waitForClickable();

    for (let i = 0; i < nbTime; i++) {
        await zoomButton.click();
    }
}

/**
 * Un-zoom on the graph nbTimes.
 *
 * @param nbTime - The number of time to press the un-zoom button.
 */
export async function unZoom(nbTime: number = 1) {
    const zoomButton = await $('button.react-flow__controls-zoomout');

    await zoomButton.waitForClickable();

    for (let i = 0; i < nbTime; i++) {
        await zoomButton.click();
    }
}

/**
 * Fit the view so that the entire graph is visible on screen.
 */
export async function fitView() {
    const fitButton = await $('button.react-flow__controls-fitview');

    await fitButton.waitForClickable();

    fitButton.click();
}

/**
 * Lock the graph so the node cannot be moved around anymore.
 */
export async function lockGraph() {
    const lockButton = await $('button.react-flow__controls-interactive');

    await lockButton.waitForClickable();

    lockButton.click();
}

/**
 * Layout the graph and toggle between orienting the graph to the right or downside.
 */
export async function layoutGraph() {
    const layoutButton = await $('button.react-flow__controls-button.codicon.codicon-layout');

    await layoutButton.waitForClickable();

    layoutButton.click();
}

/**
 * Center the view to the 0 0 coordinate of the plan while keeping the current zoom level.
 */
export async function centerGraph() {
    const layoutButton = await $('button.react-flow__controls-button.codicon.codicon-record');

    await layoutButton.waitForClickable();

    layoutButton.click();
}
