/* eslint-disable @typescript-eslint/restrict-template-expressions */
// Needed for importing the script in the html snippet
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    RelationDirection,
    Message,
    NodeData,
    HierarchyMessage,
    NodeHierarchy,
    Hierarchy,
    NodeEdge as NodeEdgeMessage,
    NodeIdsMessage,
    UpdateMessage,
    DirectedEdge,
    RevealReferencesMessage,
    RevealReferencesResponse,
    StringLocation,
    ALS_Unit_Description,
    ALS_ShowDependenciesKind,
    RevealMessage,
} from './visualizerTypes';
import { createHandler, VisualizerHandler } from './alsVisualizerProvider';
import { logger } from './extension';

/**
 * Map used to store all the Nodes already created server side
 */
type SymbolsMap = Map<string, NodeHierarchy>;

// Store the roots of all the graphs (the node that don't have parents)
let rootNodes: NodeHierarchy[] = [];
const symbolsMap: SymbolsMap = new Map();

// The node that will be focused when updating the graph
let focusedNode: NodeHierarchy | null = null;

// let callPanel: vscode.WebviewPanel | null;
// let typePanel: vscode.WebviewPanel | null;
const panels: (vscode.WebviewPanel | null)[] = [null, null, null];

// Helper functions to display the execution time taken by a code block
const startTimer = () => performance.now();
const endTimer = (start: DOMHighResTimeStamp, label: string, indent: number = 0) =>
    console.log(`${'   '.repeat(indent)}${label}: ${performance.now() - start} ms`);
void startTimer;
void endTimer;

let stopProcess: boolean = false;

/**
 * Start a progress animation in the status bar to indicate the user that a request is being
 * processed.
 *
 * @param cancellable - Indicate if the progress should be cancellable, which will put it in
 * a notification instead of the status bar.
 */
function withVizProgress(task: () => void | Promise<void>, cancellable = false) {
    vscode.window.withProgress(
        {
            location: cancellable
                ? vscode.ProgressLocation.Notification
                : vscode.ProgressLocation.Window,
            title: 'Visualizing',
            cancellable: cancellable,
        },
        async (progress, token) => {
            void progress;
            token.onCancellationRequested(() => {
                stopProcess = true;
            });
            await task();
            return new Promise<void>((resolve) => {
                resolve();
            });
        },
    );
}

/**
 * Gather code information and aggregate them in a graph to better understand them.
 *
 * @param context - The vscode context of the extension.
 * @param hierarchy - The type of hierarchy to visualize.
 */
export function startVisualize(context: vscode.ExtensionContext, hierarchy: Hierarchy) {
    withVizProgress(async () => {
        if (vscode.window.activeTextEditor) {
            const input = new vscode.Location(
                vscode.window.activeTextEditor.document.uri,
                vscode.window.activeTextEditor.selection.active,
            );

            const languageId = vscode.window.activeTextEditor.document.languageId;
            const direction =
                hierarchy === Hierarchy.CALL ? RelationDirection.SUPER : RelationDirection.BOTH;
            const middleNode =
                hierarchy === Hierarchy.PACKAGE
                    ? await getPackageHierarchy(input, languageId)
                    : await getCodeHierarchy(input, hierarchy, languageId, direction);

            // Create the webView only if there is something to display
            if (middleNode) {
                setupWebView(context, hierarchy);
                const panel = panels[hierarchy];
                // Make sure the webView was created and initialized
                if (panel) {
                    // Wait for the webView to notify the end of it's rendering
                    const receive = panel.webview.onDidReceiveMessage((message: Message) => {
                        if (message.command === 'rendered') {
                            // Remove the listener as it will not be used after sending
                            // the initial request
                            sendMessage(middleNode.id, hierarchy);
                            receive.dispose();
                        }
                    });
                    // Check if the client has already been rendered
                    panel.webview.postMessage({ command: 'isRendered', data: '' } as Message);
                }
            }
        }
    });
}

/**
 * Handle the message received from client side
 *
 * @param message - The message received.
 */
function handleMessage(message: Message) {
    switch (message.command) {
        // Add new nodes to the graph or fold/unfold.
        case 'requestHierarchy': {
            const data = message.data as HierarchyMessage;
            void requestHierarchy(data);
            break;
        }
        // Reveal the definition symbol of a specific node.
        case 'revealNode': {
            const data = message.data as RevealMessage;
            const node = symbolsMap.get(data.nodeId);
            if (node === undefined) return;
            void revealSymbol(node.location, node.hierarchy, data.gotoImplementation);
            break;
        }
        // Gather all references of a symbol in an other symbol.
        case 'revealReferences': {
            const ids = message.data as RevealReferencesMessage;
            void revealReference(ids.targetNodeId, ids.referenceNodeId);
            break;
        }
        // Reconstruct a location and reveal the symbol under it in the code.
        case 'revealLocation': {
            const location_data = message.data as StringLocation;
            const location = new vscode.Location(
                vscode.Uri.file(location_data.path),
                new vscode.Range(location_data.range_start, location_data.range_end),
            );
            void revealSymbol(location, Hierarchy.CALL, false);
            break;
        }
        // Delete a set of nodes and their childs.
        case 'deleteNodes': {
            const data = message.data as NodeIdsMessage;
            deleteNodes(data.nodesId, data.recursive);
            break;
        }
        // Refresh the location of a node in the code.
        case 'refreshNodes': {
            withVizProgress(() => {
                const data = message.data as NodeIdsMessage;
                void refreshNodes(data.nodesId);
            });
            break;
        }
        // Stop the current loop of process (mostly for the recursive hierarchy)
        case 'stopProcess': {
            stopProcess = true;
            break;
        }
        // This message is not handled here but it is catched here to avoid falling into
        // the default case.
        case 'rendered':
            break;
        default:
            logger.warn('ALS: handleMessage: Command not found or empty');
            break;
    }
}

