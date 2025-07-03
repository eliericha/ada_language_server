import * as vscode from 'vscode';
import { VisualizerHandler } from './alsVisualizerProvider';

type MessageCommand =
    // Sent from Client Side
    | 'requestHierarchy'
    | 'revealNode'
    | 'revealReferences'
    | 'revealLocation'
    | 'deleteNodes'
    | 'refreshNodes'
    | 'stopProcess'
    | 'isRendered'
    | 'canSendNextData'

    // Sent from Server Side
    | 'rendered'
    | 'hierarchy'
    | 'updateNodes'
    | 'revealResponse';

/**
 * The base format of all message exchanged between server side and client side.
 */
export type Message = {
    command: MessageCommand;
    data:
        | string
        | HierarchyMessage
        | NodeIdsMessage
        | UpdateMessage
        | RevealMessage
        | RevealReferencesMessage
        | RevealReferencesResponse
        | StringLocation
        | NodeEdge;
};

/**
 * Message sent from the client to the server side to request for new
 * node up or down from the hierarchy.
 */
export type HierarchyMessage = {
    id: string;
    direction: RelationDirection;
    expand: boolean;
    hierarchy: Hierarchy;
    recursive: boolean;
};

/**
 * Message use to apply function like delete or refresh to multiple node at once.
 * The recursive field is used to apply the function to all children of the node (for delete).
 */
export type NodeIdsMessage = {
    nodesId: string[];
    recursive: boolean;
};

/**
 * Message send from the server to the client to indicate which node to remove and which
 * node to update.
 */
export type UpdateMessage = {
    toUpdate: NodeData[];
    toDelete: NodeData[];
};

/**
 * Message sent to ask the server to reveal a symbol location in the code.
 */
export type RevealMessage = {
    nodeId: string;
    gotoImplementation: boolean;
};

/**
 * Represent the location of a symbol in a file.
 */
export type StringLocation = {
    path: string;
    range_start: vscode.Position;
    range_end: vscode.Position;
    string_location: string;
};

/**
 * Message sent to the server to get all the references of targetNode in referenceNode.
 * The server will then respond with a RevealReferenceResponse.
 */
export type RevealReferencesMessage = {
    targetNodeId: string;
    referenceNodeId: string;
};

/** Message sent to the client in response to a RevealReferencesMessage.
 * The server sends a mapping of location name associated with all the references of the required
 * symbol.
 */
export type RevealReferencesResponse = {
    locationsKeys: string[];
    locationsValues: StringLocation[][];
};

/**
 * Request send to the ALS for the als_show_dependencies request.
 */
export type ALS_ShowDependenciesParams = {
    uri: string /* The queried unit */;
    kind: ALS_ShowDependenciesKind /* The dependencies query kind */;
    showImplicit: boolean /* True if implicit dependencies should be returned */;
};

/**
 * Request sent from the als in response to an als_show_dependencies request.
 */
export type ALS_Unit_Description = {
    uri: string /* The dependency unit's file */;
    projectUri: string /* The dependency's project file */;
};

/**
 * Request sent from the als in response to an als_gpr_dependencies request.
 */
export type ALS_GprDependencyItem = {
    uri: string;
    kind: ALS_GprDependencyKind;
};

/**
 * Request sent from the als in response to an als_gpr_dependencies request.
 */
export type ALS_GprDependencyParam = {
    uri: string;
    direction: ALS_GprDependencyDirection;
};

/**
 * Describe a relation between a parent of this object and the target by specifying the
 * type of edge to display
 */
export type Relation = {
    target: NodeHierarchy;
    edgeType: EdgeType;
};

/**
 * Data stored in a node client side.
 */
export type NodeData = {
    // The id of the node.
    id: string;
    // The name of the symbol represented by the node.
    label: string;
    // The kind of symbol this node represent.
    kind: string;
    // A boolean indicating if this now is showing his child or not.
    expanded: boolean;
    // A boolean indicating if this node has parents or not (null means not checked yet).
    hasParent: boolean | null;
    // A boolean indicating if this node has children or not (null means not checked yet).
    hasChildren: boolean | null;
    // A boolean indicating if the node must be focused in the graph.
    focus: boolean;
    // Boolean indicating if the symbol is located in the project or in the runtime.
    inProject: boolean;
    // The symbol position in the project as a string.
    string_location: {
        path: string;
        position: string;
    };

    // A temporary position used to allow the node to slide from its parents to its real position.
    newPosition:
        | undefined
        | {
              x: number;
              y: number;
          };

    // Indicate if its a type hierarchy or a call hierarchy.
    hierarchy: Hierarchy;
};

/**
 * Data stored in a node server side.
 */
export type NodeHierarchy = NodeData & {
    // The symbol location in the project (this structure is not well json formatted so it is stored
    // only on the 'server side').
    location: vscode.Location;
    // The array of parents relations.
    parents: Relation[];
    // The array of children relations.
    children: Relation[];
    // The language the symbol is from.
    languageId: string;
    // The object tasked to handle the language specific  operation (idGeneration, ...).
    handler: VisualizerHandler;
};

/**
 * Contain all the nodes and edge that will be displayed on the viewPort.
 */
export type NodeEdge = {
    nodesData: NodeData[];
    edges: DirectedEdge[];
    focus: boolean;
    mainNodeId: string;
};

/**
 * Represent a directed edge.
 */
export type DirectedEdge = {
    src: string;
    dst: string;
    edgeDirection: RelationDirection;
    edgeType: EdgeType;
};

/**
 * Describe the minimal data necessary to get from an lsp to create a node.
 */
export type VisualizerSymbol = {
    name: string;
    location: vscode.Location;
    kind: vscode.SymbolKind;
};

/**
 * Indicate the direction of the hierarchy call to make.
 */
export enum RelationDirection {
    SUPER,
    SUB,
    BOTH,
}

/**
 * Store the four usual direction.
 */
export enum Direction {
    LEFT = 'LEFT',
    UP = 'UP',
    RIGHT = 'RIGHT',
    DOWN = 'DOWN',
}

/**
 * The type of hierarchy that can be called.
 */
export enum Hierarchy {
    TYPE,
    CALL,
    FILE,
    GPR,
}

/**
 * The type of an edge, which will change its appearance.
 */
export enum EdgeType {
    REGULAR,
    DOTTED,
    BOXED,
    TEMPORARY,
}

/**
 * The type of the node, which will change its appearance.
 */
export enum NodeType {
    REGULAR,
    GROUP,
}

/**
 * Store the values used for als_show_dependency.
 */
export enum ALS_ShowDependenciesKind {
    SHOW_IMPORTED = 1,
    SHOW_IMPORTING = 2,
}

/**
 * Store the values used for als_show_dependency.
 */
export enum ALS_GprDependencyDirection {
    SHOW_DEPENDENT = 1, // SUB
    SHOW_DEPENDING = 2, // SUPER
}

/**
 * Store the dependency kind two gpr files can have.
 */
export enum ALS_GprDependencyKind {
    AGGREGATED,
    EXTENDED,
    EXTENDING,
    IMPORTED,
}
