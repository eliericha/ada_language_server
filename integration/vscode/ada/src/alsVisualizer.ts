/* eslint-disable @typescript-eslint/restrict-template-expressions */
// Needed for importing the script in the html snippet
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    DirectedEdge,
    RelationDirection,
    Message,
    NodeData,
    RequestHierarchy,
    SymbolsMap,
} from './vizualizerTypes';

let panel: vscode.WebviewPanel | null;

async function handleMessage(message: Message) {
    switch (message.command) {
        case 'requestTypes': {
            const data = JSON.parse(message.data) as RequestHierarchy;

            // Check that the symbol is not a runtime generated one
            if (!fs.existsSync(data.location.path)) return;
            const location = new vscode.Location(
                vscode.Uri.file(data.location.path),
                new vscode.Range(data.location.range[0], data.location.range[1]),
            );
            const symbolsMap = await getTypeHierarchy(location, data.direction);
            sendMessage(symbolsMap);
            break;
        }
        default:
            panel?.webview.postMessage(message);
            break;
    }
}

function createNodeData(typeHierarchyItem: vscode.TypeHierarchyItem) {
    return {
        label: typeHierarchyItem.name,
        // We only keeps important informations as all the other will be lost after a JSON.stringify
        location: {
            path: typeHierarchyItem.uri.fsPath,
            range: [typeHierarchyItem.selectionRange.start, typeHierarchyItem.selectionRange.end],
        },
        kind: vscode.SymbolKind[typeHierarchyItem.kind].toLowerCase(),
        edges: new Set<DirectedEdge>(),
    };
}

function sendMessage(symbolsMap: SymbolsMap) {
    const nodes: Set<NodeData> = new Set();
    const edges: Set<DirectedEdge> = new Set();
    for (const symbol of symbolsMap) {
        nodes.add(symbol[1]);
        for (const edge of symbol[1].edges) {
            const dstData = symbolsMap.get(edge.dst);
            if (dstData) nodes.add(dstData);
            edges.add({
                src: edge.src,
                dst: edge.dst,
                edgeDirection: edge.edgeDirection,
            });
        }
    }
    if (nodes.size !== 0) {
        panel?.webview.postMessage({
            command: 'types',
            data: JSON.stringify({ nodesData: [...nodes], edges: [...edges] }),
        });
        panel?.reveal();
    }
}

function setupWebView(context: vscode.ExtensionContext) {
    if (panel != undefined && panel != null) return;
    panel = vscode.window.createWebviewPanel(
        'alsVisualizer',
        'Als Visualizer',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        },
    );
    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage((message: Message) => {
        void handleMessage(message);
    });
    panel.onDidDispose(() => (panel = null));
}

async function getTypeHierarchy(
    location: vscode.Location,
    direction: RelationDirection = RelationDirection.Both,
) {
    const symbolMap: SymbolsMap = new Map();

    async function getHierarchy(
        command: string,
        typeItem: vscode.TypeHierarchyItem,
        direction: RelationDirection,
    ) {
        const opposite =
            direction === RelationDirection.In ? RelationDirection.Out : RelationDirection.In;
        // We can only call the supertypes as relations between type is non oriented
        // so subtype(type1) == supertype(type2) if type1 -> type2
        const types = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            command,
            typeItem,
        );
        types.forEach((type) => {
            symbolMap.set(type.name, createNodeData(type));
            if (
                !symbolMap
                    .get(type.name)
                    ?.edges.has({ src: type.name, dst: typeItem.name, edgeDirection: opposite })
            ) {
                symbolMap
                    .get(typeItem.name)
                    ?.edges.add({ src: typeItem.name, dst: type.name, edgeDirection: direction });
            }
        });
    }

    const typeItems = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        'vscode.prepareTypeHierarchy',
        location.uri,
        location.range.start,
    );
    if (typeItems.length == 0) return symbolMap;
    //TODO: Handle type homonyme
    for (const typeItem of typeItems) {
        symbolMap.set(typeItem.name, createNodeData(typeItem));

        if (direction === RelationDirection.Both || direction === RelationDirection.Out)
            await getHierarchy('vscode.provideSupertypes', typeItem, RelationDirection.Out);

        if (direction === RelationDirection.Both || direction === RelationDirection.In)
            await getHierarchy('vscode.provideSubtypes', typeItem, RelationDirection.In);
    }
    return symbolMap;
}

export async function startVisualize(context: vscode.ExtensionContext) {
    // Create a new WebViewPanel which will display the graph
    if (vscode.window.activeTextEditor) {
        const input = new vscode.Location(
            vscode.window.activeTextEditor?.document.uri,
            vscode.window.activeTextEditor?.selection.active,
        );
        const symbolMap = await getTypeHierarchy(input);

        // Create the webView only if there is something to display
        if (symbolMap.size > 0) setupWebView(context);
        sendMessage(symbolMap);
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
