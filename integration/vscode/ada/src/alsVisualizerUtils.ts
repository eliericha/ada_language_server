import {
    EdgeType,
    Hierarchy,
    NodeData,
    NodeHierarchy,
    RelationDirection,
    VisualizerSymbol,
} from './visualizerTypes';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { VisualizerHandler } from './alsVisualizerProvider';
import { AdaVisualizerHandler } from './alsVisualizerProvider/AdaVisualizerHandler';
import { CPPVisualizerHandler } from './alsVisualizerProvider/CPPVisualizerHandler';
import { JsTsVisualizerHandler } from './alsVisualizerProvider/JsTsVisualizerHandler';
import { GprVisualizerHandler } from './alsVisualizerProvider/GprVisualizerHanlder';

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
        case 'gpr':
            return new GprVisualizerHandler();
        default:
            return new VisualizerHandler();
    }
}
/**
 * Map used to store all the Nodes already created server side
 */
type SymbolsMap = Map<string, NodeHierarchy>;

export class NodesSingleton {
    private static instance: NodesSingleton;

    private symbolsMap: SymbolsMap = new Map();

    // Store the roots of all the graphs (the node that don't have parents)
    private rootNodes: NodeHierarchy[] = [];

    // The node that will be focused when updating the graph
    private focusedNode: NodeHierarchy | null = null;

    private constructor() {}

    public static get symbolsMap(): SymbolsMap {
        if (!NodesSingleton.instance) NodesSingleton.instance = new NodesSingleton();
        return NodesSingleton.instance.symbolsMap;
    }

    public static get rootNodes(): NodeHierarchy[] {
        if (!NodesSingleton.instance) NodesSingleton.instance = new NodesSingleton();
        return NodesSingleton.instance.rootNodes;
    }

    public static get focusedNode(): NodeHierarchy | null {
        if (!NodesSingleton.instance) NodesSingleton.instance = new NodesSingleton();
        return NodesSingleton.instance.focusedNode;
    }

    public static set focusedNode(focused: NodeHierarchy | null) {
        if (!NodesSingleton.instance) NodesSingleton.instance = new NodesSingleton();
        NodesSingleton.instance.focusedNode = focused;
    }

    /**
     * Helper function that either add the node to the symbolsMap and return it or return the one
     * from the Map if it already exists
     *
     * @param newNode - The node to add into the map.
     * @returns The same node or the one  already stored in the map.
     */
    public static insertSymbolsMap(newNode: NodeHierarchy) {
        const symbolsMap = NodesSingleton.symbolsMap;
        const node = symbolsMap.get(newNode.id);
        if (node !== undefined) return node;
        symbolsMap.set(newNode.id, newNode);
        return newNode;
    }

    /**
     * Find all the root of the graph (the nodes with no parents)
     *
     * Will also return nodes that are interconnected and not reachable by another root
     * (for example two node that each have the other as parent and child)
     *
     * @returns The array of root nodes.
     */
    public static findRoots() {
        const symbolsMap = NodesSingleton.symbolsMap;
        // Get all the node without parent as root
        const roots: NodeHierarchy[] = Array.from(symbolsMap.values()).filter(
            (node) => node.parents.length === 0,
        );
        const allNodes: Set<string> = new Set(symbolsMap.keys());

        for (const root of roots) {
            const queue: NodeHierarchy[] = [root];
            while (queue.length !== 0) {
                const node = queue.pop();
                if (!node) continue;
                if (!allNodes.has(node.id)) continue;

                allNodes.delete(node.id);
                queue.push(...node.children.map((child) => child.target));
            }
        }

        //The remaining ids in allNodes are roots that are inter-connected
        for (const id of allNodes) {
            const node = symbolsMap.get(id);
            if (node) roots.push(node);
        }
        this.instance.rootNodes = roots;
    }
}
/**
 * Create a NodeHierarchy object.
 *
 * @param hierarchyItem - A hierarchy item that can come from a TypeHierarchy or CallHierarchy.
 * @param hierarchy - The type of hierarchy needed.
 * @param languageId - The id of the language the symbol is in.
 * @param wantDeclarationLocation - Whether the location stored in the object should be the one
 * passed in hierarchyItem or the one in the declaration of the symbol.
 * @returns A new NodeHierarchy object.
 */
export async function createNodeHierarchy(
    hierarchyItem: VisualizerSymbol,
    hierarchy: Hierarchy,
    languageId: string,
    wantDeclarationLocation: boolean = true,
) {
    let range = hierarchyItem.location.range;

    // Expand the symlinks to avoid getting the same node twice with a different path.
    const realPath = fs.realpathSync(hierarchyItem.location.uri.fsPath);
    let uri = vscode.Uri.file(realPath);

    let hasParent: boolean | null = null;
    if (fs.existsSync(uri.fsPath)) {
        if (wantDeclarationLocation) {
            const decPosition = await vscode.commands.executeCommand<
                vscode.Location[] | vscode.LocationLink[]
            >('vscode.executeDeclarationProvider', uri, range.start);

            if (decPosition.length > 0) {
                if ('uri' in decPosition[0]) {
                    uri = decPosition[0].uri;
                    range = decPosition[0].range;
                } else {
                    uri = decPosition[0].targetUri;
                    if (decPosition[0].targetSelectionRange)
                        range = decPosition[0].targetSelectionRange;
                }
            }
        }
    } else hasParent = false;
    const position = `Ln ${range.start.line},` + `Col ${range.start.character}`;

    const location = new vscode.Location(uri, range);
    const handler = createHandler(languageId);

    return {
        //Node Data
        id: await handler.generateNodeId(location),
        label: hierarchyItem.name,
        kind: vscode.SymbolKind[hierarchyItem.kind].toLowerCase(),
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
export function convertHierarchyToData(nodeHierarchy: NodeHierarchy) {
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
 * Bind two node together as parent/child. Check if they are not already related.
 *
 * @param middleNode - The main node of the hierarchy.
 * @param otherNode - The node that will be bound to the middleNode.
 * @param direction - The direction in which to bind the nodes.
 * @param edgeType - The type of the edge that will link the middle node to the other node.
 */
export function bindNodes(
    middleNode: NodeHierarchy,
    otherNode: NodeHierarchy,
    direction: RelationDirection,
    edgeType: EdgeType,
) {
    const newNode = NodesSingleton.insertSymbolsMap(otherNode);
    if (direction === RelationDirection.SUB) {
        if (!middleNode.children.some((node) => node.target.id === newNode.id)) {
            middleNode.children.push({ target: newNode, edgeType: edgeType });
            middleNode.hasChildren = true;
        }
        if (!newNode.parents.some((node) => node.target.id === middleNode.id)) {
            newNode.parents.push({ target: middleNode, edgeType: edgeType });
            newNode.hasParent = true;
        }
    }
    // Only add recursive node when adding children
    else if (middleNode !== newNode) {
        if (!middleNode.parents.some((node) => node.target.id === newNode.id)) {
            middleNode.parents.push({ target: newNode, edgeType: edgeType });
            middleNode.hasParent = true;
        }
        if (!newNode.children.some((node) => node.target.id === middleNode.id)) {
            newNode.children.push({ target: middleNode, edgeType: edgeType });
            newNode.hasChildren = true;
        }
        // We check if we just created middleNode or it is a node created previously
        if (newNode === otherNode) newNode.expanded = true;
    }
}
