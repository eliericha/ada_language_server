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
} from './visualizerTypes';

// Store the roots of all the graph (the node that don't have parents)
let rootNodes: NodeHierarchy[] = [];
const symbolsMap: SymbolsMap = new Map();
// The node that will be focused when updating the graph
let focusedNode: NodeHierarchy | null = null;

let panel: vscode.WebviewPanel | null;

/**
 * Handle the message received from client side
 *
 * @param message - The message received.
 */
async function handleMessage(message: Message) {
    switch (message.command) {
        case 'requestHierarchy': {
            const data = JSON.parse(message.data) as HierarchyMessage;
            const node = symbolsMap.get(data.label);
            // Check that the symbol is not a runtime generated one
            if (node === undefined) return;
            node.expanded = data.expand;
            if (
                (data.expand || data.direction === RelationDirection.SUPER) &&
                fs.existsSync(node.location.uri.fsPath)
            )
                await getCodeHierarchy(node.location, data.hierarchy, data.direction);
            sendMessage();
            break;
        }
    }
}

/**
 * Create a NodeHierarchy object.
 *
 * @param hierarchyItem - A hierarchy item that can come from a TypeHierarchy or CallHierarchy.
 * @returns A new NodeHierarchy object.
 */
function createNodeHierarchy(
    hierarchyItem:
        | vscode.TypeHierarchyItem
        | vscode.CallHierarchyOutgoingCall
        | vscode.CallHierarchyIncomingCall,
) {
    const item =
        'from' in hierarchyItem
            ? hierarchyItem.from
            : 'to' in hierarchyItem
              ? hierarchyItem.to
              : hierarchyItem;
    return {
        label: item.name,
        location: new vscode.Location(item.uri, item.selectionRange.start),
        kind: vscode.SymbolKind[item.kind].toLowerCase(),
        parent: null,
        childs: [],
        expanded: false,
        hasParent: false,
        focus: false,
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
        label: nodeHierarchy.label,
        kind: nodeHierarchy.kind,
        expanded: nodeHierarchy.expanded,
        hasParent: nodeHierarchy.hasParent,
        focus: nodeHierarchy.focus,
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
    if (root.expanded) {
        for (const child of root.childs) {
            edges.add({ src: root.label, dst: child.label, edgeDirection: RelationDirection.SUB });
            convertToMessage(nodes, edges, child);
        }
    }
}

/**
 * Convert all the root nodes and add them to a set of nodes and edges before
 * sending them to the client side.
 */
function sendMessage() {
    const nodes: Set<NodeData> = new Set();
    const edges: Set<DirectedEdge> = new Set();
    for (const root of rootNodes) {
        convertToMessage(nodes, edges, root);
    }
    if (nodes.size !== 0) {
        panel?.webview.postMessage({
            command: 'hierarchy',
            data: JSON.stringify({ nodesData: [...nodes], edges: [...edges] }),
        });
        panel?.reveal();
    }
    if (focusedNode) focusedNode.focus = false;
}

/**
 * Create a new webView panel if one is not already active.
 *
 * @param context - The vscode context of the extension.
 */
function setupWebView(context: vscode.ExtensionContext) {
    if (panel != undefined && panel != null) return;
    panel = vscode.window.createWebviewPanel(
        'alsVisualizer',
        'Als Visualizer',
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
        panel = null;
        symbolsMap.clear();
        rootNodes = [];
    });
}

/**
 * Helper function that either add the node to the symbolsMap and return it or return the one
 * from the Map if it already exists
 *
 * @param newNode - The node to add into the map.
 * @returns The same node or the one  already stored in the map.
 */
function insertSymbolsMap(newNode: NodeHierarchy) {
    const node = symbolsMap.get(newNode.label);
    if (node !== undefined) return node;
    symbolsMap.set(newNode.label, newNode);
    return newNode;
}

/**
 * Get the additional hierarchy information from a node.
 *
 * @param command - The command to execute.
 * @param hierarchyItem - The type of hierarchy needed.
 * @param direction - The direction of the hierarchy
 * @param middleNode - The node from which the hierarchy is executed.
 */
async function getHierarchy(
    command: string,
    hierarchyItem: vscode.TypeHierarchyItem | vscode.CallHierarchyItem,
    direction: RelationDirection,
    middleNode: NodeHierarchy,
) {
    const types = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        command,
        hierarchyItem,
    );
    types.forEach((type) => {
        const newNodeTmp: NodeHierarchy = createNodeHierarchy(type);
        const newNode = insertSymbolsMap(newNodeTmp);
        if (direction === RelationDirection.SUB) {
            if (!middleNode.childs.some((node) => node.label === newNode.label))
                middleNode.childs.push(newNode);
            newNode.parent = middleNode;
            newNode.hasParent = true;
        } else {
            middleNode.parent = newNode;
            middleNode.hasParent = true;
            if (!newNode.childs.some((node) => node.label === middleNode.label))
                newNode.childs.push(middleNode);
            // We check if we just created middleNode or it is a node created previously
            if (newNode === newNodeTmp) newNode.expanded = true;
        }
    });
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
    //TODO: Handle type homonym
    for (const item of items) {
        const middleNode = insertSymbolsMap(createNodeHierarchy(item));
        middleNode.focus = true;
        focusedNode = middleNode;
        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUPER)
            await getHierarchy(
                hierarchy ? 'vscode.provideIncomingCalls' : 'vscode.provideSupertypes',
                item,
                RelationDirection.SUPER,
                middleNode,
            );

        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUB)
            await getHierarchy(
                hierarchy ? 'vscode.provideOutgoingCalls' : 'vscode.provideSubtypes',
                item,
                RelationDirection.SUB,
                middleNode,
            );
        middleNode.expanded = direction === RelationDirection.SUPER ? middleNode.expanded : true;
    }
    // Get all the nodes that does not have parents
    rootNodes = Array.from(symbolsMap.values()).filter((node) => node.parent === null);
}

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
        await getCodeHierarchy(input, Hierarchy.TYPES);

        // Create the webView only if there is something to display
        if (symbolsMap.size > 0) setupWebView(context);
        sendMessage();
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
        await getCodeHierarchy(input, Hierarchy.CALL);

        // Create the webView only if there is something to display
        if (symbolsMap.size > 0) setupWebView(context);
        sendMessage();
    }
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
