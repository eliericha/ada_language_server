import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Create a new VisualizerHandler based on a language ID.
 *
 * @param languageId - The id representing the language needed for the visualizerHandler
 * @returns a new VisualizerHandler instance with a dynamic type of the subclass of the language
 * passed as a parameter (or the base class if not found)
 */
export function createHandler(languageId: string): VisualizerHandler {
    switch (languageId) {
        case 'ada':
            return new AdaVisualizerHandler();
        case 'cpp':
            return new CPPVisualizerHandler();
        case 'typescript':
        case 'javascript':
            return new JsTsVisualizerHandler();
        default:
            return new VisualizerHandler();
    }
}

/**
 * Base class for all the VisualizerHandler, provide a default implementation of the function.
 *
 * /!\\ Those default implementation should work in a lot of case but they are mostly here in
 * backup. Prefer implementing the functions using the language specifics.
 *
 */
export class VisualizerHandler {
    /**
     * Generate an id for a symbol based on its hover information and it hierarchy inside a file.
     *
     * @param nodeLocation - The location of the node in the project
     * @returns An position-independent id for the symbol.
     */
    async generateNodeId(nodeLocation: vscode.Location, label: string = '') {
        void label;
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            nodeLocation.uri,
            nodeLocation.range.start,
        );
        let hoverValues = '';
        for (const hover of hovers) {
            for (const content of hover.contents) {
                hoverValues +=
                    (hoverValues.length === 0 ? '' : '/') +
                    // Collapse multiple following whitespaces into one
                    (content as vscode.MarkdownString).value.replace(/\s+/g, ' ').trim();
            }
        }

        const clearId = nodeLocation.uri.fsPath + ':' + hoverValues;

        // Hash the file uri and the symbol location to get the id
        const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(clearId));
        return Array.from(new Uint8Array(hash))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Check if a given file belongs to the project.
     *
     * @param uri - The uri of the file tested.
     * @returns True if the file is part of the project and false otherwise (if it is a file
     * generated at runtime for example).
     */
    isInProject(uri: vscode.Uri) {
        return vscode.workspace.getWorkspaceFolder(uri) !== undefined || !fs.existsSync(uri.fsPath);
    }

    /**
     * Get the location (uri and range) of the body of a specific node.
     *
     * @param node - The node to get the body location from.
     * @returns The symbol's body location.
     */
    async getFunctionBodyLocation(location: vscode.Location) {
        if (!fs.existsSync(location.uri.fsPath)) return null;
        const implementations = await vscode.commands.executeCommand<
            (vscode.Location | vscode.LocationLink)[]
        >('vscode.executeImplementationProvider', location.uri, location.range.start);
        if (implementations.length > 0) return implementations[0];
        return null;
    }

    /**
     * Get the entire range of a symbol (for a function, its entire body for
     * example).
     *
     * @param symbol - The symbol tree in which to search.
     * @param label - The name of the symbol.
     * @param location  - The selection range of the symbol to search.
     * @returns
     */
    getSymbolWholeRange(
        symbol: vscode.SymbolInformation | vscode.DocumentSymbol,
        label: string,
        location: vscode.Location | vscode.LocationLink,
    ): vscode.Range | null {
        const range = 'range' in location ? location.range : location.targetRange;
        if ('children' in symbol) {
            if (symbol.name === label && symbol.selectionRange.isEqual(range)) return symbol.range;
            else {
                for (const child of symbol.children) {
                    const range = this.getSymbolWholeRange(child, label, location);
                    if (range !== null) return range;
                }
            }
        } else if (symbol.name === label && symbol.location.range.contains(range))
            return symbol.location.range;
        return null;
    }
}

export class AdaVisualizerHandler extends VisualizerHandler {
    async generateNodeId(nodeLocation: vscode.Location, label: string = '') {
        let hoverValues: string = '';
        if (fs.existsSync(nodeLocation.uri.fsPath)) {
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                nodeLocation.uri,
                nodeLocation.range.start,
            );
            for (const hover of hovers) {
                hoverValues +=
                    (hoverValues.length === 0 ? '' : '/') +
                    // Collapse multiple following whitespaces into one
                    (hover.contents[0] as vscode.MarkdownString).value.replace(/\s+/g, ' ').trim();
            }
        } else hoverValues = label;

        const clearId = nodeLocation.uri.fsPath + ':' + hoverValues;

        // Hash the file uri and the symbol location to get the id
        const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(clearId));
        return Array.from(new Uint8Array(hash))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    isInProject(uri: vscode.Uri) {
        return !uri.fsPath.includes('adainclude');
    }
}

export class CPPVisualizerHandler extends VisualizerHandler {
    async getFunctionBodyLocation(location: vscode.Location) {
        const implementations = await vscode.commands.executeCommand<
            (vscode.Location | vscode.LocationLink)[]
        >('vscode.executeDefinitionProvider', location.uri, location.range.start);
        if (implementations.length > 0) return implementations[0];
        return null;
    }

    getSymbolWholeRange(
        symbol: vscode.SymbolInformation | vscode.DocumentSymbol,
        label: string,
        location: vscode.Location | vscode.LocationLink,
    ): vscode.Range | null {
        symbol.name = symbol.name.split('(')[0];
        label = label.split('(')[0];
        return super.getSymbolWholeRange(symbol, label, location);
    }
}

export class JsTsVisualizerHandler extends VisualizerHandler {
    isInProject(uri: vscode.Uri) {
        return !uri.fsPath.includes('node_modules') && super.isInProject(uri);
    }
}
