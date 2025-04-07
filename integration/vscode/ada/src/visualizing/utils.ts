import { Node, Edge, EdgeMarker } from '@xyflow/react';
import { Hierarchy } from '../visualizerTypes';

/**
 * Helper function to return the type of Hierarchy needing to be called depending on the kind of
 * the node.
 * As vscode cannot be imported here, it can't be used to compare the kind parameter.
 *
 * @param kind - the symbol kind of a node.
 * @returns
 */
export function getNodeKind(kind: string) {
    if (kind === 'class' || kind === 'object' || kind === 'struct') return Hierarchy.TYPES;
    return Hierarchy.CALL;
}

export function changeMarker(edge: Edge, color: string, additionalClass: string | undefined) {
    edge.data = { additionalClass: additionalClass };

    if (edge.selected) return edge;
    // Recreate the marker to generate the right svg
    // (a marker can't be modified in place)
    if (edge.markerEnd && 'width' in (edge.markerEnd as EdgeMarker)) {
        edge.markerEnd = {
            ...(edge.markerEnd as EdgeMarker),
            color: color,
        };
        if (color.length === 0) delete edge.markerEnd.color;
    }
    if (edge.markerStart && 'width' in (edge.markerStart as EdgeMarker)) {
        edge.markerStart = {
            ...(edge.markerStart as EdgeMarker),
            color: color,
        };
        if (color.length === 0) delete edge.markerStart.color;
    }
    return { ...edge };
}
