import * as React from 'react';
import { Handle, Node, NodeProps, Position, useReactFlow } from '@xyflow/react';
import './customNodes.css';
import { Direction, NodeData, RelationDirection, HierarchyMessage } from '../visualizerTypes';
import { currentDirection } from './App';
import { getNodeKind } from './utils';

type DataNode = Node<NodeData, 'data'>;

const vscode = acquireVsCodeApi();
export const nodeTypes = {
    rectangle: Rectangle,
};
const nodeString: string[] = ['rectangle'];

/**
 * Return a new react flow node
 * @param x - x position of the node
 * @param y - y position of the node
 * @param data - Data stored by the node
 * @returns A new react flow Node
 */
export function nodeFactory(x: number, y: number, data: NodeData) {
    const { ...objData } = data;
    return {
        id: data.label,
        type: nodeString[0],
        position: { x: x, y: y },
        data: objData,
        width: 150,
        height: 200,
    } as Node;
}

/**
 * Customize a basic node, adding it childs, style and interactions
 *
 * @param node - The base node to customize
 * @returns A react JSX object representing the node.
 */
export function Rectangle(node: NodeProps<DataNode>) {
    const data = node.data;
    const [expand, setExpand] = React.useState<boolean>(data.expanded);
    const [hidden, setHidden] = React.useState<boolean>(data.hasParent);
    const { setCenter } = useReactFlow();

    /**
     * Dynamically assign class to DOM element to take into account, layouting direction,
     *  type of data being displayed....
     */
    const color = 'var(--vscode-symbolIcon-' + data.kind + 'Foreground';
    const iconClass = 'icon codicon codicon-symbol-' + data.kind;
    const subButtonClass =
        'icon codicon codicon-chevron-' +
        (expand ? 'down' : 'right') +
        ' hierarchy-button sub-button-' +
        (currentDirection === Direction.RIGHT ? 'right' : 'down');

    const superButtonClass =
        'icon codicon codicon-plus hierarchy-button super-button-' +
        (currentDirection === Direction.RIGHT ? 'left' : 'up');

    // Focus on the graph on this node
    if (data.focus) {
        data.focus = false;
        const x = node.positionAbsoluteX + (node.width ?? 0) / 2;
        const y = node.positionAbsoluteY + (node.height ?? 0) / 2;

        void setCenter(x, y, {
            zoom: 1,
            duration: 500,
        });
    }

    // Callback to get super or sub types
    const requestTypes = React.useCallback(
        ({ direction = RelationDirection.SUPER }) => {
            vscode.postMessage({
                command: 'requestHierarchy',
                data: JSON.stringify({
                    label: data.label,
                    direction: direction,
                    expand: direction === RelationDirection.SUB ? !expand : expand,
                    hierarchy: getNodeKind(data.kind),
                } as HierarchyMessage),
            });
            if (direction === RelationDirection.SUB) setExpand(!expand);
            else setHidden(true);
        },
        [expand],
    );

    return (
        <div className="rectangle hoverable">
            <Handle className="invis" type="target" position={Position.Top} />
            <Handle className="invis" type="source" position={Position.Bottom} />
            <div className="title">
                <span className={iconClass} style={{ color: color }}></span>
                <div className="text"> {data.label}</div>
            </div>
            <div className="center" title={data.label}>
                {data.label}
            </div>
            <button
                className={subButtonClass}
                onClick={() => requestTypes({ direction: RelationDirection.SUB })}
            ></button>
            <button
                className={superButtonClass}
                style={{ display: hidden ? 'none' : 'inherit' }}
                onClick={() => requestTypes({ direction: RelationDirection.SUPER })}
            ></button>
        </div>
    );
}
