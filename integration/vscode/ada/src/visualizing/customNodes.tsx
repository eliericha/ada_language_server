import * as React from 'react';
import { Handle, Node, NodeProps, Position, useReactFlow } from '@xyflow/react';
import './customNodes.css';
import {
    Direction,
    NodeData,
    RelationDirection,
    HierarchyMessage,
    Hierarchy,
} from '../visualizerTypes';
import { currentDirection, vscode } from './App';
import { getNodeKind } from './utils';

type DataNode = Node<NodeData, 'data'>;

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
export function nodeFactory(
    x: number,
    y: number,
    data: NodeData,
    width: number = 150,
    height: number = 200,
) {
    const { ...objData } = data;
    return {
        id: data.id,
        type: nodeString[0],
        position: { x: x, y: y },
        data: objData,
        width: width,
        height: height,
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
    // const [expand, setExpand] = React.useState<boolean>(data.expanded);
    const { setCenter } = useReactFlow();

    // Dynamically assign class to DOM element to take into account, layouting direction,
    //  type of data being displayed....
    const color = 'var(--vscode-symbolIcon-' + data.kind + 'Foreground';
    const nodeClass = 'rectangle hoverable ' + (node.selected ? 'selected' : '');
    const iconClass = 'icon codicon codicon-symbol-' + data.kind;

    const subButtonClass =
        'icon codicon codicon-' +
        (data.hasChildren === null
            ? data.hierarchy === Hierarchy.CALL
                ? 'call-outgoing'
                : 'type-hierarchy-sub'
            : data.expanded
              ? 'chevron-down'
              : 'chevron-right') +
        ' hierarchy-button sub-button-' +
        (currentDirection === Direction.RIGHT ? 'right' : 'down');

    const superButtonClass =
        'icon codicon codicon-' +
        (node.data.hierarchy === Hierarchy.CALL ? 'call-incoming' : 'type-hierarchy-super') +
        ' hierarchy-button super-button-' +
        (currentDirection === Direction.RIGHT ? 'left' : 'up');

    const superButtonTitle =
        (node.data.expanded ? 'Hide ' : 'Display ') +
        (node.data.hierarchy === Hierarchy.CALL ? 'incoming calls' : 'supertypes');

    const subButtonTitle =
        (node.data.expanded ? 'Hide ' : 'Display ') +
        (node.data.hierarchy === Hierarchy.CALL ? 'outgoing calls' : 'subtypes');

    // Focus on the graph on this node
    if (data.focus) {
        data.focus = false;
        const x = node.positionAbsoluteX + (node.width ?? 0) / 2;
        const y = node.positionAbsoluteY + (node.height ?? 0) / 2;

        void setCenter(x, y, {
            zoom: 0.5,
            duration: 250,
        });
    }

    // Callback to get super or sub types
    const requestHierarchy = React.useCallback(
        ({ direction = RelationDirection.SUPER }) => {
            vscode.postMessage({
                command: 'requestHierarchy',
                data: JSON.stringify({
                    id: data.id,
                    direction: direction,
                    expand: direction === RelationDirection.SUB ? !data.expanded : data.expanded,
                    hierarchy: getNodeKind(data.kind),
                } as HierarchyMessage),
            });
        },
        [data.id, data.kind, data.expanded],
    );

    return (
        <div className={nodeClass}>
            <Handle className="invis" type="target" position={Position.Top} />
            <Handle className="invis" type="source" position={Position.Bottom} />
            <div className="title">
                <span className={iconClass} style={{ color: color }}></span>
                <div className="text" title={data.label}>
                    {data.label}
                </div>
            </div>
            <div className="body" title={data.label}>
                <div>File : {data.string_location.path.split('/').at(-1)}</div>
                <div>Position : {data.string_location.position}</div>
            </div>
            <button
                className={subButtonClass}
                title={subButtonTitle}
                style={{ display: data.hasChildren === false ? 'none' : 'inherit' }}
                onClick={() => requestHierarchy({ direction: RelationDirection.SUB })}
            ></button>
            <button
                className={superButtonClass}
                title={superButtonTitle}
                style={{ display: data.hasParent === null ? 'inherit' : 'none' }}
                onClick={() => requestHierarchy({ direction: RelationDirection.SUPER })}
            ></button>
        </div>
    );
}
