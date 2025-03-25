import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { Direction, Message, NodeEdge } from '../visualizerTypes';
import {
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    ReactFlow,
    Panel,
    ReactFlowProvider,
    addEdge,
    Controls,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './customNodes.css';
import 'vscode-webview';
import { edgeFactory, edgeTypes, floatingConnectionLine } from './customEdges';
import { nodeFactory, nodeTypes } from './customNodes';
import { elkOptions, layoutSubgraphs } from './layouting';

/**
 * Variables used to store the node state and access it in the rest of the program.
 */
let onNodesChange;
let onEdgesChange;
let nodes: Node[] = [];
let edges: Edge[] = [];
let setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
let setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;

/**
 * Current direction of the graph layout.
 */
export let currentDirection = Direction.RIGHT;

/**
 * Create a graph based on the JSON string passed as an arguments.
 *
 * @param messageData  - JSON string containing the data of all the nodes to display.
 */
async function handleHierarchy(messageData: string) {
    const data: NodeEdge = JSON.parse(messageData) as NodeEdge;
    const foldedNodes: Node[] = [];
    let subGraphNode: Node | undefined = undefined;

    // Remove all node that are not in the graph anymore (after a folding for example)
    nodes = nodes.filter((node) => data.nodesData.some((nodeData) => nodeData.id === node.data.id));

    data.nodesData.forEach((nodeData) => {
        const newNode = nodeFactory(0, 0, nodeData);
        const foundNode: Node | undefined = nodes.find((node) => node.id === newNode.id);
        // Only add node that does not already exists
        if (foundNode === undefined) {
            nodes.push(newNode);
            if (!newNode.data.expanded) foldedNodes.push(newNode);
        }
        // If the node to focus was already created we update it
        else if (newNode.data.focus) foundNode.data.focus = newNode.data.focus;
        if (foundNode !== undefined) {
            foundNode.data.expanded = newNode.data.expanded;
            if (!foundNode.data.expanded) foldedNodes.push(foundNode);
        }
    });

    data.edges.forEach(({ src, dst }) => {
        // addEdge checks if an edge src dst already exist.
        edges = addEdge(edgeFactory(src, dst), edges);
    });
    foldedNodes.forEach((node) => (edges = edges.filter((edge) => edge.source !== node.id)));

    const focusIndex = nodes.findIndex((node) => node.data.focus);
    if (focusIndex !== -1) nodes[focusIndex] = { ...nodes[focusIndex] };

    subGraphNode = nodes.find((node) => node.id === data.mainNodeId);
    // If more nodes where added, relayout the graph
    if (subGraphNode !== undefined && subGraphNode.data.expanded) {
        await layoutSubgraphs(subGraphNode, nodes, edges, currentDirection, elkOptions);
    }
    setEdges(edges);
    setNodes(nodes);
}

/**
 * Listener on the message from the server side.
 * This code is put outside the App function to register only one event listener.
 * The app function would create one on every re-render.
 */
window.addEventListener('message', (text: MessageEvent<Message>) => {
    switch (text.data.command) {
        case 'hierarchy': {
            void handleHierarchy(text.data.data);
            break;
        }
    }
});

/**
 * Main function that configure and render the graph.
 * @returns A div containing the react flow graph's viewPort.
 */
export default function App() {
    [nodes, setNodes, onNodesChange] = useNodesState(nodes);
    [edges, setEdges, onEdgesChange] = useEdgesState(edges);

    // Callback to relayout the graph
    const onLayout = React.useCallback(
        ({ direction = Direction.DOWN }): void => {
            currentDirection = direction;

            // await setCenter(x, y);
            // window.requestAnimationFrame(() => () => setCenter(x, y));
            // window.requestAnimationFrame(() => () => fitView());
            // void getLayoutedElements(nodes, edges, direction, elkOptions).then(
            // ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
            // setNodes(layoutedNodes);
            // setEdges(layoutedEdges);
            // },
            // );
        },
        [nodes, edges],
    );

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            {
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    fitView
                    nodeTypes={nodeTypes}
                    connectionLineComponent={floatingConnectionLine}
                    edgeTypes={edgeTypes}
                    panOnDrag
                    zoomOnScroll
                    maxZoom={4}
                    minZoom={0.1}
                >
                    <Panel position="top-right">
                        (
                        <button onClick={() => onLayout({ direction: Direction.DOWN })}>
                            vertical layout
                        </button>
                        <button onClick={() => onLayout({ direction: Direction.DOWN })}>
                            horizontal layout
                        </button>
                    </Panel>
                    <Controls />
                </ReactFlow>
            }
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ReactFlowProvider>
            <App />
        </ReactFlowProvider>
    </React.StrictMode>,
);
