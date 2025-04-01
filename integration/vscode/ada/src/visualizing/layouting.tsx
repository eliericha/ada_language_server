import { Edge, Node } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { BoundingBox, Direction, Subgraph } from '../visualizerTypes';
import { currentDirection } from './App';

export const elkOptions = {
    'elk.algorithm': 'mrtree',
    'elk.layered.spacing.nodeNodeBetweenLayers': '250',
    'elk.layered.spacing.edgeNodeBetweenLayers': '50',
    'elk.spacing.nodeNode': '300',
    'elk.spacing.componentComponent': '300',
    'elk.layered.layering.strategy': 'INTERACTIVE',
    'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
    'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
    'elk.layered.nodePlacement.strategy': 'INTERACTIVE',
};

const elk = new ELK();

/**
 * Layout a subgraph by converting all the nodes and edges to Elkjs' ones, calculating
 * their positions and then converting them back to their original types.
 *
 * @param subGraph - The subgraph to layout.
 * @param direction - The direction in which to layout the subgraph.
 * @param options - Elkjs options used to customize the layouting algorithm.
 * @returns A subgraph with the same nodes but with their positions updated.
 */
export const getLayoutedElements = async (
    subGraph: Subgraph,
    direction = Direction.RIGHT,
    options = {},
) => {
    const nodes = subGraph.nodes;
    const edges = subGraph.edges;
    const isHorizontal = direction === Direction.RIGHT;
    // Convert current graph to ELK graph
    const graph: ElkNode = {
        id: 'root',
        layoutOptions: { 'elk.direction': direction.toString(), ...options },
        children: nodes.map((node) => ({
            ...node,
            'elk.position': {
                x: node.position.x,
                y: node.position.y,
            },
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

/**
 * Extract all the nodes and edges forming a subgraph from the nodes and edges array, starting from
 * a specific node
 * This is a recursive function.
 *
 * @param node - The node that mark the subgraph to extract.
 * @param nodes - An array containing all the nodes not already part of any subgraphs.
 * @param edges - An array containing all the edges not already part of any subgraphs.
 * @param onlyChilds - If true only get the graph starting from node with all its childs,
 * if false return the whole subgraph
 */
function getSubGraph(node: Node, nodes: Node[], edges: Edge[], onlyChilds = false) {
    const subNodes: Node[] = [];
    const subEdges: Edge[] = [];
    const nodeQueue: Node[] = [];
    nodeQueue.push(node);
    while (nodeQueue.length !== 0) {
        const currentNode = nodeQueue.pop();
        if (!currentNode) break;

        subNodes.push(currentNode);
        if (!onlyChilds) nodes.splice(nodes.indexOf(currentNode), 1);

        const subEdge: Edge[] = edges.filter(
            (edge) =>
                (onlyChilds ? false : edge.target === currentNode.id) ||
                edge.source === currentNode.id,
        );
        subEdge.forEach((subEdge) => {
            if (!subEdges.some((edge) => edge.id === subEdge.id)) {
                subEdges.push(subEdge);
                if (!onlyChilds) edges.splice(edges.indexOf(subEdge), 1);
            }
        });
        for (const edge of subEdges) {
            const otherId: string = edge.source === currentNode.id ? edge.target : edge.source;
            if (!subNodes.some((node) => node.id === otherId)) {
                const otherNode = nodes.find((node) => node.id === otherId);
                if (otherNode !== undefined) {
                    nodeQueue.push(otherNode);
                    // getSubGraph(otherNode, subNodes, subEdges, nodes, edges);
                }
            }
        }
    }
    return { nodes: subNodes, edges: subEdges } as Subgraph;
}

/**
 * Sort all the nodes and edges into subgraphs
 *
 * @param nodes - An array containing all the nodes from the graph.
 * @param edges - An array containing all the edges from the edges.
 * @returns An array containing all the subgraphs.
 */
function getSubGraphs(nodes: Node[], edges: Edge[]) {
    const subgraphs: Subgraph[] = [];
    while (nodes.length != 0) {
        subgraphs.push(getSubGraph(nodes[0], nodes, edges));
    }
    return subgraphs;
}

/**
 * Concatenate the subgraphs back to their original node array and edge array
 *
 * @param subGraphs - The array containing all the subgraphs.
 * @param nodes - The original nodes array.
 * @param edges - The original edges array.
 */
function concatSubgraphs(subGraphs: Subgraph[], nodes: Node[], edges: Edge[]) {
    subGraphs.forEach((subGraph) => {
        nodes.push(...subGraph.nodes);
        edges.push(...subGraph.edges);
    });
    return { nodes: nodes, edges: edges } as Subgraph;
}

/**
 * Get the smallest box containing all the nodes of a subgraph
 *
 * @param nodes - The array of all the nodes contained in the subgraph.
 * @returns The position and size of smallest box containing the subgraph.
 */
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

/**
 * Helper function to check if the current subgraph is overlapping
 * with any other subgraphs.
 *

 * @param y - The y position of the subgraph.
 * @param width - The width of the subgraph.
 * @param height - The height of the subgraph.
 * @param existingBoxes - The array of all the other subgraphs' boxes.
 * @param step - Distance between to overlapping check.
 * @returns True if the subgraph does not overlap with any other subgraphs else False.
 */
function isOverlapping(
    x: number,
    y: number,
    width: number,
    height: number,
    existingBoxes: BoundingBox[],
    padding: number,
) {
    return existingBoxes.some(
        (box) =>
            !(
                x + width < box.minX - padding ||
                y + height < box.minY - padding ||
                x > box.maxX + padding ||
                y > box.maxY + padding
            ),
    );
}

/**
 * Find a position for a subgraph with no overlapping with any other subgraphs.
 *
 * @param subBox - The subgraph's box that is being layouted
 * @param existingBoxes - All the other subgraphs' boxes
 * @param padding - Additional distance added to avoid the subgraphs being to
 * close from one another.
 * @param step - Distance between to overlapping check.
 * @returns
 */
function findNonOverlappingPosition(
    subBox: BoundingBox,
    existingBoxes: BoundingBox[],
    padding = 150,
    step = 50,
) {
    let newX = subBox.minX;
    let newY = subBox.minY;
    let numberOfStep = 1;
    let stepX = currentDirection === Direction.RIGHT ? 0 : step;
    let stepY = currentDirection === Direction.RIGHT ? -step : 0;

    let overlap = isOverlapping(newX, newY, subBox.width, subBox.height, existingBoxes, padding);
    //Spiral around the current location of the subGraph to find the closest location that fits it.
    while (overlap) {
        // Every two direction change make 1 more step before changing direction
        for (let c = 0; c < 2; c++) {
            for (let i = 0; i < numberOfStep; i++) {
                newX += stepX;
                newY += stepY;
                overlap = isOverlapping(
                    newX,
                    newY,
                    subBox.width,
                    subBox.height,
                    existingBoxes,
                    padding,
                );
                if (!overlap) break;
            }
            // Rotate the coordinates between [step, 0], [0, step], [-step, 0], [0, -step]
            [stepX, stepY] = [-stepY, stepX];
        }
        numberOfStep++;
    }

    return { x: newX, y: newY };
}

/**
 * Extract the subgraph currNode is part of, layout it, place it somewhere with no overlapping.
 * This function change nodes and edges in place.
 *
 * @param currNode - The node from which will be extracted the subgraph that will be layouted.
 * @param nodes - The array of all the nodes of the graph.
 * @param edges - The array of all the edges of the graph.
 * @param direction - The direction in which to layout the graph.
 * @param options - Elkjs option used to customize how the layout is done.
 */
export async function layoutSubgraph(
    currNode: Node,
    nodes: Node[],
    edges: Edge[],
    direction = Direction.RIGHT,
    options = {},
) {
    const subGraphs: Subgraph[] = getSubGraphs(nodes, edges);

    const currSubGraph = subGraphs.find((subGraph) =>
        subGraph.nodes.find((node) => currNode.id === node.id),
    );
    if (currSubGraph === undefined) return;
    subGraphs.splice(subGraphs.indexOf(currSubGraph), 1);

    const allBoxes = subGraphs.map((subGraph) => getBoundingBox(subGraph.nodes));

    const { x: xpos, y: ypos } = currNode.position;
    const currLayoutedSubGraph = await getLayoutedElements(currSubGraph, direction, options);

    const currBox = getBoundingBox(currSubGraph.nodes);
    const layoutedCurrNode = currLayoutedSubGraph.nodes.find((node) => node.id === currNode.id);
    if (layoutedCurrNode !== undefined) {
        const xDiff = xpos - layoutedCurrNode.position.x;
        const yDiff = ypos - layoutedCurrNode.position.y;
        currLayoutedSubGraph.nodes.forEach((node) => {
            node.position.x += xDiff;
            node.position.y += yDiff;
        });
    }
    const newPosition = findNonOverlappingPosition(currBox, allBoxes);
    currLayoutedSubGraph.nodes = currLayoutedSubGraph.nodes.map((node) => ({
        ...node,
        position: {
            x: node.position.x + (newPosition.x - currBox.minX),
            y: node.position.y + (newPosition.y - currBox.minY),
        },
    }));
    subGraphs.push(currLayoutedSubGraph);
    concatSubgraphs(subGraphs, nodes, edges);
}

export async function layoutSubgraphs(
    nodes: Node[],
    edges: Edge[],
    direction = Direction.RIGHT,
    options = {},
) {
    const subgraphs: Subgraph[] = getSubGraphs(nodes, edges);
    const layoutedSubGraphs: Subgraph[] = [];
    for (const subgraph of subgraphs) {
        const layoutedSubGraph = await getLayoutedElements(subgraph, direction, options);
        const allBoxes = layoutedSubGraphs.map((layouted) => getBoundingBox(layouted.nodes));
        const currBox = getBoundingBox(layoutedSubGraph.nodes);
        const newPosition = findNonOverlappingPosition(currBox, allBoxes);
        layoutedSubGraph.nodes.forEach((node) => {
            node.position = {
                x: node.position.x + (newPosition.x - currBox.minX),
                y: node.position.y + (newPosition.y - currBox.minY),
            };
        });
        layoutedSubGraphs.push(layoutedSubGraph);
    }
    concatSubgraphs(layoutedSubGraphs, nodes, edges);
}
