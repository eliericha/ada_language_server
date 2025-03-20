import { Node, Edge } from '@xyflow/react';
import { CSSProperties } from 'react';
import * as vscode from 'vscode';

export type Message = {
    command: string;
    data: string;
};

export type NodeData = {
    label: string;
    kind: string;
    expanded: boolean;
    hasParent: boolean;
    focus: boolean;
};

export type NodeHierarchy = NodeData & {
    location: vscode.Location;
    parent: NodeHierarchy | null;
    childrens: NodeHierarchy[];
};

export type NodeEdge = {
    nodesData: NodeData[];
    edges: DirectedEdge[];
};

export type DirectedEdge = { src: string; dst: string; edgeDirection: RelationDirection };

export type FloatingEdge = {
    id: string;
    source: string;
    target: string;
    style?: CSSProperties;
    markerEnd?: string;
    markerStart?: string;
};

export type BoundingBox = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
};

export type Subgraph = {
    nodes: Node[];
    edges: Edge[];
};

export type SymbolsMap = Map<string, NodeHierarchy>;

export enum RelationDirection {
    Super,
    Sub,
    Both,
}

export type RequestMessage = {
    label: string;
    direction: RelationDirection;
    expand: boolean;
};
