import * as React from 'react';
import ReactDOM from 'react-dom/client';
import {
    NodeIdsMessage as NodeIdsMessage,
    Direction,
    Message,
    NodeEdge,
    UpdateMessage,
    RelationDirection,
    RevealReferencesMessage,
    RevealReferencesResponse,
    StringLocation,
    NodeData,
    Hierarchy,
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
import './visualizerStyleSheet.css';
import { edgeFactory, edgeTypes, floatingConnectionLine } from './customEdges';
import { moveNodes, nodeFactory, nodeTypes } from './customNodes';
import { elkOptions, layoutSubgraph, layoutSubgraphs } from './layouting';
import { changeEdge, focusNode, setIntervalCapped, waitingBar } from './utils';
import { NodeContextMenu, NodeContextMenuProps } from './nodeContextMenu';
import { closeSearchBar as onSearchBarClose, SearchBar } from './searchBar';
import { ReferencesPickerMenu, ReferencesPickerMenuProps } from './referencesPickerMenu';

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
let referencesPickerMenu: ReferencesPickerMenuProps | null = null;
let setReferencesPickerMenu: React.Dispatch<React.SetStateAction<ReferencesPickerMenuProps | null>>;
let nodeContextMenu: NodeContextMenuProps | null = null;
let setNodeContextMenu: React.Dispatch<React.SetStateAction<NodeContextMenuProps | null>>;

// Store the id of a setTimeout to ensure the uniqueness of the timeout.
let timeoutId: NodeJS.Timeout | null = null;

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
    if (data.focus && focusIndex !== -1 && nodes.length > numNodes)
        nodes[focusIndex] = { ...nodes[focusIndex] };
    else if (focusIndex !== -1 || !data.focus) nodes[focusIndex].data.focus = false;

    // Place the original position of all the new node to the focused Node.
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
    // stop the waiting bar only if the server has finished sending data.
    // Here the node won't be focused except if the recursive hierarchy process finished or
    // was just a single level.
    if (data.focus) waitingBar(true);
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
 * Fill the references picker menu with the locations the user can jump to.
 *
 * @param data - The data received
 */
function handleReveal(data: string) {
    const response = JSON.parse(data) as RevealReferencesResponse;
    const locationsMap: Map<string, StringLocation[]> = new Map();
    for (let i = 0; i < response.locationsKeys.length; i++) {
        locationsMap.set(response.locationsKeys[i], response.locationsValues[i]);
    }
    // Check which menu currently exist to fill it with the different locations.
    if (referencesPickerMenu)
        setReferencesPickerMenu({ ...referencesPickerMenu, locationsMap: locationsMap });
    else if (nodeContextMenu) {
        setNodeContextMenu({ ...nodeContextMenu, locationsMap: locationsMap });
    }
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
        case 'revealResponse': {
            void handleReveal(text.data.data);
            break;
        }
        default:
            console.log('Command not found or empty');
            break;
    }
};

/**
 * Main function that configure and render the graph.
 *
 * @returns A div containing the react flow graph's viewPort.
 */
