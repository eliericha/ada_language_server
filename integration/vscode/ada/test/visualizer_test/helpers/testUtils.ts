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
 * Wait for notifications to show up and dismiss them.
 *
 * @param waitTime - The time to wait for the notifications to appear in ms.
 */
export async function closeVSCodePopUpNotifications(waitTime: number) {
    await browser.pause(waitTime);
    const closeButtons = await $$('.codicon-notifications-clear');
    for (const btn of closeButtons) {
        await btn.waitForClickable();
        await btn.click();
    }
}
/**
 * Open a specific file in a VS Code workspace and then open the Graph WebView from a specific
 * position in the file.
 * It is also possible to specify which type of WebView to open by specifying its button name.
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

    expect(line.error).toBe(undefined);

    await line.waitForExist();

    // Get the wanted symbol.
    const word = await line.$(`span=${symbolName}`);
    expect(word.error).toBe(undefined);
    await word.waitForExist();

    // Right-click on the word to open the context menu.
    word.click({ button: 'right' });

    // The context menu is located in a "shadow-root", so it must be accessed a bit differently.
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

    expect(webview.length).toBe(1);

    // Focus on the opened webView.
    await webview[0].open();
}

/**
 * Get the node object id by its position in the code base.
 * There are no really other ways to reliably get the ID of the node
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

        expect(texts.error).toBe(undefined);

        await texts.waitForDisplayed();

        let textValue = await texts.getHTML();
        texts.getText();

        if (textValue.includes(`${fileName}`) && textValue.includes(`Ln ${line}, Col ${column}`)) {
            target = node;
            break;
        }
    }

    expect(target).not.toBe(undefined);
    expect(target?.error).toBe(undefined);

    if (target !== undefined) {
        await target.waitForExist();

        const id = await target.getAttribute('data-node-id');

        expect(id.length).toBe(SHA1_LEN);

        return id;
    }

    // Should not be possible as the expect above already handles this case.
    return '';
}

/**
 * Return the node associated with a specific id.
 *
 * @param id - The id of the node searched.
 * @returns The node object. If no edge was found, the .error field of the return
 * value will be set.
 */
export async function getNodeFromId(id: string) {
    const node = await $(`div[data-node-id="${id}"]`);

    if (!node.error) await node.waitForExist();

    return node;
}

/**
 * Returns all the nodes present in the graph.
 *
 * @returns An array containing all the node elements of the graph.
 */
export async function getNodes(): Promise<WebdriverIO.ElementArray> {
    const nodes = await $$('.visualizer__basic_node');
    const promises: Promise<never>[] = [];
    nodes.forEach((node) => promises.push(node.waitForExist()));
    await Promise.all(promises);
    return nodes;
}

/**
 * Returns all the edges present in the graph.
 *
 * @returns An array containing all the edge elements of the graph.
 */
export async function getEdges(): Promise<WebdriverIO.ElementArray> {
    const edges = await $$('.react-flow__edge');
    const promises: Promise<never>[] = [];
    edges.forEach((edge) => promises.push(edge.waitForExist()));
    await Promise.all(promises);
    return edges;
}

/**
 * Get the edge associated to two node IDs.
 *
 * @param node1 - A node the edge is linked to.
 * @param node2 - The other node the edge is linked to.
 * @returns The edge object. If no edge was found, the .error field of the return
 * value will be set.
 */
export async function getEdge(node1: string, node2: string): Promise<WebdriverIO.Element> {
    const edgeId1 = `e${node1}-${node2}`;
    const edgeId2 = `e${node2}-${node1}`;

    let edge = await $(`#${edgeId1}, #${edgeId2}`);

    if (!edge.error) await edge.waitForExist();
    return edge;
}

/**
 * Get all the outgoing edges of a node.
 *
 * @param nodeId - The node we search the outgoing edge of.
 * @returns An array of edge elements.
 */
export async function getOutgoingEdges(nodeId: string): Promise<WebdriverIO.ElementArray> {
    let edges = await $$(`[id^=e${nodeId}]`);
    const promises: Promise<never>[] = [];
    edges.forEach((edge) => promises.push(edge.waitForExist()));
    await Promise.all(promises);
    return edges;
}

/**
 * Get all the incoming edges of a node.
 *
 * @param nodeId - The node we search the incoming edges of.
 * @returns An array of edge elements.
 */
export async function getIncomingEdges(nodeId: string): Promise<WebdriverIO.ElementArray> {
    let edges = await $$(`[id$=-${nodeId}]`);
    const promises: Promise<never>[] = [];
    edges.forEach((edge) => promises.push(edge.waitForExist()));
    await Promise.all(promises);
    return edges;
}

/**
 * Get the source node id from an edge id.
 *
 * @param edgeId - The edge from which to get the source node.
 * @returns The id of the source node.
 */
export function getEdgeSource(edgeId: string): string {
    const ids = edgeId.match(/^e(.*?)-/);
    expect(ids).not.toBe(null);
    expect(ids!.length).toBe(2);
    return ids![1];
}
/**
 * Get the destination node id from an edge id.
 *
 * @param edgeId - The edge from which to get the destination node.
 * @returns The id of the destination node.
 */