/**
 * Expand the graph by adding parents or children to the targeted node.
 * If recursive is set to true, the algorithm will continue to expand until finding symbol
 * that are not in the project.
 *
 * @param data - The data necessary to expand a node.
 */
function requestHierarchy(data: HierarchyMessage) {
    withVizProgress(async () => {
        stopProcess = false;
        const node = symbolsMap.get(data.id);
        // Check that the symbol is not a runtime generated one
        if (node === undefined) return;
        node.expanded = data.expand;
        const queue: NodeHierarchy[] = [node];
        // If recursive is enable loop until all the childs of the node has been expanded,
        // or the loop is stopped (see stopProcess).
        while (queue.length !== 0) {
            const currNode = queue.pop();
            if (currNode) {
                const start = performance.now();
                if (
                    ((data.expand || data.direction === RelationDirection.SUPER) &&
                        fs.existsSync(currNode.location.uri.fsPath) &&
                        data.direction === RelationDirection.SUB &&
                        currNode.children.length === 0) ||
                    (data.direction === RelationDirection.SUPER && currNode.parents.length === 0)
                ) {
                    if (currNode.hierarchy === Hierarchy.PACKAGE) {
                        await getPackageHierarchy(
                            currNode.location,
                            currNode.languageId,
                            data.direction,
                        );
                    } else {
                        await getCodeHierarchy(
                            currNode.location,
                            data.hierarchy,
                            currNode.languageId,
                            data.direction,
                        );
                    }
                    if (data.recursive) {
                        if (data.direction === RelationDirection.SUB)
                            queue.push(...currNode.children.filter((child) => child.inProject));
                        else queue.push(...currNode.parents.filter((parent) => parent.inProject));
                    }
                }
                // Update the graph in realtime so the user can see it grow.
                sendMessage(data.id, data.hierarchy, !data.recursive);
                if (stopProcess) {
                    stopProcess = false;
                    break;
                }

                // It is necessary to wait a bit between sending two messages or the client
                // wont be able to handle all the requests. As the hierarchy functions takes times,
                // it is not always necessary to wait so we only wait if the execution time of the
                // function is too low.
                const end = performance.now() - start;
                const difference = Math.max(0, 250 - end);
                if (difference > 0) await new Promise((resolve) => setTimeout(resolve, difference));
            }
        }
        // Send a last message to focus on the right node at the end if the
        // graph was expanded recursively.
        if (data.recursive) sendMessage(data.id, data.hierarchy, true);
    }, data.recursive);
}

/**
 * Update the location of the node in case their position in the file changed.
 * /!\\ If the the function changed too much (for example if the signature changed) it will be
 * impossible to find it again and the user will need to remove the node to regenerate it manually.
 *
 * @param nodesId - The nodes to refresh
 */
async function refreshNodes(nodesId: string[]) {
    const toUpdate: NodeHierarchy[] = [];
    for (const nodeId of nodesId) {
        const node = symbolsMap.get(nodeId);
        if (!node || !fs.existsSync(node.location.uri.fsPath)) continue;
        const symbols = await vscode.commands.executeCommand<
            vscode.SymbolInformation[] | vscode.DocumentSymbol[]
        >('vscode.executeDocumentSymbolProvider', node.location.uri);

        const queue = [...symbols];
        while (queue.length !== 0) {
            const symbol = queue.pop();
            if (!symbol) continue;
            const loc: vscode.Location =
                'selectionRange' in symbol
                    ? new vscode.Location(node.location.uri, symbol.selectionRange)
                    : symbol.location;

            if (node.id === (await node.handler.generateNodeId(loc))) {
                node.location = loc;
                toUpdate.push(node);
                break;
            } else {
                queue.push(...('children' in symbol ? symbol.children : []));
            }
        }
    }
    updateNodes(toUpdate, []);
}

/**
 * Recursively traverse the graph from a specific node to find if there is a cycle.
 *
 * @param initialNode - The node from which the search began.
 * @param currNode - The node being currently tested, should be a child of the initialNode
 * when first calling the function.
 * @param visited - A set containing the id of all the already visited nodes.
 * @returns True if a cycle was found, false otherwise.
 */
