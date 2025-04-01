/* eslint-disable @typescript-eslint/restrict-template-expressions */
// Needed for importing the script in the html snippet
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    DirectedEdge,
    RelationDirection,
    Message,
    NodeData,
    HierarchyMessage,
    SymbolsMap,
    NodeHierarchy,
    Hierarchy,
    NodeEdge,
    DeleteMessage,
    UpdateMessage,
} from './visualizerTypes';

// Store the roots of all the graph (the node that don't have parents)
let rootNodes: NodeHierarchy[] = [];
const symbolsMap: SymbolsMap = new Map();
// The node that will be focused when updating the graph
let focusedNode: NodeHierarchy | null = null;

let callPanel: vscode.WebviewPanel | null;
let typePanel: vscode.WebviewPanel | null;

/**
 * Get TypesHierarchy information.
 *
 * @param context - The vscode context of the extension.
 */
export async function startVisualizeTypes(context: vscode.ExtensionContext) {
    // Create a new WebViewPanel which will display the graph
    if (vscode.window.activeTextEditor) {
        const input = new vscode.Location(
            vscode.window.activeTextEditor?.document.uri,
            vscode.window.activeTextEditor?.selection.active,
        );
        const middleNode = await getCodeHierarchy(input, Hierarchy.TYPES);

        // Create the webView only if there is something to display
        if (middleNode) {
            setupWebView(context, 'alsVisualizerType', 'Visualize Type Hierarchy', Hierarchy.TYPES);
            // Make sure the webView was created and initialized
            setTimeout(() => {
                sendMessage(middleNode.id, Hierarchy.TYPES);
            }, 750);
        }
    }
}
/**
 * Get CallsHierarchy information.
 *
 * @param context - The vscode context of the extension.
 */
export async function startVisualizeCalls(context: vscode.ExtensionContext) {
    // Create a new WebViewPanel which will display the graph
    if (vscode.window.activeTextEditor) {
        const input = new vscode.Location(
            vscode.window.activeTextEditor?.document.uri,
            vscode.window.activeTextEditor?.selection.active,
        );
        const middleNode = await getCodeHierarchy(input, Hierarchy.CALL, RelationDirection.SUPER);

        // Create the webView only if there is something to display
        if (middleNode) {
            setupWebView(context, 'alsVisualizerCall', 'Visualize Call Hierarchy', Hierarchy.CALL);
            // Make sure the webView was created and initialized
            setTimeout(() => {
                sendMessage(middleNode.id, Hierarchy.CALL);
            }, 750);
        }
    }
}

/**
 * Handle the message received from client side
 *
 * @param message - The message received.
 */
async function handleMessage(message: Message) {
    switch (message.command) {
        case 'requestHierarchy': {
            const data = JSON.parse(message.data) as HierarchyMessage;
            const node = symbolsMap.get(data.id);
            // Check that the symbol is not a runtime generated one
            if (node === undefined) return;
            node.expanded = data.expand;
            if (
                (data.expand || data.direction === RelationDirection.SUPER) &&
                fs.existsSync(node.location.uri.fsPath)
            )
                await getCodeHierarchy(node.location, data.hierarchy, data.direction);
            sendMessage(data.id, data.hierarchy);
            break;
        }
        //TODO Dismiss node
        case 'revealNode': {
            void revealNode(message.data);
            break;
        }
        case 'deleteNodes': {
            const data = JSON.parse(message.data) as DeleteMessage;
            deleteNodes(data.nodesId);
        }
    }
}

/**
 * Remove nodes from the symbolMap and the nodeHierarchy. Update the node with no children left
 *
 * @param nodeIds - The ids of the nodes to remove
 */
function deleteNodes(nodeIds: string[]) {
    const toUpdate: NodeHierarchy[] = [];
    nodeIds.forEach((id) => {
        const node = symbolsMap.get(id);
        if (!node) return;
        node.parents.forEach((parent) => {
            parent.childs = parent.childs.filter((child) => child.id !== node.id);
            if (parent.childs.length === 0) {
                toUpdate.push(parent);
                parent.hasChildren = null;
            }
        });
        symbolsMap.delete(id);
    });
    updateNodes(toUpdate);
}

/**
 * Send a message to client side to update the content of certain nodes
 *
 * @param nodes - The node to updates
 */
function updateNodes(nodes: NodeHierarchy[]) {
    const toSend: NodeData[] = nodes.map((node) => convertHierarchyToData(node));
    if (toSend.length !== 0) {
        const panel = toSend[0].hierarchy === Hierarchy.CALL ? callPanel : typePanel;
        panel?.webview.postMessage({
            command: 'updateNodes',
            data: JSON.stringify({
                nodes: toSend,
            } as UpdateMessage),
        });
    }
}

/**
 * Get the document linked to the node's symbol and focus the user on it
 *
 * @param id - The id of the node to reveal
 */
