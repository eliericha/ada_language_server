import {
    getBezierPath,
    Position,
    useInternalNode,
    XYPosition,
    InternalNode,
    Node,
    MarkerType,
    Edge,
} from '@xyflow/react';

import { FloatingEdge } from '../vizualizerTypes';
import React from 'react';

export const edgeTypes = {
    floating: floatingEdge,
};

export function edgeFactory(src: string, dst: string) {
    return {
        id: 'e' + src + '-' + dst,
        source: src,
        target: dst,
        type: 'floating',
        markerEnd: { height: 15, width: 15, type: MarkerType.Arrow },
        style: { strokeWidth: 2 },
    } as Edge;
}

//Get the intersection point between the edge (center intersectionNode -> targetNode)
// and the outer border of the intersection Node.
// Used to determine where to place the negining of the edge for a better visual.
function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
    const mesure = intersectionNode.measured;
    const intersectionNodePosition = intersectionNode.internals.positionAbsolute;
    const targetPosition = targetNode.internals.positionAbsolute;

    // This should never be true but it is needed to remove undefined type from the variables
    if (
        mesure?.width === undefined ||
        mesure.height === undefined ||
        targetNode.measured.width === undefined ||
        targetNode.measured.height === undefined
    )
        return;

    // The algorithm is more precisly explained here
    // https://math.stackexchange.com/questions/1724792/an-algorithm-for-finding-the-intersection-point-between-a-center-of-vision-and-a
    const w = mesure.width / 2;
    const h = mesure.height / 2;

    const x2 = intersectionNodePosition.x + w;
    const y2 = intersectionNodePosition.y + h;
    const x1 = targetPosition.x + targetNode.measured.width / 2;
    const y1 = targetPosition.y + targetNode.measured.height / 2;

    const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
    const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
    const a = 1 / (Math.abs(xx1) + Math.abs(yy1));
    const xx3 = a * xx1;
    const yy3 = a * yy1;
    const x = w * (xx3 + yy3) + x2;
    const y = h * (-xx3 + yy3) + y2;

    return { x, y };
}

// Returns the position of the intersectionPoint compared to the node
function getEdgePosition(node: InternalNode, intersectionPoint: XYPosition) {
    const n = { ...node.internals.positionAbsolute, ...node };
    if (n.measured.width === undefined || n.measured.height === undefined) return;

    const nx = Math.round(n.x);
    const ny = Math.round(n.y);
    const px = Math.round(intersectionPoint.x);
    const py = Math.round(intersectionPoint.y);

    if (px <= nx + 1) {
        return Position.Left;
    }
    if (px >= nx + n.measured.width - 1) {
        return Position.Right;
    }
    if (py <= ny + 1) {
        return Position.Top;
    }
    if (py >= n.y + n.measured.height - 1) {
        return Position.Bottom;
    }

    return Position.Top;
}

// Returns the parameters that will create the edge
function getEdgeParams(source: InternalNode, target: InternalNode) {
    const sourceIntersectionPoint: XYPosition | undefined = getNodeIntersection(source, target);
    const targetIntersectionPoint: XYPosition | undefined = getNodeIntersection(target, source);

    if (sourceIntersectionPoint === undefined || targetIntersectionPoint === undefined) return;

    const sourcePos = getEdgePosition(source, sourceIntersectionPoint);
    const targetPos = getEdgePosition(target, targetIntersectionPoint);

    return {
        sx: sourceIntersectionPoint.x,
        sy: sourceIntersectionPoint.y,
        tx: targetIntersectionPoint.x,
        ty: targetIntersectionPoint.y,
        sourcePos,
        targetPos,
    };
}

// Custom edge fonction, calculate and create the position of hte edge between two nodes
export function floatingEdge({ id, source, target, style, markerEnd, markerStart }: FloatingEdge) {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);

    // If an internal node is not defined just return an empty path
    if (!sourceNode || !targetNode) {
        return <path />;
    }

    const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode) ?? {};

    // If an edge param is not defined just return an empty path
    if (sx === undefined || sy === undefined || tx === undefined || ty === undefined) {
        return <path />;
    }

    const [edgePath] = getBezierPath({
        sourceX: sx,
        sourceY: sy,
        sourcePosition: sourcePos,
        targetPosition: targetPos,
        targetX: tx,
        targetY: ty,
    });

    // If bezier path returned nan return empty path
    if (edgePath.includes('NaN')) return <path />;
    return (
        <path
            id={id}
            className="react-flow__edge-path"
            d={edgePath}
            style={style}
            markerStart={markerStart}
            markerEnd={markerEnd}
        />
    );
}

type FloatingConnectionLine = {
    toX: number;
    toY: number;
    fromPosition: Position;
    toPosition: Position;
    fromNode: InternalNode;
};

// Create the line part of the edge
export function floatingConnectionLine({
    toX,
    toY,
    fromPosition,
    toPosition,
    fromNode,
}: FloatingConnectionLine) {
    if (!fromNode) {
        return null;
    }

    const [edgePath] = getBezierPath({
        sourceX: fromNode.position.x,
        sourceY: fromNode.position.y,
        sourcePosition: fromPosition,
        targetPosition: toPosition,
        targetX: toX,
        targetY: toY,
    });

    return (
        <g>
            <path fill="none" stroke="#222" strokeWidth={1.5} className="animated" d={edgePath} />
            <circle cx={toX} cy={toY} fill="#fff" r={3} stroke="#222" strokeWidth={1.5} />
        </g>
    );
}