export function getEdgeDestination(edgeId: string): string {
    const ids = edgeId.match(/-(.*)$/);
    expect(ids).not.toBe(null);
    expect(ids!.length).toBe(2);
    return ids![1];
}

/**
 * Get the id of a node object and return it.
 *
 * @param edge - The edge object to get the id from.
 * @returns The id of the edge.
 */
export async function getIdfromEdge(edge: WebdriverIO.Element) {
    return await edge.getAttribute('id');
}
/**
 * Get the sub hierarchy button or the fold button for a specific node found by id.
 *
 * @param id - The id of the node.
 * @returns The button to request for the children of the node. If no button was found,
 *  the .error field of the return value will be set.
 */
export async function getSubButton(
    id: string,
): Promise<{ button: WebdriverIO.Element; buttonType: SubButtonType }> {
    // First select the parent node and then find the element that is a button with the class
    // visualizer__hierarchy-button and the beginning of visualizer__sub-button (the rest of the class can
    // change depending on the layout of the graph).
    const button = await $(
        `div[data-node-id='${id}'] button.visualizer__hierarchy-button[class*="visualizer__sub-button"]`,
    );

    if (!button.error) await button.waitForClickable();
    const buttonClass = await button.getAttribute('class');
    const buttonType = buttonClass.includes('codicon-chevron-down')
        ? SubButtonType.FOLD_OPENED
        : buttonClass.includes('codicon-chevron-right')
          ? SubButtonType.FOLD_CLOSED
          : SubButtonType.HIERARCHY;

    return { button: button, buttonType: buttonType };
}

/**
 * Get the super hierarchy button for a specific node found by id.
 *
 * @param id - The id of the node.
 * @returns The button to request for the children of the node. If no button was found,
 *  the .error field of the return value will be set.
 */
export async function getSuperButton(id: string): Promise<WebdriverIO.Element> {
    // First select the parent node and then find the element that is a button with the whole class
    // visualizer__hierarchy-button and the beginning of visualizer__super-button  (the rest of the class can
    // change depending on the layout of the graph).
    const button = await $(
        `div[data-node-id='${id}'] button.visualizer__hierarchy-button[class*="visualizer__super-button"]`,
    );

    if (!button.error) await button.waitForClickable();
    return button;
}

/**
 * Zoom in on the graph nbTimes.
 *
 * @param nbTime - The number of times to press the zoom button.
 * @returns True if the operation worked, else false.
 */