function hasCycle(
    initialNode: NodeHierarchy,
    currNode: NodeHierarchy,
    visited: Set<string> = new Set(),
) {
    if (visited.has(currNode.id)) return false;
    visited.add(currNode.id);
    for (const child of currNode.children) {
        if (child.id === initialNode.id) return true;
        if (hasCycle(initialNode, child, visited)) return true;
    }
    return false;
}

/**
 * Remove nodes from the symbolMap and the nodeHierarchy.
 *
 * Removes all the nodes sub hierarchy's node if they are not connected to another node that is not
 * staged for deletion.
 *
 * Update the remaining node to change their parent and child list.
 *
 * @param nodeIds - The ids of the nodes to remove
 */
function deleteNodes(nodeIds: string[], recursive: boolean) {
    let toUpdate: NodeHierarchy[] = [];
    let toDelete: NodeHierarchy[] = [];

    for (const nodeId of nodeIds) {
        const node = symbolsMap.get(nodeId);
        if (!node) continue;

        toDelete.push(node);
        for (const child of node.children) {
            // Only delete the children which are not part of a cycle with their parent
            if (recursive && !hasCycle(node, child)) {
                const queue: NodeHierarchy[] = [child];
                while (queue.length !== 0) {
                    const del = queue.pop();
                    if (!del) continue;
                    toDelete.push(del);
                    queue.push(...del.children);
                }
            }
        }
    }

    // We only delete the nodes whose parents are all in the toDelete array
    // As we can't know the order of the toDeleteArray we continue to check for nodes
    // to exclude while there where changes in the previous iteration
    let deleteLen;
    let newDeleteLen;
    do {
        deleteLen = toDelete.length;
        toDelete = toDelete.filter(
            (node) =>
                nodeIds.find((id) => node.id === id) ||
                node.parents.every(
                    (parent) => toDelete.find((del) => del.id === parent.id) !== undefined,
                ),
        );
        newDeleteLen = toDelete.length;
    } while (deleteLen !== newDeleteLen);

    for (const node of toDelete) {
        // Remove the reference to the node from its parent's children and
        // from its children's parent
        for (const child of node.children) {
            child.parents = child.parents.filter((parent) => parent.id !== node.id);
            if (child.parents.length === 0) {
                child.hasParent = null;
                toUpdate.push(child);
            }
        }
        for (const parent of node.parents) {
            parent.children = parent.children.filter((child) => child.id !== node.id);
            if (parent.children.length === 0) {
                parent.hasChildren = null;
                toUpdate.push(parent);
            }
        }
        symbolsMap.delete(node.id);
    }

    // Remove node that were deleted form the array of node to update.
    toUpdate = toUpdate.filter((node) => !toDelete.some((del) => del.id === node.id));
    rootNodes = findRoots();
    updateNodes(toUpdate, toDelete);
}

/**
 * Send a message to client side to update the content of certain nodes
 *
 * @param toUpdate - The nodes to updates
 * @param toDelete - The nodes to delete.
 */
function updateNodes(toUpdate: NodeHierarchy[], toDelete: NodeHierarchy[]) {
    const sendUpdate: NodeData[] = toUpdate.map((node) => convertHierarchyToData(node));
    const sendDelete: NodeData[] = toDelete.map((node) => convertHierarchyToData(node));
    if (sendUpdate.length !== 0 || sendDelete.length !== 0) {
        const panel = panels[(sendUpdate.length !== 0 ? sendUpdate[0] : sendDelete[0]).hierarchy];
        panel?.webview.postMessage({
            command: 'updateNodes',
            data: {
                toUpdate: sendUpdate,
                toDelete: sendDelete,
            } as UpdateMessage,
        });
    }
}

/**
 * Explore the graph and to get all the nodes reachable from a starting node.
 *
 * @param startNode - The node from which to start the marking.
 * @param allNodes  - A set of all the node id not yet marked.
 */
function exploreGraph(startNode: NodeHierarchy, allNodes: Set<string>) {
    const queue: NodeHierarchy[] = [startNode];
    while (queue.length !== 0) {
        const node = queue.pop();
        if (!node) continue;
        if (!allNodes.has(node.id)) continue;

        allNodes.delete(node.id);
        queue.push(...node.children);
    }
}

/**
 * Find all the root of the graph (the nodes with no parents)
 *
 * Will also return nodes that are interconnected and not reachable by another root
 * (for example two node that each have the other as parent and child)
 *
 * @returns The array of root nodes.
 */
function findRoots() {
    // Get all the node without parent as root
    const roots: NodeHierarchy[] = Array.from(symbolsMap.values()).filter(
        (node) => node.parents.length === 0,
    );
    const allNodes: Set<string> = new Set(symbolsMap.keys());
    roots.forEach((root) => exploreGraph(root, allNodes));

    //The remaining ids in allNodes are roots that are inter-connected
    for (const id of allNodes) {
        const node = symbolsMap.get(id);
        if (node) roots.push(node);
    }
    return roots;
}

