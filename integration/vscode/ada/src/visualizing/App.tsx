import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { Message, NodeEdge } from '../vizualizerTypes';
import {
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    ReactFlow,
    Panel,
    useReactFlow,
    ReactFlowProvider,
    MiniMap,
    addEdge,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './customNodes.css';
import 'vscode-webview';
import { edgeFactory, edgeTypes, floatingConnectionLine } from './customeEdges';
import { nodeFactory, nodeTypes } from './customNodes';
import { elkOptions, getLayoutedElements } from './layouting';

// const vscode = acquireVsCodeApi();

let onNodesChange;
let onEdgesChange;
let nodes: Node[] = [];
let edges: Edge[] = [];
let currentDirection = 'RIGHT';
let setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
let setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;

function handleTypes(messageData: string) {
    const data: NodeEdge = JSON.parse(messageData) as NodeEdge;
    const nodeSize = nodes.length;
    const edgeSize = edges.length;

    data.nodesData.forEach((node) => {
        const newNode = nodeFactory(0, 0, node);
        if (!nodes.some((node) => node.id === newNode.id)) nodes.push(newNode);
    });

    data.edges.forEach(({ src, dst, edgeDirection }) => {
        const newEdge: Edge = edgeFactory(src, dst, edgeDirection);
        // Check if an inverted edge already exist
        // (the test for the regular edge is done in add edge)
        if (!edges.some((e) => e.source == newEdge.target && e.target == newEdge.source))
            edges = addEdge(newEdge, edges);
    });

    // If more nodes where added, relayout the graph
    if (nodes.length != nodeSize)
        void getLayoutedElements(nodes, edges, currentDirection, elkOptions).then(
            ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
            },
        );
    // If only edges where added, just add those edge without relayouting
    else if (edges.length != edgeSize) setEdges(edges);
}

// This code is put outside the App function to register only one event listener
// The app function would create one on every re-render
window.addEventListener('message', (text: MessageEvent<Message>) => {
    switch (text.data.command) {
        case 'types': {
            handleTypes(text.data.data);
            break;
        }
    }
});

// This function will be called multiple time (when re-rendering for example)
export default function App() {
    [nodes, setNodes, onNodesChange] = useNodesState(nodes);
    [edges, setEdges, onEdgesChange] = useEdgesState(edges);
    const { fitView } = useReactFlow();

    // Callback to relayout the graph
    const onLayout = React.useCallback(
        ({ direction = 'DOWN' }) => {
            currentDirection = direction;
            void getLayoutedElements(nodes, edges, direction, elkOptions).then(
                ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
                    setNodes(layoutedNodes);
                    setEdges(layoutedEdges);
                    window.requestAnimationFrame(() => () => fitView());
                },
            );
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
                >
                    <Panel position="top-right">
                        <button onClick={() => onLayout({ direction: 'DOWN' })}>
                            vertical layout
                        </button>
                        <button onClick={() => onLayout({ direction: 'RIGHT' })}>
                            horizontal layout
                        </button>
                        <input id="inputField"></input>
                    </Panel>
                    <MiniMap></MiniMap>
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
