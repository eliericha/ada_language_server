import * as vscode from 'vscode';
import { VisualizerHandler } from './alsVisualizerProvider';

/**
 * The base format of all message exchanged between server side and client side.
 */
export type Message = {
    command: string;
    data: string;
};

/**
 * Message sended from the client to the server side to request for new
 * node up or down from the hierarchy.
 */
export type HierarchyMessage = {
    id: string;
    direction: RelationDirection;
    expand: boolean;
    hierarchy: Hierarchy;
};

export type NodeIdsMessage = {
    nodesId: string[];
};

export type UpdateMessage = {
    toUpdate: NodeData[];
    toDelete: NodeData[];
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
    // The symbol position in the project as a string
    string_location: {
        path: string;
        position: string;
    };
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
    // only on the 'server side')
    location: vscode.Location;
    // The array of parents nodes.
    parents: NodeHierarchy[];
    // The array of children nodes.
    children: NodeHierarchy[];
    // The language the symbol is from.
    languageId: string;
    // The object tasked to handle the language specific  operation (idGeneration, ...)
    handler: VisualizerHandler;
};

/**
 * Contain all the nodes and edge that will be displayed on the viewPort.
 */
export type NodeEdge = {
    nodesData: NodeData[];
    edges: DirectedEdge[];
    mainNodeId: string;
};

/**
 * Represent a directed edge.
 */
export type DirectedEdge = { src: string; dst: string; edgeDirection: RelationDirection };

/**
 * Indicate the direction of the hierarchy call to make.
 */
export enum RelationDirection {
    SUPER,
    SUB,
    BOTH,
}

/**
 * Store the four usual direction
 */
export enum Direction {
    LEFT = 'LEFT',
    UP = 'UP',
    RIGHT = 'RIGHT',
    DOWN = 'DOWN',
}

/**
 * The type of hierarchy that can be called
 */
export enum Hierarchy {
    TYPES,
    CALL,
}
