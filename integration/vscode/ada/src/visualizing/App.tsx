import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { DeleteMessage, Direction, Message, NodeEdge, UpdateMessage } from '../visualizerTypes';
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
    getOutgoers,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './customNodes.css';
import 'vscode-webview';
import { edgeFactory, edgeTypes, floatingConnectionLine } from './customEdges';
import { nodeFactory, nodeTypes } from './customNodes';
import { elkOptions, layoutSubgraph, layoutSubgraphs } from './layouting';
import { changeMarker } from './utils';
import { ContextMenu, ContextMenuProps } from './contextMenu';

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

function handleUpdate(messageData: string) {
    const data: UpdateMessage = JSON.parse(messageData) as UpdateMessage;
    for (const node of data.nodes) {
        const index = nodes.findIndex((searchNode) => node.id === searchNode.id);
        if (index === -1) continue;
        const originalNode = nodes[index];
        nodes[index] = {
            ...originalNode,
            data: node,
        };
    }
    nodes = [...nodes];
    setNodes(nodes);
}

const handleMessage = (text: MessageEvent<Message>) => {
    switch (text.data.command) {
        case 'hierarchy': {
            void handleHierarchy(text.data.data);
            break;
        }
        case 'updateNodes': {
            void handleUpdate(text.data.data);
            break;
        }
    }
};
/**
 * Main function that configure and render the graph.
 * @returns A div containing the react flow graph's viewPort.
 */
export default function App() {
    const minZoom = 0.1;
    const maxZoom = 4;

    [nodes, setNodes, onNodesChange] = useNodesState(nodes);
    [edges, setEdges, onEdgesChange] = useEdgesState(edges);
    const [menu, setMenu] = React.useState<ContextMenuProps | null>(null);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        // Listener on the message from the server side.
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    // Callback to relayout the graph.
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

    // Reveal the symbol represented by the node in the code.
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

    // Highlight all edges linked to the node when hovered.
    const onNodeMouseEnter = React.useCallback((event: React.MouseEvent, node: Node) => {
        void event;
        // Add a timeout to let CSS the time to update the hover state
        edges = edges.map((edge) => {
            if (edge.target === node.id || edge.source === node.id)
                edge = changeMarker(edge, 'var(--vscode-focusBorder)', 'highlight');
            return edge;
        });
        setEdges(edges);
    }, []);

    const onNodeMouseLeave = React.useCallback((event: React.MouseEvent, node: Node) => {
        void event;
        // If a timeout is active clears it
        // (or the edges can color themselves after the mouse left the node)
        edges = edges.map((edge) => {
            if (edge.target === node.id || edge.source === node.id)
                edge = changeMarker(edge, '', undefined);
            return edge;
        });
        setEdges(edges);
    }, []);

    const onEdgeMouseEnter = React.useCallback((event: React.MouseEvent, edge: Edge) => {
        void event;
        edge = changeMarker(edge, 'var(--vscode-focusBorder)', 'highlight');

        edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = { ...edge };
        // Refresh the array to force re rendering
        edges = [...edges];
        setEdges(edges);
    }, []);

    const onEdgeMouseLeave = React.useCallback((event: React.MouseEvent, edge: Edge) => {
        void event;
        edge = changeMarker(edge, '', undefined);

        edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = edge;
        // Refresh the array to force re rendering
        edges = [...edges];
        setEdges(edges);
    }, []);

    const onNodeDelete = React.useCallback(
        (toDelete: Node[]) => {
            const deleted: Node[] = [];
            while (toDelete.length !== 0) {
                const node = toDelete.pop();
                if (node === undefined) continue;

                deleted.push(node);
                const outgoers: Node[] = getOutgoers(node, nodes, edges);
                for (const outgoer of outgoers) {
                    toDelete.push(outgoer);
                }
            }
            nodes = nodes.filter(
                (node) => !deleted.some((deletedNode) => node.id === deletedNode.id),
            );
            vscode.postMessage({
                command: 'deleteNodes',
                data: JSON.stringify({ nodesId: deleted.map((node) => node.id) } as DeleteMessage),
            });
            setNodes(nodes);
        },
        [nodes, edges],
    );

    const onContextClose = React.useCallback(() => setMenu(null), [setMenu]);

    const onNodeContextMenu = React.useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            if (ref.current) {
                setMenu({
                    node: node,
                    position: {
                        x: event.clientX,
                        y: event.clientY,
                    },
                    onContextClose: onContextClose,
                    onNodeDelete: onNodeDelete,
                } as ContextMenuProps);
            }
        },
        [setMenu],
    );
    vscode.postMessage({ command: 'rendered', data: '' } as Message);

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            {
                <ReactFlow
                    fitView
                    panOnDrag
                    zoomOnScroll
                    ref={ref}
                    nodes={nodes}
                    edges={edges}
                    maxZoom={maxZoom}
                    minZoom={minZoom}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onPaneClick={onContextClose}
                    onNodesDelete={onNodeDelete}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onEdgeMouseEnter={onEdgeMouseEnter}
                    onEdgeMouseLeave={onEdgeMouseLeave}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onNodeDoubleClick={onNodeDoubleClick}
                    onNodeContextMenu={onNodeContextMenu}
                    connectionLineComponent={floatingConnectionLine}
                >
                    <Controls>
                        <ControlButton
                            className="codicon codicon-layout"
                            title="Layout the graph"
                            onClick={() => onLayout()}
                        />
                    </Controls>
                    {menu && <ContextMenu {...menu} />}
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
