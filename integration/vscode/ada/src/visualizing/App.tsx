import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { Direction, Message, NodeEdge } from '../visualizerTypes';
import {
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    Controls,
    ControlButton,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './customNodes.css';
import 'vscode-webview';
import { edgeFactory, edgeTypes, floatingConnectionLine } from './customEdges';
import { nodeFactory, nodeTypes } from './customNodes';
import { elkOptions, layoutSubgraph, layoutSubgraphs } from './layouting';

/**
 * Current direction of the graph layout.
 */
export let currentDirection = Direction.RIGHT;

/**
 * The vscode used to send message from the webView
 */
export const vscode = acquireVsCodeApi();

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
 * Create a graph based on the JSON string passed as an arguments.
 *
 * @param messageData  - JSON string containing the data of all the nodes to display.
 */
async function handleHierarchy(messageData: string) {
    const data: NodeEdge = JSON.parse(messageData) as NodeEdge;
    const foldedNodes: Node[] = [];
    let subGraphNode: Node | undefined = undefined;
    const numNodes = nodes.length;

    // Remove all node that are not in the graph anymore (after a folding for example)
    nodes = nodes.filter((node) => data.nodesData.some((nodeData) => nodeData.id === node.data.id));

    data.nodesData.forEach((nodeData) => {
        const newNode = nodeFactory(0, 0, nodeData, 250, 300);
        const foundNode: Node | undefined = nodes.find((node) => node.id === newNode.id);
        // Only add node that does not already exists
        if (foundNode === undefined) {
            nodes.push(newNode);
            if (!newNode.data.expanded) foldedNodes.push(newNode);
        } else {
            // If the node to focus was already created we update it
            if (newNode.data.focus) foundNode.data.focus = newNode.data.focus;
            // Set children and parent boolean to the current value state.
            foundNode.data.hasChildren = newNode.data.hasChildren;
            foundNode.data.hasParent = newNode.data.hasParent;
        }
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
    // Focus only if the number of nodes increased
    // Recreate the node to force an update
    if (focusIndex !== -1 && nodes.length > numNodes) nodes[focusIndex] = { ...nodes[focusIndex] };
    else if (focusIndex !== -1) nodes[focusIndex].data.focus = false;
    nodes = nodes.map((node) => {
        return { ...node };
    });

    subGraphNode = nodes.find((node) => node.id === data.mainNodeId);
    // Check if the was a change in the number of node and if the reference node for layouting
    //  exists and is expanded or was never layouted before
    if (
        nodes.length !== numNodes &&
        subGraphNode !== undefined &&
        (subGraphNode.data.expanded ||
            (subGraphNode.position.x === 0 && subGraphNode.position.y === 0))
    ) {
        await layoutSubgraph(subGraphNode, nodes, edges, currentDirection, elkOptions);
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
    const onLayout = React.useCallback(() => {
        currentDirection = currentDirection === Direction.RIGHT ? Direction.DOWN : Direction.RIGHT;

        void layoutSubgraphs(nodes, edges, currentDirection, elkOptions).then(() => {
            nodes = nodes.map((node) => {
                return { ...node };
            });
            setNodes(nodes);
            setEdges(edges);
        });
    }, [nodes, edges]);

    const onNodeDoubleClick = React.useCallback(
        (event: React.MouseEvent, node: Node) => {
            if ((event.target as Element).className.includes('hierarchy-button')) return;
            void event;
            vscode.postMessage({
                command: 'revealNode',
                data: node.id,
            });
        },
        [nodes],
    );

    const onNodeMouseEnter = React.useCallback((event: React.MouseEvent, node: Node) => {
        void event;
        edges = edges.map((edge) => {
            if (edge.target === node.id || edge.source === node.id) {
                edge.data = { additionalClass: 'highlight' };
                edge = { ...edge };
            }
            return edge;
        });
        setEdges(edges);
    }, []);

    const onNodeMouseLeave = React.useCallback((event: React.MouseEvent, node: Node) => {
        void event;
        edges = edges.map((edge) => {
            if (edge.target === node.id || edge.source === node.id) {
                edge.data = { additionalClass: undefined };
                edge = { ...edge };
            }
            return edge;
        });
        setEdges(edges);
    }, []);

    const minZoom = 0.1;
    const maxZoom = 4;

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
                    maxZoom={maxZoom}
                    minZoom={minZoom}
                    onNodeDoubleClick={onNodeDoubleClick}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                >
                    <Controls>
                        <ControlButton
                            className="codicon codicon-layout"
                            title="Layout the graph"
                            onClick={() => onLayout()}
                        />
                    </Controls>
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
