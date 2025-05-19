import * as React from 'react';
import { Handle, Node, NodeProps, Position, useReactFlow, XYPosition } from '@xyflow/react';
import './visualizerStyleSheet.css';
import {
    Direction,
    NodeData,
    RelationDirection,
    HierarchyMessage,
    Hierarchy,
} from '../visualizerTypes';
import { currentDirection, vscode } from './App';
import { waitingBar } from './utils';

type DataNode = Node<NodeData, 'data'>;

export const nodeTypes = {
    rectangle: Rectangle,
};

const nodeString: string[] = ['rectangle'];

/**
 * Return a new react flow node
 *
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
 * Animate the movement of the node from their original locations to their new locations.
 *
 * @param movingNodes - The array of node that need to move to their new positions.
 * @param setNodes - The function to set the nodes' state of the graph.
 * @param duration - The duration of the animation
 */
export function moveNodes(
    movingNodes: Node[],
    setNodes: (payload: Node[] | ((nodes: Node[]) => Node[])) => void,
    duration: number = 100,
) {
    const newPositions: XYPosition[] = [];
    const parents: HTMLDivElement[] = [];
    setNodes(movingNodes);
    const notFound: Node[] = [...movingNodes];
    //Wait for all the nodes to be rendered so that their parents are created and can be getted.
    const interval = setInterval(() => {
        for (let i = 0; i < notFound.length; i++) {
            const newNode = notFound[i];
            const parent = document.querySelector(`[data-id='${newNode.id}'`) as HTMLDivElement;

            if (parent) {
                parents.push(parent);
                parent.style.transition = `transform ${duration}ms ease-out`;
                notFound.splice(i--, 1);
                // Unselect all the nodes ( the nodes can automatically selected when
                // clicking on one of their buttons)
                parent.blur();
                newNode.selected = false;

                //Either they have a new position or the just stay to their original position.
                if (newNode.data.newPosition) {
                    newPositions.push(newNode.data.newPosition as XYPosition);
                    newNode.data.newPosition = undefined;
                } else {
                    newPositions.push(newNode.position);
                }
            }
        }
        // Become true when all the parents where gotten
        if (parents.length === movingNodes.length) {
            setTimeout(() => {
                for (let i = 0; i < movingNodes.length; i++) {
                    movingNodes[i].position = newPositions[i];
                }
                // Recreates the nodes objects to force the re-rendering.
                const nodes = movingNodes.map((node) => {
                    return { ...node };
                });

                setNodes(nodes);
                //Remove the transition animation.
                setTimeout(() => {
                    for (const parent of parents) {
                        parent.style.transition = 'inherit';
                    }
                }, duration);
            }, 100);
            // Stop the interval loop
            clearInterval(interval);
        }
    }, 10);
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
    const nodeClass =
        'visualizer__rectangle' +
        (node.selected ? ' visualizer__selected ' : '') +
        (!data.inProject ? ' visualizer__out-of-project' : '');
    const iconClass = 'visualizer__icon codicon codicon-symbol-' + data.kind;

    const subButtonClass =
        'codicon codicon-' +
        (data.hasChildren === null
            ? data.hierarchy === Hierarchy.CALL
                ? 'call-outgoing'
                : 'type-hierarchy-sub'
            : data.expanded
              ? 'chevron-down'
              : 'chevron-right') +
        ' visualizer__hierarchy-button visualizer__sub-button-' +
        (currentDirection === Direction.RIGHT ? 'right' : 'down') +
        (!data.inProject ? ' visualizer__out-of-project' : '');

    const subButtonBackgroundClass =
        'visualizer__button-background ' +
        'visualizer__sub-button-' +
        (currentDirection === Direction.RIGHT ? 'right' : 'down');

    const superButtonClass =
        'codicon codicon-' +
        (node.data.hierarchy === Hierarchy.CALL ? 'call-incoming' : 'type-hierarchy-super') +
        ' visualizer__hierarchy-button visualizer__super-button-' +
        (currentDirection === Direction.RIGHT ? 'left' : 'up');
    const superButtonBackgroundClass =
        'visualizer__button-background ' +
        'visualizer__super-button-' +
        (currentDirection === Direction.RIGHT ? 'left' : 'up') +
        (!data.inProject ? ' visualizer__out-of-project' : '');

    const superButtonTitle =
        (node.data.expanded ? 'Hide ' : 'Display ') +
        (node.data.hierarchy === Hierarchy.CALL ? 'incoming calls' : 'supertypes');

    const subButtonTitle =
        (node.data.expanded ? 'Hide ' : 'Display ') +
        (node.data.hierarchy === Hierarchy.CALL ? 'outgoing calls' : 'subtypes');

    // Handle windows/linux/macos filesystems
    const fileName = data.string_location.path.replace(/^.*(\\|\/|:)/, '');

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
            waitingBar();
            vscode.postMessage({
                command: 'requestHierarchy',
                data: JSON.stringify({
                    id: data.id,
                    direction: direction,
                    expand:
                        direction === RelationDirection.SUB && data.hasChildren
                            ? !data.expanded
                            : data.expanded,
                    hierarchy: data.hierarchy,
                } as HierarchyMessage),
            });
        },
        [data.id, data.kind, data.expanded, data.hasChildren],
    );

    return (
        <div
            tabIndex={0}
            className={nodeClass}
            data-node-id={data.id}
            title={(data.inProject ? '' : '(out of project) ') + data.label}
        >
            <Handle
                className="visualizer__invis"
                type="target"
                position={currentDirection === Direction.RIGHT ? Position.Left : Position.Top}
                style={{
                    top: currentDirection === Direction.RIGHT ? undefined : '1%',
                    left: currentDirection === Direction.RIGHT ? '1%' : undefined,
                }}
            />
            <Handle
                className="visualizer__invis"
                type="source"
                position={currentDirection === Direction.RIGHT ? Position.Right : Position.Bottom}
                style={{
                    bottom: currentDirection === Direction.RIGHT ? undefined : '1%',
                    right: currentDirection === Direction.RIGHT ? '1%' : undefined,
                }}
            />
            <div className="visualizer__node-title">
                <span className={iconClass} style={{ color: color }}></span>
                <div className={'visualizer__text visualizer__ellipsis-text'}>{data.label}</div>
            </div>
            <div className="visualizer__node-body">
                <div className="visualizer__ellipsis-text">File : {fileName}</div>
                <div className="visualizer__ellipsis-text">
                    Position : {data.string_location.position}
                </div>
            </div>
            <button
                className={superButtonClass}
                title={superButtonTitle}
                style={{ display: data.hasParent === null ? 'inherit' : 'none' }}
                onClick={(event) => {
                    event.preventDefault();
                    requestHierarchy({ direction: RelationDirection.SUPER });
                }}
            ></button>
            <div
                style={{ display: data.hasParent === null ? 'inherit' : 'none' }}
                className={superButtonBackgroundClass}
            ></div>
            <button
                className={subButtonClass}
                title={subButtonTitle}
                // Can also be null so we need to check for false exactly.
                style={{ display: data.hasChildren === false ? 'none' : 'inherit' }}
                onClick={(event) => {
                    event.preventDefault();
                    requestHierarchy({ direction: RelationDirection.SUB });
                }}
            ></button>
            <div
                // Can also be null so we need to check for false exactly.
                style={{ display: data.hasChildren === false ? 'none' : 'inherit' }}
                className={subButtonBackgroundClass}
            ></div>
        </div>
    );
}
