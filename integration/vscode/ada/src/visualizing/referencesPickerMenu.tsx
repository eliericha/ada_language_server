import { Edge, Node, ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { NodeData, StringLocation } from '../visualizerTypes';
import { vscode } from './App';

export type ReferencesPickerMenuProps = {
    onReferencesPickerClose: () => void;
    top: number;
    left: number;
    edge: Edge;
    target: Node;
    source: Node;
    openedByClick: boolean;
    locations: StringLocation[];
    menuWidth: number;
    pane: DOMRect;
};

// Store the id of the interval used to focus on the menu.
let intervalId: NodeJS.Timeout | null = null;

// Store the id of the timeout used for closing the menu.
let timeoutId: NodeJS.Timeout | null = null;

/**
 * Set the timeoutId from other files in order to factorize code.
 *
 * @param id - The id of the timeoutInstance.
 */
export function setTimeoutId(id: NodeJS.Timeout | null) {
    timeoutId = id;
}

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
    closeFunction: () => void,
    locations: StringLocation[],
    elementId: string,
) {
    let newCurrent = current;
    const ul = document.getElementById('visualizer__references-picker-list') as HTMLUListElement;
    const childs = ul.children;

    if (current > -1)
        childs[current].classList.remove('visualizer__references-picker-item-selected');

    // Go to the previous element in the list (go to the last element in case of underflow)
    if (event.key === 'ArrowDown' || event.key === 'Tab') {
        event.preventDefault();
        newCurrent = (current + 1) % ul.childElementCount;
    }
    // Go to the previous element in the list (go to the last element in case of underflow)
    else if (event.key === 'ArrowUp') {
        event.preventDefault();
        newCurrent = current - 1 >= 0 ? current - 1 : ul.childElementCount - 1;
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
    const location = locations.find((location) => location.string_location === location_string);
    vscode.postMessage({
        command: 'revealLocation',
        data: JSON.stringify(location),
    });

    if (event.key !== 'Enter') {
        setTimeout(() => {
            const ul = document.getElementById(elementId) as HTMLUListElement;
            if (ul) {
                ul.focus();
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = null;
            }
        }, 50);
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
    locations: StringLocation[],
    closeFunction: () => void,
) {
    event.preventDefault();
    const location_string = (event.target as HTMLLIElement).getAttribute('data-string-loc');
    if (!location_string) return;
    const location = locations.find((location) => location.string_location === location_string);
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
    const locations: React.JSX.Element[] = [];

    /**
     * When the user move through the list, the mouse briefly goes to the code window
     * before being refocused on the menu. To avoid the menu being close during that time,
     * a slight delai is added so the mouse have a chance to return to its original window.
     */
    const handleLostFocus = () => {
        timeoutId = setTimeout(() => {
            const edgeMenu = document.getElementsByClassName('visualizer__references-picker-menu');
            if (edgeMenu.length > 0) {
                edgeMenu[0].classList.add('visualizer__close');
            }
            setTimeout(() => {
                props.onReferencesPickerClose();
            }, 300);
        }, 100);
    };

    // Close the context menu if the mouse leave the window
    React.useEffect(() => {
        window.addEventListener('blur', handleLostFocus);

        return () => {
            window.removeEventListener('blur', handleLostFocus);
        };
    }, []);

    /**
     * Send a request to reveal the location of the list item being currently hovered.
     */
    const onClick = React.useCallback(
        (event: React.MouseEvent<HTMLLIElement>) => {
            referencesPickerOnClick(event, props.locations, handleLostFocus);
        },
        [props.locations],
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
                props.onReferencesPickerClose,
                props.locations,
                'visualizer__references-picker-list',
            );
        },
        [current],
    );

    // If the user clicked on the edge and there is only one element directly reveal this location.
    if (props.locations.length === 1 && props.openedByClick) {
        if (!send) {
            setSend(true);

            vscode.postMessage({
                command: 'revealLocation',
                data: JSON.stringify(props.locations[0]),
            });
        }
        return;
    }

    if (props.locations.length > 0) {
        props.locations.forEach((location) => {
            // Handle windows/linux/macos filesystems
            const fileName = props.locations[0].path.replace(/^.*(\\|\/|:)/, '');
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
    } else {
        locations.push(
            <li className='"visualizer__references-picker-item' key="No references">
                No references found
            </li>,
        );
    }

    if (intervalId !== null) clearInterval(intervalId);
    // Try to focus on the list, retry until it works once.
    intervalId = setInterval(() => {
        const ul = document.getElementById(
            'visualizer__references-picker-list',
        ) as HTMLUListElement;
        if (ul) {
            ul.focus();
            if (intervalId !== null) clearInterval(intervalId);
            intervalId = null;
        }
    }, 50);

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

    const pickerTitle = `REFERENCES (${props.locations.length})`;
    const title =
        props.locations.length === 0
            ? ''
            : `References of ${(props.source.data as NodeData).label}` +
              ` in ${(props.target.data as NodeData).label} at ${props.locations[0].path}`;

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
