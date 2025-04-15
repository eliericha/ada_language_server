import * as vscode from 'vscode';

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
    async generateNodeId(nodeLocation: vscode.Location) {
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
        return vscode.workspace.getWorkspaceFolder(uri) !== undefined;
    }
}

export class AdaVisualizerHandler extends VisualizerHandler {
    async generateNodeId(nodeLocation: vscode.Location) {
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            nodeLocation.uri,
            nodeLocation.range.start,
        );
        let hoverValues: string = '';
        for (const hover of hovers) {
            hoverValues +=
                (hoverValues.length === 0 ? '' : '/') +
                // Collapse multiple following whitespaces into one
                (hover.contents[0] as vscode.MarkdownString).value.replace(/\s+/g, ' ').trim();
        }

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
