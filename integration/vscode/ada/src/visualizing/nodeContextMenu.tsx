import { Node, ReactFlowProvider } from '@xyflow/react';
import React, { KeyboardEvent } from 'react';
import { vscode } from './App';
import {
    Hierarchy,
    HierarchyMessage,
    NodeData,
    NodeIdsMessage,
    RelationDirection,
    RevealReferencesMessage,
    StringLocation,
} from '../visualizerTypes';
import { setIntervalCapped, waitingBar } from './utils';
import { referencesPickerOnClick, referencesPickerOnKeyDown } from './referencesPickerMenu';

export type NodeContextMenuProps = {
    node: Node;
    top: number | undefined;
    left: number | undefined;
    right: number | undefined;
    bottom: number | undefined;
    // locations: StringLocation[];
    locationsMap: Map<string, StringLocation[]>;
    pane: DOMRect;
    onContextClose: () => void;
    deleteNodes: (toDeleteId: string[], recursive: boolean) => void;
};
// Store the id of the timeout used for closing the menu.
let intervalId: NodeJS.Timeout | null = null;

/**
 * Open a menu with different options on node click
 *
 * @param props  - Data passed to the context menu
 * @returns a div containing a context menu for a specific node
 */
export function NodeContextMenu(props: NodeContextMenuProps) {
    const [locations, setLocations] = React.useState<React.JSX.Element[]>([]);
    const [current, setCurrent] = React.useState(-1);
    const [canClose, setCanClose] = React.useState(true);
    const [referencesMap, setReferencesMap] = React.useState<
        Map<React.JSX.Element, React.JSX.Element[]>
    >(new Map());
    void setReferencesMap;
    void setLocations;

    // Close the context menu if the mouse leave the window
    React.useEffect(() => {
        const handleLostFocus = (): void => {
            if (canClose) {
                props.onContextClose();
            }
        };

        window.addEventListener('blur', handleLostFocus);

        return () => {
            window.removeEventListener('blur', handleLostFocus);
        };
    }, [canClose]);

    /**
     * Send a refresh node request to the server side.
     */
    const refreshNode = React.useCallback(() => {
        waitingBar();
        vscode.postMessage({
            command: 'refreshNodes',
            data: { nodesId: [props.node.id] } as NodeIdsMessage,
        });
        props.onContextClose();
    }, [props.node.id]);

    /**
     * Send a delete node request to the server side.
     */
    const deleteNode = React.useCallback(() => {
        props.deleteNodes([props.node.id], false);
        props.onContextClose();
    }, [props.node]);

    /**
     * Send a hierarchy request to the server side.
     */
    const requestHierarchy = React.useCallback(
        (event: React.MouseEvent, direction = RelationDirection.SUPER) => {
            event.preventDefault();
            const hierarchy = (props.node.data as NodeData).hierarchy;
            waitingBar();
            vscode.postMessage({
                command: 'requestHierarchy',
                data: {
                    id: props.node.id,
                    direction: direction,
                    expand: props.node.data.expanded,
                    hierarchy: hierarchy,
                    recursive: event.ctrlKey,
                } as HierarchyMessage,
            });
            props.onContextClose();
        },
        [props.node.data.expand, props.node.id, props.node.data.kind],
    );

    /**
     * Open the references picker sub list when hovering the corresponding button.
     */
    const onMouseEnter = React.useCallback(() => {
        const list = document.getElementsByClassName('visualizer__references-picker-menu');
        // Show the menu only if there is something to display.
        if (list.length > 0) (list[0] as HTMLElement).style.visibility = 'visible';
        if (props.locationsMap.size === 0) {
            vscode.postMessage({
                command: 'revealReferences',
                data: {
                    referenceNodeId: props.node.id,
                    targetNodeId: '',
                } as RevealReferencesMessage,
            });
        }
        if (intervalId !== null) clearInterval(intervalId);
        // Try to focus on the list, retry until it works once.
        intervalId = setIntervalCapped(
            () => {
                const ul = document.getElementById(
                    'visualizer__context-references-button',
                ) as HTMLUListElement;
                if (ul) {
                    ul.focus();
                    if (intervalId !== null) clearInterval(intervalId);
                    intervalId = null;
                }
            },
            50,
            50,
        );
    }, []);

    /**
     * Hide the references list when the use is not hovering the references button.
     */
    const onMouseLeave = React.useCallback(() => {
        const list = document.getElementsByClassName('visualizer__references-picker-menu');
        if (list.length > 0) (list[0] as HTMLElement).style.visibility = 'hidden';
    }, []);

    /**
     * Send a request to reveal the location of the list item being currently hovered.
     */
    const onClick = React.useCallback(
        (event: React.MouseEvent<HTMLLIElement>) => {
            referencesPickerOnClick(event, props.locationsMap, setCanClose, props.onContextClose);
        },
        [props.locationsMap],
    );

    /**
     * Update the current position of the user in the location list and reveal the update position.
     */
    const onKeyDown = React.useCallback(
        (event: React.KeyboardEvent) => {
            referencesPickerOnKeyDown(
                event,
                current,
                setCurrent,
                setCanClose,
                props.onContextClose,
                props.locationsMap,
                'visualizer__context-references-button',
            );
        },
        [current],
    );

    // If no locations has been registered yet create all the list elements.
    if (locations.length === 0) {
        for (const key of props.locationsMap.keys()) {
            const stringLocation = props.locationsMap.get(key);
            if (!stringLocation || stringLocation.length === 0) continue;
            const fileName = stringLocation[0].path.replace(/^.*(\\|\/|:)/, '');
            const headerName = `${key}: ${fileName}`;
            const header = (
                <li
                    className={
                        'visualizer__references-picker-item' +
                        ' visualizer__references-picker-header' +
                        ' visualizer__ellipsis-text'
                    }
                    key={headerName}
                    data-header={headerName}
                    title={stringLocation[0].path}
                >
                    <span>{headerName}</span>
                </li>
            );
            referencesMap.set(header, []);
            locations.push(header);
            stringLocation.forEach((location) => {
                // Handle windows/linux/macos filesystems
                const loc = `${location.string_location}`;
                const position = (
                    <li
                        className="visualizer__references-picker-item"
                        onClick={onClick}
                        key={loc}
                        data-string-loc={location.string_location}
                        title={loc}
                        style={{ textIndent: '1em' }}
                    >
                        {loc}
                    </li>
                );
                referencesMap.get(header)?.push(position);
                locations.push(position);
            });
        }
    }

    let left: number | undefined = undefined;
    let right: number | undefined = undefined;
    let bottom: number | undefined = undefined;
    const subContent =
        'Get ' +
        (props.node.data.hierarchy === Hierarchy.CALL
            ? 'Outgoing Calls'
            : props.node.data.hierarchy === Hierarchy.TYPE
              ? 'Sub Types'
              : 'imported packages');
    const superContent =
        'Get ' +
        (props.node.data.hierarchy === Hierarchy.CALL
            ? 'Incoming Calls'
            : props.node.data.hierarchy === Hierarchy.TYPE
              ? 'Super Types'
              : 'importing packages');

    const pickerMenuWidth = 200;
    const pickerMenuHeight = 200;
    // In case the menu is to close from the top or the bottom add a little space for visibility.
    const padding = 20;
    const contextButton = document.getElementById('visualizer__context-references-button');
    if (contextButton) {
        const rect = contextButton.getBoundingClientRect();

        // A location item is more or less half the size of the references button.
        let menu_height = (rect.height / 2) * locations.length;
        if (menu_height > pickerMenuHeight) menu_height = pickerMenuHeight;
        bottom = rect.height / 2;
        // Handle the case where the menu overflow through the bottom of the window.
        if (rect.bottom + menu_height / 2 > props.pane.height) {
            //Divide by 2 at this end because of the transformY(-50%) in the css.
            bottom += (rect.bottom + menu_height / 2 - props.pane.height) / 2 + padding;
        }
        // The menu can't over flow through the top as it's max size is less than the whole
        // context menu.

        // Handle the overflow through the sides.
        if (rect.right + pickerMenuWidth < props.pane.width) {
            left = rect.width;
            right = undefined;
        } else {
            right = rect.width;
            left = undefined;
        }
    }
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
                    onClick={(event) => requestHierarchy(event, RelationDirection.SUB)}
                >
                    {subContent}
                </button>
                <button
                    className="visualizer__context-button"
                    onClick={(event) => requestHierarchy(event, RelationDirection.SUPER)}
                >
                    {superContent}
                </button>
                {(props.node.data as NodeData).hierarchy !== Hierarchy.PACKAGE && (
                    <button
                        className="visualizer__context-button"
                        id="visualizer__context-references-button"
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        onKeyDown={onKeyDown}
                    >
                        <span> Go to References </span>{' '}
                        <div className="codicon codicon-chevron-right" />
                        <div
                            className={
                                'visualizer__references-picker-menu' +
                                ' visualizer__references-picker-node-menu'
                            }
                            style={{
                                left: left,
                                right: right,
                                bottom: bottom,
                            }}
                        >
                            <nav>
                                <ul
                                    id="visualizer__references-picker-list"
                                    className="visualizer__scrollbar"
                                    tabIndex={0}
                                >
                                    {locations}
                                </ul>
                            </nav>
                        </div>
                    </button>
                )}
            </div>
        </ReactFlowProvider>
    );
}
