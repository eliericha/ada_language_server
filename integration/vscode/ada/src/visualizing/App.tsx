import * as React from 'react';
import ReactDOM from 'react-dom/client';
import {
    NodeIdsMessage as NodeIdsMessage,
    Direction,
    Message,
    NodeEdge,
    UpdateMessage,
} from '../visualizerTypes';
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
    SelectionMode,
    useReactFlow,
    Background,
    Panel,
    useOnSelectionChange,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './customNodes.css';
import 'vscode-webview';
import { edgeFactory, edgeTypes, floatingConnectionLine } from './customEdges';
import { moveNodes, nodeFactory, nodeTypes } from './customNodes';
import { elkOptions, layoutSubgraph, layoutSubgraphs } from './layouting';
import { changeMarker, focusNode, waitingBar } from './utils';
import { ContextMenu, ContextMenuProps } from './contextMenu';
import { SearchBar } from './searchBar';

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
let getNodes: () => Node[];
const nodeWidth = 250;
const nodeHeight = 300;

type Graph = {
    nodes: Node[];
    edges: Edge[];
};

/**
 * Create a graph based on the JSON string passed as an arguments.
 *
 * @param messageData  - JSON string containing the data of all the nodes to display.
 */
async function handleHierarchy(messageData: string) {
    const data: NodeEdge = JSON.parse(messageData) as NodeEdge;
    const newNodes: Node[] = [];
    let subGraphNode: Node | undefined = undefined;
    const numNodes = nodes.length;

    // Remove all node that are not in the graph anymore (after a folding for example)
    nodes = nodes.filter((node) => data.nodesData.some((nodeData) => nodeData.id === node.data.id));
    // Reset edge to ensure only new/current edges are in the graph
    edges = [];

    for (const nodeData of data.nodesData) {
        const newNode = nodeFactory(0, 0, nodeData, nodeWidth, nodeHeight);
        const foundNodeIndex = nodes.findIndex((node) => node.id === newNode.id);

        // Only add node that does not already exists
        if (foundNodeIndex === -1) {
            // Place the initial position of the node at the same position than the
            // parent it was expanded from.
            newNodes.push(newNode);
            nodes.push(newNode);
        } else {
            // Update the content of the node
            nodes[foundNodeIndex] = {
                ...nodes[foundNodeIndex],
                selected: false,
                data: newNode.data,
            };
        }
    }
    const focusIndex = nodes.findIndex((node) => node.data.focus);
    // Focus only if the number of nodes increased
    // Recreate the node to force an update
    if (focusIndex !== -1 && nodes.length > numNodes) nodes[focusIndex] = { ...nodes[focusIndex] };
    else if (focusIndex !== -1) nodes[focusIndex].data.focus = false;

    if (focusIndex !== -1) {
        for (const node of newNodes) {
            node.position = { ...nodes[focusIndex].position };
        }
    }

    data.edges.forEach(({ src, dst, edgeDirection }) => {
        // addEdge checks if an edge src dst already exist.
        edges = addEdge(edgeFactory(src, dst, edgeDirection), edges);
    });

    // Recreate the nodes object to force the re-render
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
    moveNodes(nodes, setNodes);
    waitingBar(true);
}

/**
 * Update the graph by deleting node and updating node data.
 *
 * @param messageData - The data containing the data of the node to delete and to update.
 */
function handleUpdate(messageData: string) {
    const data: UpdateMessage = JSON.parse(messageData) as UpdateMessage;
    for (const node of data.toUpdate) {
        const index = nodes.findIndex((searchNode) => node.id === searchNode.id);
        if (index === -1) continue;
        // Recreate the node object with the new data.
        nodes[index] = {
            ...nodes[index],
            data: node,
        };
    }
    for (const node of data.toDelete) {
        const index = nodes.findIndex((searchNode) => node.id === searchNode.id);
        // Remove the edge that come from or to the node to delete.
        edges = edges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
        if (index === -1) continue;
        {
            nodes.splice(index, 1);
        }
    }
    // Recreate the nodes object to force the re-render
    nodes = [...nodes];
    setNodes(nodes);
    waitingBar(true);
}