/**
 * Search the full range of body of a symbol.
 *
 * @param label - The name of the symbol to search.
 * @param handler - The handler to call language specific function.
 * @param location - The location of the selection range of the symbol.
 * @returns The uri and total range of the symbol.
 */
async function getSymbolLocation(
    label: string,
    handler: VisualizerHandler,
    location: vscode.Location,
) {
    let symbolRange: vscode.Range | null = null;
    let uri: vscode.Uri | null = null;
    const implementation = await handler.getFunctionBodyLocation(location);
    if (implementation === null) return null;

    // TODO WHAT IF MULTIPLE IMPLEMENTATIONS?
    uri = 'uri' in implementation ? implementation.uri : implementation.targetUri;
    //TODO HANDLE TYPES?
    const symbols = await vscode.commands.executeCommand<
        (vscode.SymbolInformation | vscode.DocumentSymbol)[]
    >('vscode.executeDocumentSymbolProvider', uri);

    for (const symbol of symbols) {
        const range = handler.getSymbolWholeRange(symbol, label, implementation);
        if (range) {
            symbolRange = range;
            break;
        }
    }
    return { uri, functionRange: symbolRange };
}

/**
 * Search all the references of a specific symbol in an other. If no target is provided, the
 * references will all be gathered, ordered regarding the symbol the are located in and then
 * sended to the client side.
 *
 * @param targetNodeId - The symbol in which to search for references, or null for all.
 * @param referenceNodeId - The references to search.
 */
async function revealReference(targetNodeId: string, referenceNodeId: string) {
    const targetNode = symbolsMap.get(targetNodeId);
    const referenceNode = symbolsMap.get(referenceNodeId);
    if (!referenceNode) return;

    const symbolLocations: [vscode.Range, vscode.Uri, string][] = [];
    // Case where a target is given.
    if (targetNode) {
        const location = await getSymbolLocation(
            targetNode.label,
            targetNode.handler,
            targetNode.location,
        );

        if (location === null || location.functionRange === null) return;
        symbolLocations.push([location.functionRange, location.uri, targetNode.label]);
    }
    // Case where we get all the references.
    else {
        // Query all the incoming symbol in the node.
        const prepare = await vscode.commands.executeCommand<
            (vscode.CallHierarchyItem | vscode.TypeHierarchyItem)[]
        >(
            referenceNode.hierarchy === Hierarchy.CALL
                ? 'vscode.prepareCallHierarchy'
                : 'prepareTypeHierarchy',
            referenceNode.location.uri,
            referenceNode.location.range.start,
        );
        if (prepare.length > 0) {
            const incomings = await vscode.commands.executeCommand<
                (vscode.CallHierarchyIncomingCall | vscode.TypeHierarchyItem)[]
            >(
                referenceNode.hierarchy === Hierarchy.CALL
                    ? 'vscode.provideIncomingCalls'
                    : 'vscode.provideSupertypes',
                prepare[0],
            );
            for (const incoming of incomings) {
                // TODO HANDLE TYPES
                if (referenceNode.hierarchy === Hierarchy.CALL) {
                    const incomingItem = incoming as vscode.CallHierarchyIncomingCall;
                    const location = await getSymbolLocation(
                        incomingItem.from.name,
                        referenceNode.handler,
                        new vscode.Location(incomingItem.from.uri, incomingItem.from.range.start),
                    );
                    if (location === null || location.functionRange === null) return;
                    symbolLocations.push([
                        location.functionRange,
                        location.uri,
                        incomingItem.from.name,
                    ]);
                }
            }
        }
    }

    if (!fs.existsSync(referenceNode.location.uri.fsPath)) return;

    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        referenceNode.location.uri,
        referenceNode.location.range.start,
    );
    const stringLocationsMap: Map<string, StringLocation[]> = new Map();
    for (const location of locations) {
        // Don't sort by file name but by the parent function
        const symbolLocation = symbolLocations.find(
            (symbolLocation) =>
                symbolLocation[0].contains(location.range) &&
                symbolLocation[1].fsPath === location.uri.fsPath,
        );
        if (symbolLocation) {
            if (!stringLocationsMap.has(symbolLocation[2]))
                stringLocationsMap.set(symbolLocation[2], []);
            stringLocationsMap.get(symbolLocation[2])?.push({
                path: location.uri.fsPath,
                range_start: location.range.start,
                range_end: location.range.end,
                string_location:
                    `Ln ${location.range.start.line}, ` + `Col ${location.range.start.character}`,
            } as StringLocation);
        }
    }
    const panel = panels[referenceNode.hierarchy];
    panel?.webview.postMessage({
        command: 'revealResponse',
        data: {
            // locations: stringLocations,
            locationsKeys: Array.from(stringLocationsMap.keys()),
            locationsValues: Array.from(stringLocationsMap.values()),
        } as RevealReferencesResponse,
    });
}