async function revealNode(id: string) {
    const node = symbolsMap.get(id);
    if (node === undefined) return;

    const tabsGroup = vscode.window.tabGroups.all;
    let viewColumn: vscode.ViewColumn | undefined;

    // Find the tab which contain the same uri as the node and return its viewColumn
    for (const tabGroup of tabsGroup) {
        for (const tab of tabGroup.tabs) {
            if (tab.input instanceof vscode.TabInputText) {
                if (tab.input.uri.fsPath === node.location.uri.fsPath) {
                    viewColumn = tabGroup.viewColumn;
                    break;
                }
            }
        }
    }
    const document = await vscode.workspace.openTextDocument(node.location.uri);
    // Show the text document on either it's original column or in the current if the document
    // wasn't opened
    const editor = await vscode.window.showTextDocument(document, {
        viewColumn: viewColumn !== undefined ? viewColumn : vscode.ViewColumn.Active,
        preserveFocus: false,
    });
    editor.selection = new vscode.Selection(node.location.range.start, node.location.range.end);
    editor.revealRange(node.location.range, vscode.TextEditorRevealType.InCenter);
}

/**
 * Search for a specific symbol using a range
 *
 * @param documentSymbol - The document symbol that contained the searched symbol
 * @param searchRange - The range in  which is contained the searched symbol
 * @returns A string representing the different symbols in the file hierarchy leading
 * to the searched symbol
 */
function getFileHierarchy(documentSymbol: vscode.DocumentSymbol, searchRange: vscode.Range) {
    let currentSymbol = documentSymbol;
    let fileHierarchy = documentSymbol.name;

    if (searchRange.contains(documentSymbol.selectionRange)) return fileHierarchy;
    else fileHierarchy += '/';

    let found = true;
    while (found) {
        found = false;
        for (const child of currentSymbol.children) {
            if (searchRange.contains(child.selectionRange)) {
                fileHierarchy += child.name;
                return fileHierarchy;
            }
            if (child.range.contains(searchRange)) {
                fileHierarchy += child.name + '/';
                currentSymbol = child;
                found = true;
                break;
            }
        }
    }
    return '';
}

/**
 * Generate an id for a symbol based on its hover information and it hierarchy inside a file.
 *
 * @param nodeLocation - The location of the node in the project
 * @returns An position-independent id for the symbol.
 */
async function generateNodeId(nodeLocation: vscode.Location) {
    const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        nodeLocation.uri,
    );
    let fileHierarchy: string = '';
    for (const documentSymbol of documentSymbols) {
        if (documentSymbol.range.contains(nodeLocation.range)) {
            fileHierarchy = getFileHierarchy(documentSymbol, nodeLocation.range);
        }
    }

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        nodeLocation.uri,
        nodeLocation.range.start,
    );
    let hoverValues: string = '';
    for (const hover of hovers) {
        for (const content of hover.contents) {
            hoverValues +=
                (hoverValues.length === 0 ? '' : '/') +
                (content as vscode.MarkdownString).value.replace(/\s+/g, ' ').trim();
        }
    }

    const clearId = fileHierarchy + ':' + hoverValues;

    // Hash the file uri and the symbol location to get the id
    const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(clearId));
    return Array.from(new Uint8Array(hash))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Create a NodeHierarchy object.
 *
 * @param hierarchyItem - A hierarchy item that can come from a TypeHierarchy or CallHierarchy.
 * @param hierarchy - The type of hierarchy needed.
 * @returns A new NodeHierarchy object.
 */
