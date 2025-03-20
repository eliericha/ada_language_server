import { Edge, Node } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { BoundingBox, Subgraph } from '../vizualizerTypes';
import { currentDirection } from './App';

export const elkOptions = {
    'elk.algorithm': 'mrtree',
    'elk.layered.spacing.nodeNodeBetweenLayers': '250',
    'elk.layered.spacing.edgeNodeBetweenLayers': '50',
    'elk.spacing.nodeNode': '300',
    // 'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',
    // 'elk.layered.layering.strategy': 'LONGEST_PATH',
    'elk.spacing.componentComponent': '300',
    'elk.layered.layering.strategy': 'INTERACTIVE',
    'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
    'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
    'elk.layered.nodePlacement.strategy': 'INTERACTIVE',
};

const elk = new ELK();

export const getLayoutedElements = async (
    subGraph: Subgraph,
    direction: string = 'RIGHT',
    options = {},
) => {
    const nodes = subGraph.nodes;
    const edges = subGraph.edges;
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

    if (!layout || !layout.children) return { nodes: [], edges: [] } as Subgraph;

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
    } as Subgraph;
};

// Extract a subgraph (all nodes that are linked together) from the node array
function getSubGraph(node: Node, subNodes: Node[], subEdges: Edge[], nodes: Node[], edges: Edge[]) {
    subNodes.push(node);
    nodes.splice(nodes.indexOf(node), 1);
    const subEdge: Edge[] = edges.filter(
        (edge) => edge.target === node.id || edge.source === node.id,
    );
    subEdge.forEach((subEdge) => {
        if (!subEdges.some((edge) => edge.id === subEdge.id)) {
            subEdges.push(subEdge);
            edges.splice(edges.indexOf(subEdge), 1);
        }
    });
    for (const edge of subEdges) {
        const otherId: string = edge.source === node.id ? edge.target : edge.source;
        if (!subNodes.some((node) => node.id === otherId)) {
            const otherNode = nodes.find((node) => node.id === otherId);
            if (otherNode !== undefined) {
                getSubGraph(otherNode, subNodes, subEdges, nodes, edges);
            }
        }
    }
}

// Extract all subgraphs from a node array
function getSubGraphs(nodes: Node[], edges: Edge[]) {
    const subgraphs: Subgraph[] = [];
    while (nodes.length != 0) {
        const subNodes: Node[] = [];
        const subEdges: Edge[] = [];
        getSubGraph(nodes[0], subNodes, subEdges, nodes, edges);
        subgraphs.push({ nodes: subNodes, edges: subEdges });
    }
    return subgraphs;
}

// Concatenate the subgraphs back to a node array
function concatSubgraphs(subGraphs: Subgraph[], nodes: Node[], edges: Edge[]) {
    subGraphs.forEach((subGraph) => {
        nodes.push(...subGraph.nodes);
        edges.push(...subGraph.edges);
    });
    return { nodes: nodes, edges: edges } as Subgraph;
}

// Get the smallest box containing all the node of a subgraph
function getBoundingBox(nodes: Node[]) {
    const xs = nodes.map((node) => node.position.x);
    const ys = nodes.map((node) => node.position.y);
    const nodeWidth = nodes[0].width ?? 0;
    const nodeHeight = nodes[0].height ?? 0;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + nodeWidth;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + nodeHeight;
    return {
        minX: minX,
        maxX: maxX,
        minY: minY,
        maxY: maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

// Find a position for a subgraph with no overlapping with any other one
function findNonOverlappingPosition(
    subgraphBox: BoundingBox,
    existingBoxes: BoundingBox[],
    padding = 50,
) {
    let newX = subgraphBox.minX;
    let newY = subgraphBox.minY;

    let overlap = true;
    while (overlap) {
        overlap = false;
        for (const box of existingBoxes) {
            if (
                newX < box.maxX + padding &&
                newX + subgraphBox.width > box.minX - padding &&
                newY < box.maxY + padding &&
                newY + subgraphBox.height > box.minY - padding
            ) {
                if (currentDirection === 'RIGHT') newY = box.maxY + padding;
                else newX = box.maxX + padding;
                overlap = true;
                break;
            }
        }
    }
    return { x: newX, y: newY };
}

// Extract the subgraph currNode is part of, layout it, place it somewhere with no overlapping
// and return all nodes
export async function layoutSubgraphs(
    currNode: Node,
    nodes: Node[],
    edges: Edge[],
    direction = 'RIGHT',
    options = {},
) {
    const subGraphs: Subgraph[] = getSubGraphs(nodes, edges);

    let currSubGraph = subGraphs.find((subGraph) =>
        subGraph.nodes.find((node) => currNode.id === node.id),
    );
    if (currSubGraph === undefined) return;
    subGraphs.splice(subGraphs.indexOf(currSubGraph), 1);
    currSubGraph = await getLayoutedElements(currSubGraph, direction, options);

    const allBoxes = subGraphs.map((subGraph) => getBoundingBox(subGraph.nodes));
    const currBox = getBoundingBox(currSubGraph.nodes);
    const newPosition = findNonOverlappingPosition(currBox, allBoxes);
    currSubGraph.nodes = currSubGraph.nodes.map((node) => ({
        ...node,
        position: {
            x: node.position.x + (newPosition.x - currBox.minX),
            y: node.position.y + (newPosition.y - currBox.minY),
        },
    }));
    subGraphs.push(currSubGraph);
    concatSubgraphs(subGraphs, nodes, edges);
}
