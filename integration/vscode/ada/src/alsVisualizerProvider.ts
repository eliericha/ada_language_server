import * as vscode from 'vscode';
import * as fs from 'fs';
import { logger } from './extension';
import {
    EdgeType,
    Hierarchy,
    NodeHierarchy,
    RelationDirection,
    VisualizerSymbol,
} from './visualizerTypes';
import { bindNodes, createNodeHierarchy, NodesSingleton } from './alsVisualizerUtils';

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

    /**
     * Construct a set of nodes from the location of a symbol in the code. Supports multiples
     * different types of hierarchy.
     *
     * @param location - The location of the symbol in the code.
     * @param hierarchy - The type of hierarchy needed.
     * @param languageId - The id of the language the symbol is in.
     * @param direction - The direction of the hierarchy
     * @returns The node linked to the location passed as an argument with
     * possibly children and/or parents added.
     */
    async provideHierarchy(
        location: vscode.Location,
        hierarchy: Hierarchy,
        languageId: string,
        direction: RelationDirection,
    ) {
        // -------------------------------- BEGIN NESTED FUNCTIONS ---------------------------------
        /**
         * Get the additional hierarchy information from a node.
         *
         * @param hierarchyItem - The type of hierarchy needed.
         * @param direction - The direction of the hierarchy
         * @param middleNode - The node from which the hierarchy is executed.
         * @param hierarchy - The type of hierarchy needed.
         */
        async function getHierarchy(
            hierarchyItem: vscode.TypeHierarchyItem | vscode.CallHierarchyItem,
            direction: RelationDirection,
            middleNode: NodeHierarchy,
            hierarchy: Hierarchy,
        ) {
            const commands = [
                ['vscode.provideSupertypes', 'vscode.provideIncomingCalls'],
                ['vscode.provideSubtypes', 'vscode.provideOutgoingCalls'],
            ];
            const items: (vscode.TypeHierarchyItem | vscode.CallHierarchyItem)[] = (
                await vscode.commands.executeCommand<
                    | vscode.TypeHierarchyItem[]
                    | vscode.CallHierarchyIncomingCall[]
                    | vscode.CallHierarchyOutgoingCall[]
                >(commands[direction][hierarchy], hierarchyItem)
            ).map((item) => ('name' in item ? item : 'from' in item ? item.from : item.to));

            for (const item of items) {
                const symbol = {
                    name: item.name,
                    location: new vscode.Location(item.uri, item.selectionRange),
                    kind: item.kind,
                } as VisualizerSymbol;

                const newNodeTmp = await createNodeHierarchy(
                    symbol,
                    hierarchy,
                    middleNode.languageId,
                );
                if (!newNodeTmp) continue;
                bindNodes(middleNode, newNodeTmp, direction, EdgeType.REGULAR);
            }
            if (direction === RelationDirection.SUB && middleNode.children.length === 0)
                middleNode.hasChildren = false;
            if (direction === RelationDirection.SUPER && middleNode.parents.length === 0)
                middleNode.hasParent = false;
        }
        // -------------------------------- END NESTED FUNCTIONS --------------------------------
        if (hierarchy !== Hierarchy.CALL && hierarchy !== Hierarchy.TYPE) {
            logger.error(
                'alsVisualizerProvider.ts: provideHierarchy: This hierarchy types is not handled.',
            );
            return;
        }

        const commands = ['vscode.prepareTypeHierarchy', 'vscode.prepareCallHierarchy'];

        const items = await vscode.commands.executeCommand<
            (vscode.CallHierarchyItem | vscode.TypeHierarchyItem)[]
        >(commands[hierarchy], location.uri, location.range.start);

        if (items.length == 0) return;

        // The middle node represent the current main symbol in the graph (the symbol the visualizer
        // was launched on or the symbol for which we are calculating its parent or children).
        let middleNode;

        for (const item of items) {
            const symbol: VisualizerSymbol = {
                name: item.name,
                location: new vscode.Location(item.uri, item.selectionRange),
                kind: item.kind,
            };
            const tmpNode = await createNodeHierarchy(symbol, hierarchy, languageId);
            if (!tmpNode) continue;
            middleNode = NodesSingleton.insertSymbolsMap(tmpNode);
            // Once the process is done we want the graph to focus on this specific node.
            middleNode.focus = true;

            NodesSingleton.focusedNode = middleNode;

            if (direction === RelationDirection.BOTH || direction === RelationDirection.SUPER) {
                await getHierarchy(item, RelationDirection.SUPER, middleNode, hierarchy);
            }
            if (direction === RelationDirection.BOTH || direction === RelationDirection.SUB) {
                await getHierarchy(item, RelationDirection.SUB, middleNode, hierarchy);
            }

            // The middle node is expanded by default when we are getting its children.
            middleNode.expanded =
                direction === RelationDirection.SUPER ? middleNode.expanded : true;
        }

        // Get all the nodes that does not have parents
        NodesSingleton.findRoots();
        return middleNode;
    }
}
