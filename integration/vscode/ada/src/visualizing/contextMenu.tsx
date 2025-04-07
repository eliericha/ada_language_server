import { XYPosition, Node, ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { vscode } from './App';
import { NodeIdsMessage } from '../visualizerTypes';

export type ContextMenuProps = {
    onContextClose: () => void;
    onNodeDelete: (toDelete: Node[]) => void;
    position: XYPosition;
    node: Node;
};

/**
 * Open a menu with different options on node click
 *
 * @param props  - Data passed to the context menu
 * @returns a div containing a context menu for a specific node
 */
export function ContextMenu(props: ContextMenuProps) {
    const refreshNode = React.useCallback(() => {
        vscode.postMessage({
            command: 'refreshNodes',
            data: JSON.stringify({ nodesId: [props.node.id] } as NodeIdsMessage),
        });
    }, [props.node.id]);

    const deleteNode = React.useCallback(() => {
        props.onNodeDelete([props.node]);
    }, [props.node]);

    return (
        <ReactFlowProvider>
            <div
                style={{
                    left: props.position.x,
                    top: props.position.y,
                }}
                className="context-menu"
                onMouseLeave={props.onContextClose}
            >
                <button className="context-button" onClick={refreshNode}>
                    Refresh Node
                </button>
                <button className="context-button" onClick={deleteNode}>
                    Delete Node
                </button>
            </div>
        </ReactFlowProvider>
    );
}