/**
 * Get the document linked to the node's symbol and focus the user on it
 *
 * @param id - The id of the node to reveal
 */
async function revealSymbol(
    location: vscode.Location,
    hierarchy: Hierarchy,
    gotoImplementation: boolean,
) {
    if (!fs.existsSync(location.uri.fsPath)) return;

    if (gotoImplementation) {
        const implementationLocation = await vscode.commands.executeCommand<
            (vscode.Location | vscode.LocationLink)[]
        >('vscode.executeImplementationProvider', location.uri, location.range.start);
        if (implementationLocation.length > 0) {
            if ('uri' in implementationLocation[0]) {
                location = implementationLocation[0];
            } else {
                location = new vscode.Location(
                    implementationLocation[0].targetUri,
                    implementationLocation[0].targetRange,
                );
            }
        }
    }
    const tabsGroup = vscode.window.tabGroups.all;
    let viewColumn: vscode.ViewColumn | undefined;
    // Find the tab which contain the same uri as the node and return its viewColumn
    for (const tabGroup of tabsGroup) {
        for (const tab of tabGroup.tabs) {
            if (tab.input instanceof vscode.TabInputText) {
                if (tab.input.uri.fsPath === location.uri.fsPath) {
                    viewColumn = tabGroup.viewColumn;
                    break;
                }
            }
        }
    }
    if (viewColumn === undefined) {
        const panel = panels[hierarchy];
        if (panel && panel.viewColumn) {
            if (panel.viewColumn !== vscode.ViewColumn.One) viewColumn = panel.viewColumn - 1;
            else viewColumn = vscode.ViewColumn.Beside;
        }
    }
    const document = await vscode.workspace.openTextDocument(location.uri);
    // Show the text document on either it's original column or in the current if the document
    // wasn't opened
    const editor = await vscode.window.showTextDocument(document, {
        viewColumn: viewColumn !== undefined ? viewColumn : vscode.ViewColumn.Beside,
        preserveFocus: false,
    });
    editor.selection = new vscode.Selection(location.range.start, location.range.start);
    editor.revealRange(location.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * Create a NodeHierarchy object.
 *
 * @param hierarchyItem - A hierarchy item that can come from a TypeHierarchy or CallHierarchy.
 * @param hierarchy - The type of hierarchy needed.
 * @param languageId - The id of the language the symbol is in.
 * @param wantParentLocation - Whether the location stored in the object should be the one passed in
 * hierarchyItem or the one in the parent of the item.
 * @returns A new NodeHierarchy object.
 */
async function createNodeHierarchy(
    hierarchyItem:
        | vscode.TypeHierarchyItem
        | vscode.CallHierarchyOutgoingCall
        | vscode.CallHierarchyIncomingCall
        | vscode.DocumentSymbol
        | vscode.SymbolInformation,
    hierarchy: Hierarchy,
    languageId: string,
    wantParentLocation: boolean = true,
) {
    const item =
        'from' in hierarchyItem
            ? hierarchyItem.from
            : 'to' in hierarchyItem
              ? hierarchyItem.to
              : hierarchyItem;
    let uri =
        'from' in hierarchyItem
            ? hierarchyItem.from.uri
            : 'uri' in hierarchyItem
              ? hierarchyItem.uri
              : 'to' in hierarchyItem
                ? hierarchyItem.to.uri
                : 'location' in hierarchyItem
                  ? hierarchyItem.location.uri
                  : undefined;

    if (!uri) {
        logger.warn('ALS: createNodeHierarchy: Uri was not provided in the item');
        return null;
    }

    // Expand the symlinks to avoid getting the same node twice with a different path.
    const realPath = fs.realpathSync(uri.fsPath);
    uri = vscode.Uri.file(realPath);

    let selectionRange =
        'from' in hierarchyItem
            ? hierarchyItem.from.selectionRange
            : 'uri' in hierarchyItem
              ? hierarchyItem.selectionRange
              : 'to' in hierarchyItem
                ? hierarchyItem.to.selectionRange
                : 'selectionRange' in hierarchyItem
                  ? hierarchyItem.selectionRange
                  : hierarchyItem.location.range;
    let hasParent: boolean | null = null;
    if (fs.existsSync(uri.fsPath)) {
        if (wantParentLocation) {
            const decPosition = await vscode.commands.executeCommand<
                vscode.Location[] | vscode.LocationLink[]
            >('vscode.executeDeclarationProvider', uri, selectionRange.start);

            if (decPosition.length > 0) {
                if ('uri' in decPosition[0]) {
                    uri = decPosition[0].uri;
                    selectionRange = decPosition[0].range;
                } else {
                    uri = decPosition[0].targetUri;
                    if (decPosition[0].targetSelectionRange)
                        selectionRange = decPosition[0].targetSelectionRange;
                }
            }
        }
    } else hasParent = false;
    const position = `Ln ${selectionRange.start.line},` + `Col ${selectionRange.start.character}`;

    const location = new vscode.Location(uri, selectionRange);
    const handler = createHandler(languageId);

    return {
        //Node Data
        id: await handler.generateNodeId(location),
        label: item.name,
        kind: vscode.SymbolKind[item.kind].toLowerCase(),
        expanded: true,
        hasParent: hasParent,
        hasChildren: null,
        focus: false,
        inProject: handler.isInProject(uri),
        string_location: {
            path: uri.fsPath,
            position: position,
        },
        newPosition: undefined,
        hierarchy: hierarchy,

        //Node Hierarchy
        location: location,
        parents: [],
        children: [],
        languageId: languageId,
        handler: handler,
    } as NodeHierarchy;
}

/**
 * Convert a NodeHierarchy object to a NodeData that can be used by the client side.
 *
 * @param nodeHierarchy - A NodeHierarchy object.
 * @returns A new NodeData object.
 */
function convertHierarchyToData(nodeHierarchy: NodeHierarchy) {
    return {
        id: nodeHierarchy.id,
        label: nodeHierarchy.label,
        kind: nodeHierarchy.kind,
        expanded: nodeHierarchy.expanded,
        hasParent: nodeHierarchy.hasParent,
        hasChildren: nodeHierarchy.hasChildren,
        focus: nodeHierarchy.focus,
        inProject: nodeHierarchy.inProject,
        string_location: {
            path: nodeHierarchy.location.uri.fsPath,
            position:
                `Ln ${nodeHierarchy.location.range.start.line}, ` +
                `Col ${nodeHierarchy.location.range.start.character}`,
        },
        newPosition: nodeHierarchy.newPosition,
        hierarchy: nodeHierarchy.hierarchy,
    } as NodeData;
}

/**
 * Convert A NodeHierarchy object into a set of nodes and edges.
 *
 * @param nodes - The set of nodes that will contain the converted nodes.
 * @param edges - The set of edges that will contain the converted edges.
 * @param root - The NodeHierarchy object that will be converted.
 */
function convertToMessage(
    nodes: NodeData[],
    edges: DirectedEdge[],
    root: NodeHierarchy,
    alreadyAdded: Set<string>,
) {
    nodes.push(convertHierarchyToData(root));
    const queue: NodeHierarchy[] = [];
    if (root.expanded) queue.push(...root.children);
    while (queue.length !== 0) {
        const node: NodeHierarchy = queue.splice(0, 1)[0];
        if (alreadyAdded.has(node.id)) continue;
        alreadyAdded.add(node.id);
        nodes.push(convertHierarchyToData(node));
        for (const parent of node.parents) {
            if (!parent.expanded) continue;
            const edge = Array.from(edges).find(
                (edge) =>
                    (edge.src === parent.id && edge.dst === node.id) ||
                    (edge.src === node.id && edge.dst === parent.id),
            );
            if (!edge)
                edges.push({
                    src: parent.id,
                    dst: node.id,
                    edgeDirection: RelationDirection.SUB,
                });
            else if (edge.src === node.id) edge.edgeDirection = RelationDirection.BOTH;
        }
        if (node.expanded) queue.push(...node.children);
    }
}

/**
 * Convert all the root nodes and add them to a set of nodes and edges before
 * sending them to the client side.
 *
 * @param nodeId - The id of the node that was added/modified
 * @param hierarchy - The type of hierarchy needed.
 */
function sendMessage(nodeId: string, hierarchy: Hierarchy, focus = true) {
    const nodes: NodeData[] = [];
    const edges: DirectedEdge[] = [];
    const alreadyAdded: Set<string> = new Set();
    for (const root of rootNodes) {
        if (root.hierarchy === hierarchy) convertToMessage(nodes, edges, root, alreadyAdded);
    }
    if (nodes.length !== 0) {
        const panel = panels[hierarchy];
        panel?.webview.postMessage({
            command: 'hierarchy',
            data: {
                nodesData: nodes,
                edges: edges,
                mainNodeId: nodeId,
                focus: focus,
            } as NodeEdgeMessage,
        });
        panel?.reveal();
    }
    if (focusedNode) focusedNode.focus = false;
}

/**
 * Helper function that either add the node to the symbolsMap and return it or return the one
 * from the Map if it already exists
 *
 * @param newNode - The node to add into the map.
 * @returns The same node or the one  already stored in the map.
 */
function insertSymbolsMap(newNode: NodeHierarchy) {
    const node = symbolsMap.get(newNode.id);
    if (node !== undefined) return node;
    symbolsMap.set(newNode.id, newNode);
    return newNode;
}

/**
 * Get the additional hierarchy information from a node.
 *
 * @param command - The command to execute.
 * @param hierarchyItem - The type of hierarchy needed.
 * @param direction - The direction of the hierarchy
 * @param middleNode - The node from which the hierarchy is executed.
 * @param hierarchy - The type of hierarchy needed.
 */
async function getHierarchy(
    command: string,
    hierarchyItem: vscode.TypeHierarchyItem | vscode.CallHierarchyItem,
    direction: RelationDirection,
    middleNode: NodeHierarchy,
    hierarchy: Hierarchy,
) {
    const items = await vscode.commands.executeCommand<
        | vscode.TypeHierarchyItem[]
        | vscode.CallHierarchyIncomingCall[]
        | vscode.CallHierarchyOutgoingCall[]
    >(command, hierarchyItem);
    for (const item of items) {
        const newNodeTmp = await createNodeHierarchy(item, hierarchy, middleNode.languageId);
        if (!newNodeTmp) continue;
        bindNodes(middleNode, newNodeTmp, direction);
    }
    if (direction === RelationDirection.SUB && middleNode.children.length === 0)
        middleNode.hasChildren = false;
    if (direction === RelationDirection.SUPER && middleNode.parents.length === 0)
        middleNode.hasParent = false;
}

/**
 * Bind two node together as parent/child. Check if they are not already related.
 *
 * @param middleNode - The main node of the hierarchy.
 * @param otherNode - The node that will be bound to the middleNode.
 * @param direction - The direction in which to bind the nodes.
 */
function bindNodes(
    middleNode: NodeHierarchy,
    otherNode: NodeHierarchy,
    direction: RelationDirection,
) {
    const newNode = insertSymbolsMap(otherNode);
    if (direction === RelationDirection.SUB) {
        if (!middleNode.children.some((node) => node.id === newNode.id)) {
            middleNode.children.push(newNode);
            middleNode.hasChildren = true;
        }
        if (!newNode.parents.some((node) => node.id === middleNode.id)) {
            newNode.parents.push(middleNode);
            newNode.hasParent = true;
        }
    }
    // Only add recursive node when adding children
    else if (middleNode !== newNode) {
        if (!middleNode.parents.some((node) => node.id === newNode.id)) {
            middleNode.parents.push(newNode);
            middleNode.hasParent = true;
        }
        if (!newNode.children.some((node) => node.id === middleNode.id)) {
            newNode.children.push(middleNode);
            newNode.hasChildren = true;
        }
        // We check if we just created middleNode or it is a node created previously
        if (newNode === otherNode) newNode.expanded = true;
    }
}

/**
 * Get hierarchy information from a location.
 *
 * @param location - The location of the symbol in the code.
 * @param hierarchy - The type of hierarchy needed.
 * @param languageId - The id of the language the symbol is in.
 * @param direction - The direction of the hierarchy
 */
async function getCodeHierarchy(
    location: vscode.Location,
    hierarchy: Hierarchy,
    languageId: string,
    direction: RelationDirection = RelationDirection.BOTH,
) {
    const items = await vscode.commands.executeCommand<
        (vscode.CallHierarchyItem | vscode.TypeHierarchyItem)[]
    >(
        hierarchy ? 'vscode.prepareCallHierarchy' : 'vscode.prepareTypeHierarchy',
        location.uri,
        location.range.start,
    );
    if (items.length == 0) return;
    let middleNode;
    for (const item of items) {
        const tmpNode = await createNodeHierarchy(item, hierarchy, languageId);
        if (!tmpNode) continue;
        middleNode = insertSymbolsMap(tmpNode);
        middleNode.focus = true;
        focusedNode = middleNode;
        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUPER) {
            await getHierarchy(
                hierarchy ? 'vscode.provideIncomingCalls' : 'vscode.provideSupertypes',
                item,
                RelationDirection.SUPER,
                middleNode,
                hierarchy,
            );
        }
        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUB) {
            await getHierarchy(
                hierarchy ? 'vscode.provideOutgoingCalls' : 'vscode.provideSubtypes',
                item,
                RelationDirection.SUB,
                middleNode,
                hierarchy,
            );
        }
        middleNode.expanded = direction === RelationDirection.SUPER ? middleNode.expanded : true;
    }
    // Get all the nodes that does not have parents
    rootNodes = findRoots();
    return middleNode;
}

