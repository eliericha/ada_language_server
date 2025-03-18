import { CSSProperties } from 'react';
import * as vscode from 'vscode';

export type Message = {
    command: string;
    data: string;
};

export type NodeData = {
    label: string;
    location: { path: string; range: Array<vscode.Position> };
    kind: string;
    edges: Set<DirectedEdge>;
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

export type SymbolsMap = Map<string, NodeData>;

export enum RelationDirection {
    Out,
    In,
    Both,
}

export type RequestHierarchy = {
    location: { path: string; range: Array<vscode.Position> };
    direction: RelationDirection;
};
