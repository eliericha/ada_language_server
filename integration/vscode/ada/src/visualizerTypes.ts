import { Node, Edge } from '@xyflow/react';
import * as vscode from 'vscode';

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

/**
 * Data stored in a node client side.
 */
export type NodeData = {
    id: string;
    label: string;
    kind: string;
    expanded: boolean;
    // Null means non checked here
    hasParent: boolean | null;
    hasChildren: boolean | null;
    focus: boolean;
    string_location: {
        path: string;
        position: string;
    };
    hierarchy: Hierarchy;
};

/**
 * Data stored in a node server side.
 */
export type NodeHierarchy = NodeData & {
    location: vscode.Location;
    parents: NodeHierarchy[];
    childs: NodeHierarchy[];
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
 * Represent the smallest box that can contain all the node of a subgraph.
 */
export type BoundingBox = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
};

/**
 * Represent a subgraph.
 */
export type Subgraph = {
    nodes: Node[];
    edges: Edge[];
};

/**
 * Map used to store all the Nodes already created server side
 */
export type SymbolsMap = Map<string, NodeHierarchy>;

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