/**
 * Get package hierarchy information from a location.
 * This features works specifically for ada.
 *
 * @param location - The location of the symbol in the code.
 * @param languageId - The id of the language the symbol is in.
 * @param direction - The direction of the hierarchy
 * @returns
 */
async function getPackageHierarchy(
    location: vscode.Location,
    languageId: string,
    direction: RelationDirection = RelationDirection.SUB,
) {
    let middleNode: NodeHierarchy | null = null;
    // The location of the body of the package if `location` point to the  package definition or
    // the other way around.
    let subLocation: vscode.Location | null = null;

    // Get the base package symbol information from the location given as a parameter.
    const baseSymbols = await vscode.commands.executeCommand<
        (vscode.SymbolInformation | vscode.DocumentSymbol)[]
    >('vscode.executeDocumentSymbolProvider', location.uri);
    // Search the symbol representing a package (definition) or a module (body).
    for (const symbol of baseSymbols) {
        const packageLoc = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            location.uri,
            'selectionRange' in symbol ? symbol.selectionRange.start : symbol.location.range.start,
        );
        if (packageLoc.length > 0) {
            // If the symbol found represent the body, update the symbol location to point on
            // the definition.
            if (symbol.kind === vscode.SymbolKind.Module) {
                if ('selectionRange' in symbol) {
                    symbol.selectionRange = packageLoc[0].range;
                }
                if ('uri' in symbol) {
                    symbol.uri = packageLoc[0].uri;
                } else if ('location' in symbol) {
                    symbol.location.uri = packageLoc[0].uri;
                    symbol.location.range = packageLoc[0].range;
                }
                symbol.kind = vscode.SymbolKind.Package;
            }
            subLocation = new vscode.Location(packageLoc[0].uri, packageLoc[0].range);
            middleNode = await createNodeHierarchy(symbol, Hierarchy.PACKAGE, languageId, false);
            if (!middleNode) return;

            middleNode = insertSymbolsMap(middleNode);

            break;
        } else if (symbol.kind === vscode.SymbolKind.Package) {
            middleNode = await createNodeHierarchy(symbol, Hierarchy.PACKAGE, languageId);
            if (!middleNode) return;

            middleNode = insertSymbolsMap(middleNode);
            break;
        }
    }
    if (!middleNode) return;

    // Get the packages depending on the current one.
    const dependencies = await vscode.commands.executeCommand<ALS_Unit_Description[]>(
        'als-show-dependencies',
        {
            uri: location.uri.toString(),
            kind:
                direction === RelationDirection.SUB
                    ? ALS_ShowDependenciesKind.SHOW_IMPORTED
                    : ALS_ShowDependenciesKind.SHOW_IMPORTING,
            showImplicit: false,
        },
    );
    // The dependencies can be different for the definition and the body so the command is call
    // on each one to get all of them.
    if (subLocation)
        dependencies.push(
            ...(await vscode.commands.executeCommand<ALS_Unit_Description[]>(
                'als-show-dependencies',
                {
                    uri: subLocation.uri.toString(),
                    kind:
                        direction === RelationDirection.SUB
                            ? ALS_ShowDependenciesKind.SHOW_IMPORTED
                            : ALS_ShowDependenciesKind.SHOW_IMPORTING,
                    showImplicit: false,
                },
            )),
        );
    for (const dependency of dependencies) {
        const uri = vscode.Uri.parse(dependency.uri);
        if (!fs.existsSync(uri.fsPath)) continue;

        const symbols = await vscode.commands.executeCommand<
            (vscode.SymbolInformation | vscode.DocumentSymbol)[]
        >('vscode.executeDocumentSymbolProvider', uri);
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Package) {
                const node = await createNodeHierarchy(
                    symbol,
                    Hierarchy.PACKAGE,
                    languageId,
                    false,
                );
                if (!node) continue;
                bindNodes(middleNode, node, direction);
                break;
            }
        }
    }
    if (middleNode) {
        middleNode.expanded = direction === RelationDirection.SUPER ? middleNode.expanded : true;
    }
    if (direction === RelationDirection.SUB && middleNode.children.length === 0)
        middleNode.hasChildren = false;
    if (direction === RelationDirection.SUPER && middleNode.parents.length === 0)
        middleNode.hasParent = false;
    rootNodes = findRoots();
    return middleNode;
}