async function createNodeHierarchy(
    hierarchyItem:
        | vscode.TypeHierarchyItem
        | vscode.CallHierarchyOutgoingCall
        | vscode.CallHierarchyIncomingCall,
    hierarchy: Hierarchy,
) {
    const item =
        'from' in hierarchyItem
            ? hierarchyItem.from
            : 'to' in hierarchyItem
              ? hierarchyItem.to
              : hierarchyItem;

    const decPosition = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDeclarationProvider',
        item.uri,
        item.selectionRange.start,
    );

    if (decPosition.length > 0) {
        item.uri = decPosition[0].uri;
        item.selectionRange = decPosition[0].range;
    }
    const position =
        `Ln ${item.selectionRange.start.line},` + `Col ${item.selectionRange.start.character}`;

    const location = new vscode.Location(item.uri, item.selectionRange);
    return {
        id: await generateNodeId(location),
        location: location,
        label: item.name,
        kind: vscode.SymbolKind[item.kind].toLowerCase(),
        parents: [],
        childs: [],
        expanded: false,
        hasParent: null,
        hasChildren: null,
        focus: false,
        string_location: {
            path: item.uri.fsPath,
            position: position,
        },
        hierarchy: hierarchy,
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
        string_location: nodeHierarchy.string_location,
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
function convertToMessage(nodes: Set<NodeData>, edges: Set<DirectedEdge>, root: NodeHierarchy) {
    nodes.add(convertHierarchyToData(root));
    const queue: NodeHierarchy[] = [];
    if (root.expanded) queue.push(...root.childs);
    while (queue.length !== 0) {
        const node: NodeHierarchy = queue.splice(0, 1)[0];
        if (nodes.has(node)) continue;
        nodes.add(convertHierarchyToData(node));
        for (const parent of node.parents) {
            edges.add({
                src: parent.id,
                dst: node.id,
                edgeDirection: RelationDirection.SUB,
            });
        }
        if (node.expanded) queue.push(...node.childs);
    }
}

/**
 * Convert all the root nodes and add them to a set of nodes and edges before
 * sending them to the client side.
 */
function sendMessage(nodeId: string, hierarchy: Hierarchy) {
    const nodes: Set<NodeData> = new Set();
    const edges: Set<DirectedEdge> = new Set();
    for (const root of rootNodes) {
        if (root.hierarchy === hierarchy) convertToMessage(nodes, edges, root);
    }
    if (nodes.size !== 0) {
        const panel = hierarchy === Hierarchy.CALL ? callPanel : typePanel;
        panel?.webview.postMessage({
            command: 'hierarchy',
            data: JSON.stringify({
                nodesData: [...nodes],
                edges: [...edges],
                mainNodeId: nodeId,
            } as NodeEdge),
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
    const types = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        command,
        hierarchyItem,
    );
    for (const type of types) {
        const newNodeTmp: NodeHierarchy = await createNodeHierarchy(type, hierarchy);
        const newNode = insertSymbolsMap(newNodeTmp);
        if (direction === RelationDirection.SUB) {
            if (!middleNode.childs.some((node) => node.id === newNode.id)) {
                middleNode.childs.push(newNode);
                middleNode.hasChildren = true;
            }
            newNode.parents.push(middleNode);
            newNode.hasParent = true;
        } else {
            middleNode.parents.push(newNode);
            middleNode.hasParent = true;
            if (!newNode.childs.some((node) => node.id === middleNode.id)) {
                newNode.childs.push(middleNode);
                newNode.hasChildren = true;
            }
            // We check if we just created middleNode or it is a node created previously
            if (newNode === newNodeTmp) newNode.expanded = true;
        }
    }
    if (direction === RelationDirection.SUB && middleNode.childs.length === 0)
        middleNode.hasChildren = false;
    if (direction === RelationDirection.SUPER && middleNode.parents.length === 0)
        middleNode.hasParent = false;
}

/**
 * Get hierarchy information from a location.
 *
 * @param location - The location of the symbol in the code.
 * @param hierarchy - The type of hierarchy needed.
 * @param direction - The direction of the hierarchy
 */
async function getCodeHierarchy(
    location: vscode.Location,
    hierarchy: Hierarchy,
    direction: RelationDirection = RelationDirection.BOTH,
) {
    const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        hierarchy ? 'vscode.prepareCallHierarchy' : 'vscode.prepareTypeHierarchy',
        location.uri,
        location.range.start,
    );
    if (items.length == 0) return;
    let middleNode;
    for (const item of items) {
        middleNode = insertSymbolsMap(await createNodeHierarchy(item, hierarchy));
        middleNode.focus = true;
        focusedNode = middleNode;
        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUPER)
            await getHierarchy(
                hierarchy ? 'vscode.provideIncomingCalls' : 'vscode.provideSupertypes',
                item,
                RelationDirection.SUPER,
                middleNode,
                hierarchy,
            );

        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUB)
            await getHierarchy(
                hierarchy ? 'vscode.provideOutgoingCalls' : 'vscode.provideSubtypes',
                item,
                RelationDirection.SUB,
                middleNode,
                hierarchy,
            );
        middleNode.expanded = direction === RelationDirection.SUPER ? middleNode.expanded : true;
    }
    // Get all the nodes that does not have parents
    rootNodes = Array.from(symbolsMap.values()).filter((node) => node.parents.length === 0);
    return middleNode;
}

/**
 * Create a new webView panel if one is not already active.
 *
 * @param context - The vscode context of the extension.
 */
function setupWebView(
    context: vscode.ExtensionContext,
    id: string,
    title: string,
    hierarchy: Hierarchy,
) {
    let panel = hierarchy === Hierarchy.CALL ? callPanel : typePanel;
    if (panel != undefined && panel != null) return;
    panel = vscode.window.createWebviewPanel(
        id,
        // 'alsVisualizer',
        title,
        // 'Als Visualizer',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        },
    );
    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage((message: Message) => {
        void handleMessage(message);
    });
    panel.onDidDispose(() => {
        if (hierarchy === Hierarchy.CALL) {
            callPanel = null;
            for (const key of symbolsMap.keys()) {
                if (symbolsMap.get(key)?.hierarchy === Hierarchy.CALL) symbolsMap.delete(key);
            }
        } else {
            typePanel = null;
            for (const key of symbolsMap.keys()) {
                if (symbolsMap.get(key)?.hierarchy === Hierarchy.TYPES) symbolsMap.delete(key);
            }
        }
        // symbolsMap.clear();
        // rootNodes = [];
    });
    if (hierarchy === Hierarchy.CALL) callPanel = panel;
    else typePanel = panel;
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
