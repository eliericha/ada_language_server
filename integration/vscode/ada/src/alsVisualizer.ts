/* eslint-disable @typescript-eslint/restrict-template-expressions */
// Needed for importing the script in the html snippet
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    DirectedEdge,
    RelationDirection,
    Message,
    NodeData,
    RequestMessage,
    SymbolsMap,
    NodeHierarchy,
} from './vizualizerTypes';

// Store the roots of all the graph (the node that don't have parents)
let rootNodes: NodeHierarchy[] = [];
const symbolsMap: SymbolsMap = new Map();
// The node that will be focused when updating the graph
let focusedNode: NodeHierarchy | null = null;

let panel: vscode.WebviewPanel | null;

async function handleMessage(message: Message) {
    switch (message.command) {
        case 'requestTypes': {
            const data = JSON.parse(message.data) as RequestMessage;
            const node = symbolsMap.get(data.label);
            // Check that the symbol is not a runtime generated one
            if (node === undefined) return;
            node.expanded = data.expand;
            if (
                (data.expand || data.direction === RelationDirection.SUPER) &&
                fs.existsSync(node.location.uri.fsPath)
            )
                await getTypeHierarchy(node.location, data.direction);
            sendMessage();
            break;
        }
    }
}

function createNodeHierarchy(typeHierarchyItem: vscode.TypeHierarchyItem) {
    return {
        label: typeHierarchyItem.name,
        // We only keeps important informations as all the other will be lost after a JSON.stringify
        location: new vscode.Location(
            typeHierarchyItem.uri,
            typeHierarchyItem.selectionRange.start,
        ),
        kind: vscode.SymbolKind[typeHierarchyItem.kind].toLowerCase(),
        parent: null,
        childrens: [],
        expanded: false,
        hasParent: false,
        focus: false,
    } as NodeHierarchy;
}

function convertHierarchyToData(nodeHierarchy: NodeHierarchy) {
    return {
        label: nodeHierarchy.label,
        kind: nodeHierarchy.kind,
        expanded: nodeHierarchy.expanded,
        hasParent: nodeHierarchy.hasParent,
        focus: nodeHierarchy.focus,
    } as NodeData;
}

function convertToMessage(nodes: Set<NodeData>, edges: Set<DirectedEdge>, root: NodeHierarchy) {
    nodes.add(convertHierarchyToData(root));
    if (root.expanded) {
        for (const child of root.childrens) {
            edges.add({ src: root.label, dst: child.label, edgeDirection: RelationDirection.SUB });
            convertToMessage(nodes, edges, child);
        }
    }
}

function sendMessage() {
    const nodes: Set<NodeData> = new Set();
    const edges: Set<DirectedEdge> = new Set();
    for (const root of rootNodes) {
        convertToMessage(nodes, edges, root);
    }
    if (nodes.size !== 0) {
        panel?.webview.postMessage({
            command: 'types',
            data: JSON.stringify({ nodesData: [...nodes], edges: [...edges] }),
        });
        panel?.reveal();
    }
    if (focusedNode) focusedNode.focus = false;
}

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

// Helper function either add the symbol to the Map and return it or return the one
// from the Map if it exists
function insertSymbolsMap(newNode: NodeHierarchy) {
    const node = symbolsMap.get(newNode.label);
    if (node !== undefined) return node;
    symbolsMap.set(newNode.label, newNode);
    return newNode;
}

async function getTypeHierarchy(
    location: vscode.Location,
    direction: RelationDirection = RelationDirection.BOTH,
) {
    async function getHierarchy(
        command: string,
        typeItem: vscode.TypeHierarchyItem,
        direction: RelationDirection,
        middleNode: NodeHierarchy,
    ) {
        const types = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            command,
            typeItem,
        );
        types.forEach((type) => {
            const newNodeTmp: NodeHierarchy = createNodeHierarchy(type);
            const newNode = insertSymbolsMap(newNodeTmp);
            if (direction === RelationDirection.SUB) {
                if (!middleNode.childrens.some((node) => node.label === newNode.label))
                    middleNode.childrens.push(newNode);
                newNode.parent = middleNode;
                newNode.hasParent = true;
            } else {
                middleNode.parent = newNode;
                middleNode.hasParent = true;
                if (!newNode.childrens.some((node) => node.label === middleNode.label))
                    newNode.childrens.push(middleNode);
                // We check if we just created middleNode or it is a node created previously
                if (newNode === newNodeTmp) newNode.expanded = true;
            }
        });
    }

    const typeItems = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        'vscode.prepareTypeHierarchy',
        location.uri,
        location.range.start,
    );
    if (typeItems.length == 0) return;
    //TODO: Handle type homonyme
    for (const typeItem of typeItems) {
        const middleNode = insertSymbolsMap(createNodeHierarchy(typeItem));
        middleNode.focus = true;
        focusedNode = middleNode;
        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUPER)
            await getHierarchy(
                'vscode.provideSupertypes',
                typeItem,
                RelationDirection.SUPER,
                middleNode,
            );

        if (direction === RelationDirection.BOTH || direction === RelationDirection.SUB)
            await getHierarchy(
                'vscode.provideSubtypes',
                typeItem,
                RelationDirection.SUB,
                middleNode,
            );
        middleNode.expanded = direction === RelationDirection.SUPER ? middleNode.expanded : true;
    }
    rootNodes = Array.from(symbolsMap.values()).filter((node) => node.parent === null);
}

export async function startVisualize(context: vscode.ExtensionContext) {
    // Create a new WebViewPanel which will display the graph
    if (vscode.window.activeTextEditor) {
        const input = new vscode.Location(
            vscode.window.activeTextEditor?.document.uri,
            vscode.window.activeTextEditor?.selection.active,
        );
        await getTypeHierarchy(input);

        // Create the webView only if there is something to display
        if (symbolsMap.size > 0) setupWebView(context);
        sendMessage();
    }
}

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