/**
 * Dispatch the message received according to the command passed as a field to the message.
 *
 * @param text - A message received by the client
 */
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
        case 'isRendered': {
            vscode.postMessage({ command: 'rendered', data: '' } as Message);
            break;
        }
    }
};

/**
 * Main function that configure and render the graph.
 *
 * @returns A div containing the react flow graph's viewPort.
 */
export default function App() {
    const minZoom = 0.1;
    const maxZoom = 4;

    [nodes, setNodes, onNodesChange] = useNodesState(nodes);
    [edges, setEdges, onEdgesChange] = useEdgesState(edges);
    // Save the state of the contextMenu (right click on a node).
    const [menu, setMenu] = React.useState<ContextMenuProps | null>(null);
    // Save the state of the currently selected edges.
    const [selected, setSelected] = React.useState<Edge[]>([]);
    // Save the state of the last focused element to avoid uselessly focus on it.
    const [lastFocus, setLastFocus] = React.useState<string>('');
    const ref = React.useRef<HTMLDivElement>(null);
    const { setCenter, getNode, getNodes: getNodes_, getViewport } = useReactFlow();
    getNodes = getNodes_;
    void getNodes;

    React.useEffect(() => {
        // Listener on the message from the server side.
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    /**
     * Relayout the whole graph in the opposite direction than the current one.
     */
    const onLayout = React.useCallback(() => {
        currentDirection = currentDirection === Direction.RIGHT ? Direction.DOWN : Direction.RIGHT;

        void layoutSubgraphs(nodes, edges, currentDirection, elkOptions).then(() => {
            nodes = nodes.map((node) => {
                return { ...node };
            });
            moveNodes(nodes, setNodes);
            // setNodes(nodes);
            // setEdges(edges);
        });
    }, [nodes, edges]);

    /**
     * Reveal the symbol represented by the node in the code.
     */
    const onNodeDoubleClick = React.useCallback((event: React.MouseEvent, node: Node) => {
        if ((event.target as Element).className.includes('visualizer__hierarchy-button')) return;
        void event;
        vscode.postMessage({
            command: 'revealNode',
            data: node.id,
        });
    }, []);

    /**
     * Highlight all edges linked to the node when hovered.
     */
    const onNodeMouseEnter = React.useCallback((event: React.MouseEvent, node: Node) => {
        void event;
        edges = edges.map((edge) => {
            if (edge.target === node.id || edge.source === node.id)
                edge = changeMarker(
                    edge,
                    'var(--visualizer-border-color-focused)',
                    'visualizer__highlight',
                );
            return edge;
        });
        setEdges(edges);
    }, []);

    /**
     * Unhighlight the edges linked to the node when stop hovering.
     */
    const onNodeMouseLeave = React.useCallback((event: React.MouseEvent, node: Node) => {
        void event;
        edges = edges.map((edge) => {
            if (edge.target === node.id || edge.source === node.id)
                edge = changeMarker(edge, '', undefined);
            return edge;
        });
        setEdges(edges);
    }, []);

    /**
     * Highlight the marker of the edge when hovering the edge.
     */
    const onEdgeMouseEnter = React.useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            void event;
            edge = changeMarker(
                edge,
                'var(--visualizer-border-color-focused)',
                'visualizer__highlight',
            );

            edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = { ...edge };
            // Refresh the array to force re rendering
            edges = [...edges];
            setEdges(edges);
        },
        [edges],
    );

    /**
     * Unhighlight the marker of the edge when hovering the edge.
     */
    const onEdgeMouseLeave = React.useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            void event;
            edge = changeMarker(edge, '', undefined);

            edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = edge;
            // Refresh the array to force re rendering
            edges = [...edges];
            setEdges(edges);
        },
        [edges],
    );

    /**
     * Send a delete message with the id of the main node to remove to the server side.
     */
    const onNodeDelete = React.useCallback(
        (toDelete: Node[]) => {
            waitingBar();
            vscode.postMessage({
                command: 'deleteNodes',
                data: JSON.stringify({
                    nodesId: toDelete.map((node) => node.id),
                } as NodeIdsMessage),
            });
            setNodes(nodes);
        },
        [nodes],
    );

    /**
     * Close the node context menu.
     */
    const onContextClose = React.useCallback(() => setMenu(null), [setMenu]);

    /**
     * Close the node context menu and clear the node search bar on pane click
     */
    const onPaneClick = React.useCallback(() => {
        setLastFocus('');
        const searchBar = document.getElementById('visualizer__node-search-bar');
        if (!searchBar) return;
        (searchBar as HTMLInputElement).value = '';
        const event = new Event('change', { bubbles: true });
        searchBar.dispatchEvent(event);

        onContextClose();
    }, []);

    /**
     * Create the context menu and position it on the close to the mouse position.
     */
    const onNodeContextMenu = React.useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            if (ref.current) {
                const pane = ref.current.getBoundingClientRect();

                setMenu({
                    node: node,
                    // Handle the case where the mouse is close to a border (displace the context
                    // menu to another quadrant)
                    top: event.clientY < pane.height - nodeHeight ? event.clientY : undefined,
                    left: event.clientX < pane.width - nodeWidth ? event.clientX : undefined,
                    right:
                        event.clientX >= pane.width - nodeWidth
                            ? pane.width - event.clientX
                            : undefined,
                    bottom:
                        event.clientY >= pane.height - nodeHeight
                            ? pane.height - event.clientY
                            : undefined,
                    onContextClose: onContextClose,
                    onNodeDelete: onNodeDelete,
                } as ContextMenuProps);
            }
        },
        [setMenu, ref],
    );

    /**
     * Send a message to server side when initialized to indicate it can start sending information.
     */
    const onInit = React.useCallback(() => {
        vscode.postMessage({ command: 'rendered', data: '' } as Message);
    }, []);

    /**
     * Set the view to the center of the webView.
     */
    const onCenter = React.useCallback(() => {
        void setCenter(0, 0, { zoom: minZoom, duration: 1000 });
    }, []);

    /**
     * Handle the unselection of the edge to remove their edge marker.
     */
    const onChange = React.useCallback(
        ({ nodes: selectedNodes, edges: selectedEdges }: Graph) => {
            void selectedNodes;
            for (const oldEdge of selected) {
                if (!selectedEdges.some((edge) => edge.id === oldEdge.id)) {
                    const edge = changeMarker(oldEdge, '', undefined, true);
                    edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = edge;
                    edges = [...edges];
                    setEdges(edges);
                }
            }
            setSelected(selectedEdges);
        },
        [selected, edges],
    );

    // Hook called when the user select or unselect nodes or edges.
    useOnSelectionChange({
        onChange,
    });

    /**
     * Allow to cycle through the element of the webView and focus on the element if it's a node.

     */
    const onFocus = React.useCallback(
        (focus: React.FocusEvent) => {
            // Focus on the node currently focused only the mouse is not already on it
            // (avoid triggering the focus on node click)
            if (focus.target.classList.contains('visualizer__rectangle')) {
                const nodeId = focus.target.getAttribute('data-id');
                if (!nodeId) return;
                if (!focus.target.matches(':hover') && lastFocus !== nodeId) {
                    const node = getNode(nodeId);
                    if (node) focusNode(node, getViewport(), setCenter);
                }
                setLastFocus(nodeId);
            } else setLastFocus('');
        },
        [lastFocus],
    );

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            {
                <ReactFlow
                    panOnDrag
                    zoomOnScroll
                    ref={ref}
                    nodes={nodes}
                    edges={edges}
                    maxZoom={maxZoom}
                    minZoom={minZoom}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onInit={onInit}
                    onPaneClick={onPaneClick}
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
                    selectionMode={SelectionMode.Partial}
                    nodesConnectable={false}
                    deleteKeyCode={['Delete', 'Backspace']}
                    edgesFocusable={false}
                    // The nodes remains focusable by their inner objects not the outer.
                    nodesFocusable={false}
                    className="visualizer__colors"
                    onFocus={onFocus}
                >
                    <Controls>
                        <ControlButton
                            className="codicon codicon-layout"
                            title="Layout the graph"
                            onClick={() => onLayout()}
                        />
                        <ControlButton
                            className="codicon codicon-record visualizer__bottom-button"
                            title="Center the view"
                            onClick={onCenter}
                        />
                    </Controls>
                    {menu && <ContextMenu {...menu} />}
                    <Background size={3} gap={56} />
                    <Panel position="top-right">
                        <SearchBar />
                    </Panel>
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
