import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { Message } from '../types';
import {
    Node,
    Edge,
    Connection,
    useNodesState,
    useEdgesState,
    addEdge,
    ReactFlow,
    Panel,
    useReactFlow,
    ReactFlowProvider,
    MiniMap,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import './customNodes.css';
import 'vscode-webview';
import {
    Triangle,
    TextUpdaterNode,
    Rectangle,
    Trapezoid,
    Circle,
    Parallelogram,
    Oval,
} from './customNodes';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';

const vscode = acquireVsCodeApi();

const elk = new ELK();

const elkOptions = {
    'elk.algorithm': 'layered',
    'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    'elk.spacing.nodeNode': '80',
};

const getLayoutedElements = async (
    nodes: Node[],
    edges: Edge[],
    direction: string = 'RIGHT',
    options = {},
) => {
    const isHorizontal = direction === 'RIGHT';
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
    const layout = await elk.layout(graph);

    if (!layout || !layout.children) return { nodes: [], edges: [] };

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

let id = 0;
const nodeTypes = {
    triangle: Triangle,
    rectangle: Rectangle,
    trapezoid: Trapezoid,
    circle: Circle,
    parallelogram: Parallelogram,
    oval: Oval,
    text: TextUpdaterNode,
};

const nodeString: string[] = ['triangle', 'rectangle', 'circle', 'oval', 'parallelogram'];
function nodeFactory(x: number, y: number, label: string) {
    id++;
    return {
        id: id.toString(),
        // type: nodeString[Math.floor(Math.random() * nodeString.length)],
        type: nodeString[1],
        position: { x: x, y: y },
        data: { label: label },
    };
}

function edgeFactory(src: string, dst: string) {
    return { id: 'e' + src + '-' + dst, source: src, target: dst, type: 'smoothstep' };
}

const initialNodes: Node[] = [
    nodeFactory(
        0,
        0,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ),
    nodeFactory(0, 100, '2'),
    nodeFactory(0, 0, '3'),
    nodeFactory(0, 0, '4'),
    nodeFactory(0, 0, '5'),
    nodeFactory(0, 0, '6'),
    nodeFactory(0, 0, '7'),
    nodeFactory(0, 0, '8'),
    nodeFactory(0, 0, '9'),
    nodeFactory(0, 0, '10'),
    nodeFactory(0, 0, '11'),
    nodeFactory(0, 0, '12'),
    nodeFactory(0, 0, '13'),
    nodeFactory(0, 0, '14'),
];

const initialNodes2: Node[] = [nodeFactory(0, 0, '14'), nodeFactory(0, 100, '4')];
const initialEdges: Edge[] = [
    edgeFactory('1', '2'),
    edgeFactory('1', '3'),
    edgeFactory('1', '4'),
    edgeFactory('2', '5'),
    edgeFactory('3', '6'),
    edgeFactory('4', '7'),
    edgeFactory('2', '8'),
    edgeFactory('3', '9'),
    edgeFactory('4', '10'),
    edgeFactory('8', '11'),
    edgeFactory('11', '12'),
    edgeFactory('3', '13'),
    edgeFactory('8', '14'),

    edgeFactory('1', '7'),
    edgeFactory('5', '11'),
    edgeFactory('6', '12'),

    edgeFactory('1', '14'),
];
const initialEdges2: Edge[] = [{ id: 'e3-4', source: '3', target: '4' }];
let flip: boolean = true;

let onNodesChange;
let onEdgesChange;
let nodes: Node[] = [];
let edges: Edge[] = [];
let setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
let setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;

// This code is put outside the App function to register only one event listener
// The app function would create one on every re-render
window.addEventListener('message', (text: MessageEvent<Message>) => {
    console.log(text);
    let newNodes: Node[] = [];
    let nodesName: string[] = [];
    switch (text.data.command) {
        case 'swap':
            if (flip) {
                setNodes(initialNodes2);
                setEdges(initialEdges2);
            } else {
                setNodes(initialNodes);
                setEdges(initialEdges);
            }
            console.log(flip);
            flip = !flip;
            break;
        case 'packages':
            nodesName = JSON.parse(text.data.data) as string[];
            newNodes = nodesName.map(
                (l: string): Node =>
                    nodeFactory(
                        Math.floor(Math.random() * 500),
                        Math.floor(Math.random() * 500),
                        l,
                    ),
            );
            setNodes(newNodes);
            setEdges([]);
            break;
    }
});

// This function will be called multiple time (when re-rendering for example)
export default function App() {
    [nodes, setNodes, onNodesChange] = useNodesState(nodes);
    [edges, setEdges, onEdgesChange] = useEdgesState(edges);
    const { fitView } = useReactFlow();

    // Called when 2 nodes are being connected with an edge
    const onConnect = React.useCallback(
        (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

    // Called when clicking on a node
    const onNodeClick = React.useMemo(
        () => (event: React.MouseEvent, node: Node) => {
            console.log(event);
            console.log(node);
            // f = false;
            vscode.postMessage({ command: 'swap' });
        },
        [],
    );

    // Callback to relayout the graph
    const onLayout = React.useCallback(
        ({ direction = 'DOWN', useInitialNodes = false }) => {
            const ns = useInitialNodes ? initialNodes : nodes;
            const es = useInitialNodes ? initialEdges : edges;

            void getLayoutedElements(ns, es, direction, elkOptions).then(
                ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
                    if (layoutedEdges !== undefined && layoutedNodes !== undefined) {
                        setNodes(layoutedNodes);
                        setEdges(layoutedEdges);
                    }

                    window.requestAnimationFrame(() => () => fitView());
                },
            );
        },
        [nodes, edges],
    );

    // React.useLayoutEffect(() => {
    //     void onLayout({ direction: 'RIGHT', useInitialNodes: true });
    // }, []);

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            {
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodeClick={onNodeClick}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    fitView
                    nodeTypes={nodeTypes}
                >
                    <Panel position="top-right">
                        <button onClick={() => onLayout({ direction: 'DOWN' })}>
                            vertical layout
                        </button>
                        <button onClick={() => onLayout({ direction: 'RIGHT' })}>
                            horizontal layout
                        </button>
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
