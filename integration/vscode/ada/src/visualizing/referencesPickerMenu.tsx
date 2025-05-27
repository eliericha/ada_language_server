import { Edge, Node, ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { NodeData, StringLocation } from '../visualizerTypes';
import { vscode } from './App';
import { setIntervalCapped } from './utils';

export type ReferencesPickerMenuProps = {
    onReferencesPickerClose: () => void;
    top: number;
    left: number;
    edge: Edge;
    target: Node;
    source: Node;
    openedByClick: boolean;
    locationsMap: Map<string, StringLocation[]>;
    menuWidth: number;
    pane: DOMRect;
};

// Store the id of the interval used to focus on the menu.
let intervalId: NodeJS.Timeout | null = null;

/**
 * Handle the displacement of the user in the picker menu using the keyboard.
 *
 * @param event - The react keyboard event.
 * @param current - The index of the current choice (or -1 if no selection).
 * @param setCurrent - Modify the index's state.
 * @param closeFunction - The function to close the menu.
 * @param props - The object containing the information
 * @param locations - The different references locations the user can choose from.
 * @param elementId - The id of the element in the DOM used to focus on it.
 */
export function referencesPickerOnKeyDown(
    event: React.KeyboardEvent,
    current: number,
    setCurrent: (value: React.SetStateAction<number>) => void,
    setCanClose: React.Dispatch<React.SetStateAction<boolean>>,
    closeFunction: () => void,
    locationsMap: Map<string, StringLocation[]>,
    elementId: string,
) {
    let newCurrent = current;
    const ul = document.getElementById('visualizer__references-picker-list') as HTMLUListElement;
    const childs = ul.children;

    // Unselect the current select item if it exists.
    if (current > -1)
        childs[current].classList.remove('visualizer__references-picker-item-selected');

    // Go to the previous element in the list (go to the last element in case of underflow)
    if (event.key === 'ArrowDown' || event.key === 'Tab') {
        event.preventDefault();
        newCurrent = current;
        do {
            newCurrent = (newCurrent + 1) % ul.childElementCount;
        } while (childs[newCurrent].classList.contains('visualizer__references-picker-header'));
    }
    // Go to the previous element in the list (go to the last element in case of underflow)
    else if (event.key === 'ArrowUp') {
        event.preventDefault();
        newCurrent = current;
        do {
            newCurrent = newCurrent - 1 >= 0 ? newCurrent - 1 : ul.childElementCount - 1;
        } while (childs[newCurrent].classList.contains('visualizer__references-picker-header'));
    }
    // Close the references picker when the user presses escape.
    else if (event.key === 'Escape') {
        closeFunction();
        return;
    }

    setCurrent(newCurrent);
    if (newCurrent === -1) return;

    // Reveal the location of the current item in the code.
    const location_string = childs[newCurrent].getAttribute('data-string-loc');
    if (!location_string) return;
    const location = Array.from(locationsMap.values())
        .flat()
        .find((location) => location.string_location === location_string);

    vscode.postMessage({
        command: 'revealLocation',
        data: JSON.stringify(location),
    });

    // If the enter key was not pressed, refocus on the  list.
    if (event.key !== 'Enter') {
        setCanClose(false);
        const intervalId = setIntervalCapped(
            () => {
                const ul = document.getElementById(elementId) as HTMLUListElement;
                if (ul) {
                    ul.focus();
                    clearInterval(intervalId);
                    setCanClose(true);
                }
            },
            50,
            50,
        );
    } else {
        setCanClose(true);
    }

    childs[newCurrent].classList.add('visualizer__references-picker-item-selected');
    childs[newCurrent].scrollIntoView({ behavior: 'auto', block: 'nearest' });
}

/**
 * Handle the user click in the picker menu.
 *
 * @param event - The react mouse event.
 * @param locations - The different references locations the user can choose from.
 * @param closeFunction - The function to close the menu.
 */
export function referencesPickerOnClick(
    event: React.MouseEvent<HTMLLIElement>,
    locationsMap: Map<string, StringLocation[]>,
    setCanClose: React.Dispatch<React.SetStateAction<boolean>>,
    closeFunction: () => void,
) {
    event.preventDefault();
    setCanClose(true);
    const location_string = (event.target as HTMLLIElement).getAttribute('data-string-loc');
    if (!location_string) return;
    // Get the locations associated with the list item clicked.
    const location = Array.from(locationsMap.values())
        .flat()
        .find((location) => location.string_location === location_string);
    vscode.postMessage({
        command: 'revealLocation',
        data: JSON.stringify(location),
    });
    closeFunction();
}

/**
 * Open a menu with the location of all the references of of the symbol contained in
 * the target node.
 *
 * @param props - Data passed to the context menu
 * @returns a div containing a context menu filled with location for a specific edge.
 */
export function ReferencesPickerMenu(props: ReferencesPickerMenuProps) {
    const [current, setCurrent] = React.useState(-1);
    const [send, setSend] = React.useState(false);
    const [canClose, setCanClose] = React.useState(true);
    const locations: React.JSX.Element[] = [];

    /**
     * When the user move through the list, the mouse briefly goes to the code window
     * before being refocused on the menu. To avoid the menu being closed during that time,
     * ignore the call back if the menu "can't close" (when the user did not press enter or clicked
     * on an item).
     */
    const handleLostFocus = React.useCallback(() => {
        if (canClose) {
            const edgeMenu = document.getElementsByClassName('visualizer__references-picker-menu');
            if (edgeMenu.length > 0) {
                edgeMenu[0].classList.add('visualizer__close');
            }
            console.log(canClose);
            setTimeout(() => {
                props.onReferencesPickerClose();
            }, 300);
        }
    }, [canClose]);

    // Close the context menu if the mouse leave the window
    React.useEffect(() => {
        window.addEventListener('blur', handleLostFocus);

        return () => {
            window.removeEventListener('blur', handleLostFocus);
        };
    }, [canClose]);

    /**
     * Send a request to reveal the location of the list item being currently hovered.
     */
    const onClick = React.useCallback(
        (event: React.MouseEvent<HTMLLIElement>) => {
            referencesPickerOnClick(event, props.locationsMap, setCanClose, handleLostFocus);
        },
        [props.locationsMap, canClose],
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
                props.onReferencesPickerClose,
                props.locationsMap,
                'visualizer__references-picker-list',
            );
        },
        [current, canClose],
    );

    // If the user clicked on the edge and there is only one element directly reveal this location.
    if (
        props.locationsMap.size === 1 &&
        Array.from(props.locationsMap.values())[0].length === 1 &&
        props.openedByClick
    ) {
        if (!send) {
            setSend(true);

            vscode.postMessage({
                command: 'revealLocation',
                data: JSON.stringify(Array.from(props.locationsMap.values())[0][0]),
            });
        }
        return;
    }

    if (props.locationsMap.size > 0) {
        for (const key of props.locationsMap.keys()) {
            const stringLocation = props.locationsMap.get(key);
            if (!stringLocation || stringLocation.length === 0) continue;
            const fileName = stringLocation[0].path.replace(/^.*(\\|\/|:)/, '');
            stringLocation.forEach((location) => {
                const loc = `${fileName} : ${location.string_location}`;
                locations.push(
                    <li
                        className="visualizer__references-picker-item"
                        onClick={onClick}
                        key={loc}
                        data-string-loc={location.string_location}
                        title={loc}
                    >
                        {location.string_location}
                    </li>,
                );
            });
        }
    } else {
        locations.push(
            <li className='"visualizer__references-picker-item' key="No references">
                No references found
            </li>,
        );
    }

    if (intervalId !== null) clearInterval(intervalId);
    // Try to focus on the list, retry until it works once.
    intervalId = setIntervalCapped(
        () => {
            const ul = document.getElementById(
                'visualizer__references-picker-list',
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

    let top = props.top;
    const menuMaxHeight = 220;
    const padding = 10;
    // Here the search bar is used as its width is equivalent to two references locations item.
    const searchBar = document.getElementById('visualizer__node-search-bar');
    if (searchBar !== null) {
        const rect = searchBar.getBoundingClientRect();
        // The total height is the sum of all the item + the title and a bit of padding.
        let menuHeight = rect.height * locations.length + 2 * rect.height;
        if (menuHeight > menuMaxHeight) menuHeight = menuMaxHeight;
        if (top - menuHeight / 2 < 0) {
            top += menuHeight / 2 - top + padding;
        } else if (top + menuHeight / 2 > props.pane.height) {
            top += props.pane.height - (top + menuHeight / 2) - padding;
        }
    }

    const referencesNb = Array.from(props.locationsMap.values()).reduce(
        (acc, arr) => acc + arr.length,
        0,
    );
    const pickerTitle = `REFERENCES (${referencesNb})`;
    const title =
        props.locationsMap.size === 0
            ? undefined
            : `References of ${(props.source.data as NodeData).label}` +
              ` in ${(props.target.data as NodeData).label} at` +
              ` ${Array.from(props.locationsMap.values())[0][0].path}`;

    return (
        <ReactFlowProvider>
            <div
                style={{
                    left: props.left,
                    top: top,
                }}
                className={
                    'visualizer__references-picker-menu' +
                    ' visualizer__references-picker-edge-menu'
                }
                onMouseLeave={() => handleLostFocus()}
            >
                <div
                    className="visualizer__ellipsis-text visualizer__references-picker-title"
                    title={title}
                >
                    {pickerTitle}
                </div>
                <nav>
                    <ul
                        id="visualizer__references-picker-list"
                        className="visualizer__scrollbar"
                        onKeyDown={onKeyDown}
                        tabIndex={0}
                    >
                        {locations}
                    </ul>
                </nav>
            </div>
        </ReactFlowProvider>
    );
}
