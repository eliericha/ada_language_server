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
    ReactFlowProvider,
    addEdge,
    Controls,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './customNodes.css';
import 'vscode-webview';
import { edgeFactory, edgeTypes, floatingConnectionLine } from './customeEdges';
import { nodeFactory, nodeTypes } from './customNodes';
import { elkOptions, layoutSubgraphs } from './layouting';

let onNodesChange;
let onEdgesChange;
let nodes: Node[] = [];
let edges: Edge[] = [];
export let currentDirection = 'RIGHT';
let setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
let setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;

async function handleTypes(messageData: string) {
    const data: NodeEdge = JSON.parse(messageData) as NodeEdge;
    let subGraphNode: Node | undefined = undefined;

    // Remove all node that are not in the graph anymore (after a folding for example)
    nodes = nodes.filter((node) =>
        data.nodesData.some((nodeData) => nodeData.label === node.data.label),
    );

    data.nodesData.forEach((node) => {
        const newNode = nodeFactory(0, 0, node);
        const foundNode: Node | undefined = nodes.find((node) => node.id === newNode.id);
        // Only add node that does not already exists
        if (foundNode === undefined) {
            subGraphNode = newNode;
            nodes.push(newNode);
        }
        // If the node to focus was already created we update it
        else if (newNode.data.focus) foundNode.data.focus = newNode.data.focus;
    });

    data.edges.forEach(({ src, dst }) => {
        // addEdge checks if an edge src dst already exist
        edges = addEdge(edgeFactory(src, dst), edges);
    });

    const focusIndex = nodes.findIndex((node) => node.data.focus);
    if (focusIndex !== -1) nodes[focusIndex] = { ...nodes[focusIndex] };

    // If more nodes where added, relayout the graph
    if (subGraphNode !== undefined) {
        await layoutSubgraphs(subGraphNode, nodes, edges, currentDirection, elkOptions);
    }
    setEdges(edges);
    setNodes(nodes);
}

// This code is put outside the App function to register only one event listener
// The app function would create one on every re-render
window.addEventListener('message', (text: MessageEvent<Message>) => {
    switch (text.data.command) {
        case 'types': {
            void handleTypes(text.data.data);
            break;
        }
    }
});

// This function will be called multiple time (when re-rendering for example)
export default function App() {
    [nodes, setNodes, onNodesChange] = useNodesState(nodes);
    [edges, setEdges, onEdgesChange] = useEdgesState(edges);

    // Callback to relayout the graph
    const onLayout = React.useCallback(
        ({ direction = 'DOWN' }): void => {
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
                    onlyRenderVisibleElements={true}
                    nodeTypes={nodeTypes}
                    connectionLineComponent={floatingConnectionLine}
                    edgeTypes={edgeTypes}
                    panOnDrag
                    zoomOnScroll
                >
                    <Panel position="top-right">
                        (
                        <button onClick={() => onLayout({ direction: 'DOWN' })}>
                            vertical layout
                        </button>
                        <button onClick={() => onLayout({ direction: 'RIGHT' })}>
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
