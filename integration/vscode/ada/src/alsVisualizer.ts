/* eslint-disable @typescript-eslint/restrict-template-expressions */
// Needed for importing the script in the html snippet
import {
    commands,
    ExtensionContext,
    SymbolInformation,
    SymbolKind,
    TypeHierarchyItem,
    Uri,
    ViewColumn,
    Webview,
    window,
} from 'vscode';

function setupWebView(context: ExtensionContext) {
    const panel = window.createWebviewPanel('alsVisualizer', 'Als Visualizer', ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });
    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage((message) => {
        panel.webview.postMessage(message);
    });
    return panel;
}

async function handleSymbols(symbols: SymbolInformation[]) {
    for (const symbol of symbols) {
        if (symbol.kind == SymbolKind.Struct) {
            const typeItems = await commands.executeCommand<TypeHierarchyItem[]>(
                'vscode.prepareTypeHierarchy',
                symbol.location.uri,
                symbol.location.range.start,
            );
            for (const typeItem of typeItems) {
                const subtypes = await commands.executeCommand<TypeHierarchyItem>(
                    'vscode.provideSubtypes',
                    typeItem,
                );
            }
        }
    }
}

export async function startVisualize(context: ExtensionContext) {
    // Create a new WebViewPanel which will display the graph
    const panel = setupWebView(context);

    const symbols = (
        await commands.executeCommand<SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            '',
        )
    ).filter((symbol) => !symbol.location.uri.fsPath.includes('adainclude'));

    console.log(symbols);
    await handleSymbols(symbols);

    const packages = symbols.filter((symbols) => symbols.kind == SymbolKind.Package);

    const names = packages.map((symbol) => symbol.name);

    if (names.length !== 0) {
        panel.webview.postMessage({ command: 'packages', data: JSON.stringify(names) });
    }
    console.log(packages);
}

function getWebviewContent(webview: Webview, extensionUri: Uri) {
    const scriptUri = webview.asWebviewUri(
        Uri.joinPath(extensionUri, 'out', 'src', 'visualizing', 'AppMain.js'),
    );
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <title>Visualizer</title>
        </head>
        <body>
            <div id="root"></div>
            <script type="module" src="${scriptUri}"></script>
        </body>
        </html>
    `;
}