/**
 * Create a new webView panel if one is not already active.
 *
 * @param context - The vscode context of the extension.
 */
function setupWebView(context: vscode.ExtensionContext, hierarchy: Hierarchy) {
    const hierarchyType =
        hierarchy === Hierarchy.CALL ? 'Call' : hierarchy === Hierarchy.TYPE ? 'Type' : 'Package';
    const id = 'alsVisualizer' + hierarchyType;
    const title = 'Visualize ' + hierarchyType + ' Hierarchy';

    let panel = panels[hierarchy];
    if (panel != undefined && panel != null) return;
    panel = vscode.window.createWebviewPanel(id, title, vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });
    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage((message: Message) => {
        void handleMessage(message);
    });
    panel.onDidDispose(() => {
        panels[hierarchy] = null;
        for (const key of symbolsMap.keys()) {
            if (symbolsMap.get(key)?.hierarchy === hierarchy) symbolsMap.delete(key);
        }
        stopProcess = true;
        rootNodes = findRoots();
    });
    panels[hierarchy] = panel;
}

/**
 * Create the HTML part of the webview.
 *
 * @param webview - The webView panel.
 * @param extensionUri - The uri of the extensions.
 * @returns An html string that represent the main body of the webView.
 */
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'out', 'src', 'visualizing', 'AppMain.js'),
    );
    const codiconsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(
            extensionUri,
            'node_modules',
            '@vscode/codicons',
            'dist',
            'codicon.css',
        ),
    );
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <title>Visualizer</title>
            <link href="${codiconsUri}" rel="stylesheet" />
        </head>
        <body>
            <div id="root"></div>
            <script type="module" src="${scriptUri}"></script>
        </body>
        </html>
    `;
}