export default function App() {
    // The max and min zoom on the viewPort.
    const minZoom = 0;
    const maxZoom = 4;

    [nodes, setNodes, onNodesChange] = useNodesState(nodes);
    [edges, setEdges, onEdgesChange] = useEdgesState(edges);
    // Save the state of the contextMenu (right click on a node).
    // setNodeMenu will be called outside this function but this is the only place
    // where useState can be used.
    [nodeContextMenu, setNodeContextMenu] = React.useState<NodeContextMenuProps | null>(null);
    // The references picker menu is filled with information from the server side so
    // setReferencesPickerMenu will be called outside this function but this is the only place
    // where useState can be used.
    [referencesPickerMenu, setReferencesPickerMenu] =
        React.useState<ReferencesPickerMenuProps | null>(null);
    // Save the state of the currently selected edges.
    const [selected, setSelected] = React.useState<Edge[]>([]);
    // Save the state of the last focused element to avoid uselessly focus on it.
    const [lastFocus, setLastFocus] = React.useState<string>('');
    // Used to check if the references picker can be open, to avoid it opening on repeat when the
    // let his mouse hover on the edge after closing the picker for example.
    const [canOpenReferencesPicker, setCanOpenReferencesPicker] = React.useState(true);
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

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey)
                document.documentElement.style.setProperty(
                    '--visualizer-icon-underline',
                    '1.5px solid',
                );
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // When pressing control highlight all the button to indicate they have another use
    // (recursively unfold the graph)
    React.useEffect(() => {
        const handleKeyUp = (event: KeyboardEvent) => {
            if (!event.ctrlKey)
                document.documentElement.style.setProperty('--visualizer-icon-underline', 'none');
        };

        window.addEventListener('keyup', handleKeyUp);
        return () => window.removeEventListener('keyup', handleKeyUp);
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
        });
    }, [nodes, edges]);

    /**
     * Reveal the symbol represented by the node in the code.
     */
    const onNodeDoubleClick = React.useCallback((event: React.MouseEvent, node: Node) => {
        if ((event.target as HTMLElement).className.includes('visualizer__hierarchy-button'))
            return;
        vscode.postMessage({
            command: 'revealNode',
            data: node.id,
        });

        // Unselect the node after the double click.
        const nodeElem = document.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement;
        const nodeWrapper = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement;

        nodeElem.classList.remove('visualizer__selected');
        nodeElem.blur();
        nodeWrapper.classList.remove('selected');
    }, []);

    /**
     * Highlight all edges linked to the node when hovered.
     */
    const onNodeMouseEnter = React.useCallback((event: React.MouseEvent, node: Node) => {
        void event;
        edges = edges.map((edge) => {
            if (edge.target === node.id || edge.source === node.id)
                edge = changeEdge(
                    edge,
                    'var(--visualizer-border-color-focused)',
                    'visualizer__highlight',
                    null,
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
        if (!node.selected) {
            edges = edges.map((edge) => {
                if (edge.target === node.id || edge.source === node.id)
                    edge = changeEdge(edge, '', undefined, null);
                return edge;
            });
        }
        setEdges(edges);
    }, []);

    /**
     * Open the references picker menu under the current position of the mouse.
     *
     * @param event - The react mouse event.
     * @param edge  - The edge the mouse is currently on.
     * @param openedByClick - True if the user clicked on the edge, false if the user
     * hovered the edge.
     */
    function openReferencesPicker(event: React.MouseEvent, edge: Edge, openedByClick: boolean) {
        // When using the references picker if the user selects a location without moving the
        // mouse, the picker would reopen alone causing the user to lose focus on its code.
        if ((nodes[0].data as NodeData).hierarchy === Hierarchy.PACKAGE) return;
        if (ref.current && canOpenReferencesPicker) {
            closeAllPopUp();
            event.preventDefault();

            let targetNodeId: string = '';
            let referenceNodeId: string = '';
            const menuWidth = nodeWidth;
            const pane = ref.current.getBoundingClientRect();
            if (!edge.data) return;
            if (edge.data.edgeDirection === RelationDirection.SUB) {
                targetNodeId = edge.source;
                referenceNodeId = edge.target;
            } else if (edge.data.edgeDirection === RelationDirection.SUPER) {
                targetNodeId = edge.target;
                referenceNodeId = edge.source;
            }

            //Make sure the popup doesn't overflow thought the left or right side.
            // The top/bottom overflow will be handled in the ReferencesPickerMenu itself
            // when all the references have been gathered.
            let left = event.clientX;
            if (event.clientX - menuWidth / 2 < 0) {
                left += (menuWidth - event.clientX) / 2;
            } else if (event.clientX + menuWidth / 2 > pane.width) {
                left -= event.clientX + menuWidth / 2 - pane.width;
            }

            // The locationsMap with all the references will be filled later when the server
            // sended the data.
            setReferencesPickerMenu({
                onReferencesPickerClose: onReferencesPickerClose,
                top: event.clientY,
                left: left,
                edge: edge,
                source: getNode(referenceNodeId),
                target: getNode(targetNodeId),
                locationsMap: new Map(),
                openedByClick: openedByClick,
                menuWidth: menuWidth,
                pane: pane,
            } as ReferencesPickerMenuProps);

            if (targetNodeId !== '' && referenceNodeId !== '')
                // Ask the server for the references that will fill the references picker.
                vscode.postMessage({
                    command: 'revealReferences',
                    data: JSON.stringify({
                        targetNodeId: targetNodeId,
                        referenceNodeId: referenceNodeId,
                    } as RevealReferencesMessage),
                });

            // Wait until the menu is created before adding it the class to open it.
            const intervalId = setIntervalCapped(
                () => {
                    const edgeMenu = document.getElementsByClassName(
                        'visualizer__references-picker-menu',
                    );
                    if (edgeMenu.length !== 0) {
                        edgeMenu[0].classList.add('visualizer__open');
                        clearInterval(intervalId);
                    }
                },
                50,
                50,
            );
        }
    }

    /**
     * Highlight the marker of the edge when hovering the edge.
     * Additionally if the user hovers for a sufficiently long time, open the references
     * picker menu.
     */
    const onEdgeMouseEnter = React.useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            void event;
            edge = changeEdge(
                edge,
                'var(--visualizer-border-color-focused)',
                'visualizer__highlight',
                null,
            );

            edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = { ...edge };
            // Refresh the array to force re rendering
            edges = [...edges];
            setEdges(edges);
            // If the user is still hovering the edge after a set time, open the references
            // picker menu.
            timeoutId = setTimeout(() => {
                if (referencesPickerMenu === null) openReferencesPicker(event, edge, false);
            }, 750);
        },

        [edges, canOpenReferencesPicker],
    );

    /**
     * Close the edge context menu.
     */
    const onReferencesPickerClose = React.useCallback(() => {
        const edgeMenu = document.getElementsByClassName('visualizer__references-picker-menu');
        if (edgeMenu.length !== 0) {
            edgeMenu[0].classList.remove('visualizer__open');
        }
        // Prevent the references picker to be open until the mouse is moved after it
        // has been closed.
        setCanOpenReferencesPicker(false);
        setReferencesPickerMenu(null);
    }, [setReferencesPickerMenu]);

    /**
     * Unhighlight the marker of the edge when hovering the edge.
     */
    const onEdgeMouseLeave = React.useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            void event;
            edge = changeEdge(edge, '', undefined, null);

            edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = edge;
            // Refresh the array to force re rendering
            edges = [...edges];
            setEdges(edges);
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
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
     * Close the node context menu and clear the node search bar on pane click
     */
    const onPaneClick = React.useCallback(
        (event: React.MouseEvent) => {
            void event;
            setLastFocus('');

            // Force the unselection of all the nodes and edges as sometimes the
            // onChange call back is not called
            onChange({ nodes: [], edges: [] });
            closeAllPopUp();
        },
        [selected],
    );

    /**
     * Prevent the regular pane click to happen as its features are useless here.
     */
    const onPaneContextMenu = React.useCallback((event: MouseEvent | React.MouseEvent) => {
        event.preventDefault();
    }, []);

    /**
     * Close the node context menu.
     */
    const onNodeContextClose = React.useCallback(
        () => setNodeContextMenu(null),
        [setNodeContextMenu],
    );

    /**
     * Create the context menu and position it on the close to the mouse position.
     */
    const onNodeContextMenu = React.useCallback(
        (event: React.MouseEvent, node: Node) => {
            event.preventDefault();
            if (ref.current) {
                closeAllPopUp();
                const pane = ref.current.getBoundingClientRect();

                setTimeout(() => {
                    setNodeContextMenu({
                        node: node,
                        // Handle the case where the mouse is close to a border
                        // (displace the context menu to another quadrant)
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
                        locationsMap: new Map(),
                        pane: pane,
                        onContextClose: onNodeContextClose,
                        onNodeDelete: onNodeDelete,
                    } as NodeContextMenuProps);
                }, 200);
            }
        },
        [setNodeContextMenu, ref],
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
        void setCenter(0, 0, { zoom: 0.5, duration: 1000 });
    }, []);

    /**
     * Handle the unselection of the edge to remove their edge marker.
     */
    const onChange = React.useCallback(
        ({ nodes: selectedNodes, edges: selectedEdges }: Graph) => {
            // Unselect all the edges that are not in the selectedEdges array anymore.
            for (const oldEdge of selected) {
                if (!selectedEdges.some((edge) => edge.id === oldEdge.id)) {
                    const edge = changeEdge(oldEdge, '', undefined, false);
                    edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = edge;
                }
            }

            // Select all the edges neighboring a selected Nodes.
            for (const selectedNode of selectedNodes) {
                const nodeEdge = edges.filter(
                    (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id,
                );
                for (let edge of nodeEdge) {
                    edge = changeEdge(
                        edge,
                        'var(--visualizer-border-color-focused)',
                        'visualizer__highlight',
                        true,
                    );
                    edges[edges.findIndex((searchEdge) => searchEdge.id === edge.id)] = { ...edge };
                    if (selectedEdges.find((searchEdge) => searchEdge.id === edge.id) === undefined)
                        selectedEdges.push(edge);
                }
            }
            // Refresh the array to force re rendering
            edges = [...edges];
            setEdges(edges);
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
                const nodeId = focus.target.getAttribute('data-node-id');
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

    /**
     * Small helper function to close all kinds of popup (searchbar, context menu,
     * references picker).
     */
    function closeAllPopUp() {
        onSearchBarClose();
        onNodeContextClose();
        onReferencesPickerClose();
    }
    /**
     * Close all menus on node click.
     */
    const onNodeClick = React.useCallback(() => {
        closeAllPopUp();
    }, []);

    /**
     * Close all menus and open the references picker menu on edge click
     */
    const onEdgeClick = React.useCallback(
        (event: React.MouseEvent, edge: Edge) => {
            onSearchBarClose();
            onNodeContextClose();
            if (referencesPickerMenu === null) openReferencesPicker(event, edge, true);
        },
        [referencesPickerMenu, canOpenReferencesPicker],
    );

    /**
     * Enable the opening of the references picker menu after the mouse moved.
     */
    const onMouseMove = React.useCallback(() => {
        if (!canOpenReferencesPicker) setCanOpenReferencesPicker(true);
    }, [canOpenReferencesPicker]);

    const onKeyDown = React.useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Escape') closeAllPopUp();
    }, []);

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            {
                <ReactFlow
                    panOnDrag
                    zoomOnScroll
                    ref={ref}
                    nodes={nodes}
                    edges={edges}
                    onInit={onInit}
                    onFocus={onFocus}
                    maxZoom={maxZoom}
                    minZoom={minZoom}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onKeyDown={onKeyDown}
                    // The nodes remains focusable by their inner objects not the outer.
                    nodesFocusable={false}
                    edgesFocusable={false}
                    nodesConnectable={false}
                    onPaneClick={onPaneClick}
                    onNodeClick={onNodeClick}
                    onMouseMove={onMouseMove}
                    onEdgeClick={onEdgeClick}
                    onNodesDelete={onNodeDelete}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onEdgeMouseEnter={onEdgeMouseEnter}
                    onEdgeMouseLeave={onEdgeMouseLeave}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onPaneContextMenu={onPaneContextMenu}
                    onNodeDoubleClick={onNodeDoubleClick}
                    onNodeContextMenu={onNodeContextMenu}
                    selectionMode={SelectionMode.Partial}
                    deleteKeyCode={['Delete', 'Backspace']}
                    connectionLineComponent={floatingConnectionLine}
                    className="visualizer__colors"
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
                    {nodeContextMenu && <NodeContextMenu {...nodeContextMenu} />}
                    {referencesPickerMenu && <ReferencesPickerMenu {...referencesPickerMenu} />}
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
