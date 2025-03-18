import { Edge, Node } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

export const elkOptions = {
    'elk.algorithm': 'layered',
    'elk.layered.spacing.nodeNodeBetweenLayers': '200',
    'elk.layered.spacing.edgeNodeBetweenLayers': '50',
    'elk.spacing.nodeNode': '300',
    'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',
    'elk.layered.layering.strategy': 'LONGEST_PATH',
    'elk.spacing.componentComponent': '300',
};

const elk = new ELK();

export const getLayoutedElements = async (
    nodes: Node[],
    edges: Edge[],
    direction: string = 'RIGHT',
    options = {},
) => {
    const isHorizontal = direction === 'RIGHT';
    // Convert current graph to ELK graph
    const graph: ElkNode = {
        id: 'root',
        layoutOptions: { 'elk.direction': direction, ...options },
        children: nodes.map((node) => ({
            ...node,
            'elk.position': {
                x: node.position.x,
                y: node.position.y,
            },

            width: 150,
            height: 50,
        })),
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
        })),
    };

    // Layout the ELK graph
    const layout = await elk.layout(graph);

    if (!layout || !layout.children) return { nodes: [], edges: [] };

    // Convert the ELK graph back to the original one with the new positions
    return {
        nodes: layout.children.map((node) => {
            const initialNode = nodes.find((n) => n.id === node.id);
            if (!initialNode) {
                throw new Error('Node not found');
            }
            return {
                ...initialNode,
                position: {
                    x: node.x,
                    y: node.y,
                },
                targetPosition: isHorizontal ? 'left' : 'top',
                sourcePosition: isHorizontal ? 'right' : 'bottom',
            } as Node;
        }),
        edges: (layout.edges ?? []).map((edge) => {
            const initialEdge = edges.find((e) => e.id === edge.id);
            if (!initialEdge) {
                throw new Error('Edge not found');
            }
            return {
                ...initialEdge,
                source: edge.sources[0],
                target: edge.targets[0],
            } as Edge;
        }),
    };
};