export async function zoomIn(nbTime: number = 1) {
    try {
        const zoomButton = await $('button.react-flow__controls-zoomin');

        if (!zoomButton.error) await zoomButton.waitForClickable();

        for (let i = 0; i < nbTime; i++) {
            await zoomButton.click();
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Zoom out on the graph nbTimes.
 *
 * @param nbTime - The number of times to press the un-zoom button.
 * @returns True if the operation worked, else false.
 */
export async function zoomOut(nbTime: number = 1) {
    try {
        const zoomButton = await $('button.react-flow__controls-zoomout');

        if (!zoomButton.error) await zoomButton.waitForClickable();

        for (let i = 0; i < nbTime; i++) {
            await zoomButton.click();
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Fit the view so that the entire graph is visible on screen.
 *
 * @returns True if the operation worked, else false.
 */
export async function fitView() {
    try {
        const fitButton = await $('button.react-flow__controls-fitview');

        if (!fitButton.error) await fitButton.waitForClickable();

        fitButton.click();
        return true;
    } catch {
        return false;
    }
}

/**
 * Lock the graph so the nodes cannot be moved around anymore.
 *
 * @returns True if the operation worked, else false.
 */
export async function lockGraph() {
    try {
        const lockButton = await $('button.react-flow__controls-interactive');

        if (!lockButton.error) await lockButton.waitForClickable();

        lockButton.click();
        return true;
    } catch {
        return false;
    }
}

/**
 * Layout the graph and toggle between orienting the graph to the right or downward .
 *
 * @returns True if the operation worked, else false.
 */
export async function layoutGraph() {
    try {
        const layoutButton = await $('button.react-flow__controls-button.codicon.codicon-layout');

        if (!layoutButton.error) await layoutButton.waitForClickable();

        layoutButton.click();
        return true;
    } catch {
        return false;
    }
}

/**
 * Center the view to the 0 0 coordinate of the plan while keeping the current zoom level.
 *
 * @returns True if the operation worked, else false.
 */
export async function centerGraph() {
    try {
        const layoutButton = await $('button.react-flow__controls-button.codicon.codicon-record');

        if (!layoutButton.error) await layoutButton.waitForClickable();

        layoutButton.click();

        return true;
    } catch {
        return false;
    }
}

/**
 * Input text in the search bar to display search items.
 *
 * @param text - The text to put in the search bar.
 * @returns True if the action was successful, else false.
 */
export async function setSearchBar(text: string) {
    try {
        const searchBar = await $('#visualizer__node-search-bar');

        if (!searchBar.error) await searchBar.waitForDisplayed();

        await searchBar.setValue(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get all the search items currently displayed below the search bar.
 *
 * @returns An array of elements.
 */
export async function getSearchItems() {
    const searchItems = await $$('.visualizer__node-search-item');
    const promises: Promise<never>[] = [];
    searchItems.forEach((searchItem) => promises.push(searchItem.waitForClickable()));
    await Promise.all(promises);

    return searchItems;
}

/**
 * Open the context menu of a specific node.
 *
 * @param nodeId - The id of the node from which to open the context menu.
 * @returns True if the operation worked, else false.
 */
export async function openNodeContextMenu(nodeId: string) {
    try {
        const node = await getNodeFromId(nodeId);

        await node.click({ button: 'right' });

        return true;
    } catch {
        return false;
    }
}

/**
 * Get the node context menu if it is open.
 *
 * @returns The Node Context Menu element if it exists.
 */
export async function getNodeContextMenu() {
    const contextMenu = await $('.visualizer__node-context-menu');

    if (!contextMenu.error) await contextMenu.waitForDisplayed();

    return contextMenu;
}

/**
 * Get and click the Node Context Menu Refresh button.
 *
 * @returns True if the operation worked, else false.
 */
export async function clickContextMenuRefreshButton() {
    try {
        const refresh = await $('.visualizer__context-button.visualizer__refresh_button');

        if (!refresh.error) {
            await refresh.waitForClickable();

            await refresh.click();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Get and click the Node Context Menu Goto Definition button.
 *
 * @returns True if the operation worked, else false.
 */
export async function clickContextMenuGotoDefButton() {
    try {
        const gotoDef = await $('.visualizer__context-button.visualizer__goto_def_button');

        if (!gotoDef.error) {
            await gotoDef.waitForClickable();

            await gotoDef.click();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Get and click the Node Context Menu Goto Implementation button.
 *
 * @returns True if the operation worked, else false.
 */
export async function clickContextMenuGotoImlpButton() {
    try {
        const gotoImpl = await $('.visualizer__context-button.visualizer__goto_impl_button');

        if (!gotoImpl.error) {
            await gotoImpl.waitForClickable();

            await gotoImpl.click();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Get and click the Node Context Menu Delete button.
 *
 * @returns True if the operation worked, else false.
 */
export async function clickContextMenuDeleteButton() {
    try {
        const deleteB = await $('.visualizer__context-button.visualizer__delete_button');

        if (!deleteB.error) {
            await deleteB.waitForClickable();

            await deleteB.click();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Get and click the Node Context Menu Sub Hierarchy button.
 *
 * @returns True if the operation worked, else false.
 */
export async function clickContextMenuSubHierarchyButton() {
    try {
        const subHierarchy = await $(
            '.visualizer__context-button.visualizer__sub_hierarchy_button',
        );

        if (!subHierarchy.error) {
            await subHierarchy.waitForClickable();

            await subHierarchy.click();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Get and click the Node Context Menu Super Hierarchy button.
 *
 * @returns True if the operation worked, else false.
 */
export async function clickContextMenuSuperHierarchyButton() {
    try {
        const superHierarchy = await $(
            '.visualizer__context-button.visualizer__super_hierarchy_button',
        );

        if (!superHierarchy.error) {
            await superHierarchy.waitForClickable();

            await superHierarchy.click();
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Position the mouse over the references button in the Context Menu.
 *
 * @returns True if the operation worked, else false.
 */
export async function openContextMenuReferencesPicker() {
    try {
        const referencesPicker = await $('#visualizer__context-references-button');

        if (!referencesPicker.error) {
            await referencesPicker.waitForExist();

            await referencesPicker.moveTo();
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * Position the mouse over an edge to open the reference picker.
 *
 * @returns True if the operation worked, else false.
 */
export async function openEdgeReferencesPicker(edgeElem: WebdriverIO.Element) {
    try {
        await edgeElem.moveTo();

        return true;
    } catch {
        return false;
    }
}

/**
 * Get all the elements of the references list.
 *
 * @param filterHeader - Indicate wheter to returns every item (the references and their headers) or just the
 * references themselves.
 * @returns An array of elements representing the references list.
 */
export async function getReferencesItems(filterHeader: boolean) {
    let query = '.visualizer__references-picker-item';
    if (filterHeader) query += `:not(.visualizer__references-picker-header)`;
    const referencesItems = await $$(query);

    const promises: Promise<never>[] = [];
    referencesItems.forEach((referenceItem) => promises.push(referenceItem.waitForClickable()));
    await Promise.all(promises);

    return referencesItems;
}

/**
 * Get an element at a specific index of the references list.
 *
 * @param n - The index of the element to get.
 * @param filterHeader - Indicate wheter to returns every item (the references and their headers) or just the
 * references themselves.
 * @returns The reference item object. If no item was found, the .error field of the return
 * value will be set or undefined if n is out of bound
 */
export async function getNthReferenceItem(n: number, filterHeader: boolean) {
    const referencesList = await getReferencesItems(filterHeader);
    if (n < referencesList.length) {
        return referencesList.at(n);
    }
    return undefined;
}
