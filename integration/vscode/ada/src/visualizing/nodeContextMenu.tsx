import { Node, ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { vscode } from './App';
import {
    Hierarchy,
    HierarchyMessage,
    NodeData,
    NodeIdsMessage,
    RelationDirection,
} from '../visualizerTypes';
import { getNodeKind, waitingBar } from './utils';

export type NodeContextMenuProps = {
    onContextClose: () => void;
    onNodeDelete: (toDelete: Node[]) => void;
    top: number | undefined;
    left: number | undefined;
    right: number | undefined;
    bottom: number | undefined;
    node: Node;
};

/**
 * Open a menu with different options on node click
 *
 * @param props  - Data passed to the context menu
 * @returns a div containing a context menu for a specific node
 */
export function NodeContextMenu(props: NodeContextMenuProps) {
    // Close the context menu if the mouse leave the window
    React.useEffect(() => {
        const handleLostFocus = (): void => {
            props.onContextClose();
        };

        window.addEventListener('blur', handleLostFocus);

        return () => {
            window.removeEventListener('blur', handleLostFocus);
        };
    }, []);

    /**
     * Send a refresh node request to the server side.
     */
    const refreshNode = React.useCallback(() => {
        waitingBar();
        vscode.postMessage({
            command: 'refreshNodes',
            data: JSON.stringify({ nodesId: [props.node.id] } as NodeIdsMessage),
        });
        props.onContextClose();
    }, [props.node.id]);

    /**
     * Send a delete node request to the server side.
     */
    const deleteNode = React.useCallback(() => {
        props.onNodeDelete([props.node]);
        props.onContextClose();
    }, [props.node]);

    /**
     * Send a hierarchy request to the server side.
     */
    const requestHierarchy = React.useCallback(
        ({ direction = RelationDirection.SUPER }) => {
            const kind = (props.node.data as NodeData).kind;
            const hierarchy = getNodeKind(kind);
            waitingBar();
            vscode.postMessage({
                command: 'requestHierarchy',
                data: JSON.stringify({
                    id: props.node.id,
                    direction: direction,
                    expand:
                        direction === RelationDirection.SUB
                            ? !props.node.data.expanded
                            : props.node.data.expanded,
                    hierarchy: hierarchy,
                } as HierarchyMessage),
            });
            props.onContextClose();
        },
        [props.node.data.expand, props.node.id, props.node.data.kind],
    );

    const subContent =
        'Get ' + (props.node.data.hierarchy === Hierarchy.CALL ? 'Outgoing Calls' : 'Sub Types');
    const superContent =
        'Get ' + (props.node.data.hierarchy === Hierarchy.CALL ? 'Incoming Calls' : 'Super Types');

    return (
        <ReactFlowProvider>
            <div
                style={{
                    left: props.left,
                    top: props.top,
                    right: props.right,
                    bottom: props.bottom,
                }}
                className="visualizer__node-context-menu"
            >
                <button className="visualizer__context-button" onClick={refreshNode}>
                    Refresh Node
                </button>
                <button className="visualizer__context-button" onClick={deleteNode}>
                    Delete Node
                </button>
                <button
                    className="visualizer__context-button"
                    onClick={() => requestHierarchy({ direction: RelationDirection.SUB })}
                >
                    {subContent}
                </button>
                <button
                    className="visualizer__context-button"
                    onClick={() => requestHierarchy({ direction: RelationDirection.SUPER })}
                >
                    {superContent}
                </button>
            </div>
        </ReactFlowProvider>
    );
}
