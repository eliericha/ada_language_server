import { useReactFlow, ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { NodeData } from '../visualizerTypes';
import { focusNode } from './utils';

let timeoutId: NodeJS.Timeout | null = null;

/**
 *  Create a search bar allowing to focus on specific node of the graph.
 *
 * @returns A div containing the search bar itself and the list that will contain the child results
 */
export function SearchBar() {
    const { getViewport, getNodes, getNode, setCenter } = useReactFlow();
    const [current, setCurrent] = React.useState(-1);
    const [filteredNodes, setFilteredNodes] = React.useState<React.JSX.Element[]>([]);

    /**
     * Display a dropdown list of nodes that matches the request inputted in the search bar.
     * @param event - The change event
     */
    const onChange = React.useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const nodes = getNodes();
            const search = (event.target as HTMLInputElement).value.toLowerCase();
            if (search.length === 0) {
                setFilteredNodes([]);
                return;
            }

            const searchResults: React.JSX.Element[] = [];
            for (const node of nodes) {
                const data = node.data as NodeData;
                if (data.label.toLowerCase().indexOf(search) > -1) {
                    searchResults.push(
                        <li
                            data-id={node.id}
                            onClick={onListClick}
                            className="visualizer__node-search-item"
                            key={node.id}
                        >
                            {(node.data as NodeData).label}
                        </li>,
                    );
                }
            }
            setFilteredNodes(searchResults);
        },
        [filteredNodes],
    );

    /**
     * Handle the key press to navigate the list and handle the node focus.
     */
    const onKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            const ul = document.getElementById('visualizer__node-search-list') as HTMLUListElement;
            const childs = ul.children;
            if (childs.length === 0) return;
            if (current > -1) childs[current].classList.remove('visualizer__search-selected');
            let newCurrent = current;
            // Go to the previous element in the list (go to the last element in case of underflow)
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                newCurrent = current - 1 >= 0 ? current - 1 : ul.childElementCount - 1;
            }
            // Go to the next element in the list (go to the first element in case of overflow)
            else if (event.key === 'ArrowDown' || event.key === 'Tab') {
                event.preventDefault();
                newCurrent = (current + 1) % ul.childElementCount;
            }
            // Focus the current node on the graph
            else if (event.key === 'Enter' && current !== -1) {
                event.preventDefault();
            }
            // If anything else is typed reset the list
            else {
                newCurrent = -1;
            }

            setCurrent(newCurrent);
            if (newCurrent === -1) return;

            // Focus on the current choice
            const nodeId = childs[newCurrent].getAttribute('data-id');
            if (!nodeId) return;
            const node = getNode(nodeId);
            if (node) focusNode(node, getViewport(), setCenter);

            //Add the class to the current selected option and scroll the list to make sure
            // the element is into view
            childs[newCurrent].classList.add('visualizer__search-selected');
            childs[newCurrent].scrollIntoView({ behavior: 'auto', block: 'nearest' });
        },
        [filteredNodes, current],
    );

    /**
     * Reset the state of the search bar.
     */
    const handleLostFocus = (): void => {
        setFilteredNodes([]);
        setCurrent(-1);
        const searchBar = document.getElementById('visualizer__node-search-bar');
        if (!searchBar) return;
        (searchBar as HTMLInputElement).value = '';
    };

    // Handle the case the user clicks out of the search bar
    // The timeout is added to handle the case where the user clicks on a list item to avoid the
    // whole list to be deleted. The timeout will be cleared in the `onListClick` function called
    // just after this one in the event loop.
    React.useEffect(() => {
        const handleChange = () => {
            timeoutId = setTimeout(() => {
                handleLostFocus();
            }, 50);
        };

        window.addEventListener('change', handleChange);

        return () => {
            window.removeEventListener('change', handleChange);
        };
    }, []);

    // Handle the case where the user mouse when on another window.
    React.useEffect(() => {
        window.addEventListener('blur', handleLostFocus);

        return () => {
            window.removeEventListener('blur', handleLostFocus);
        };
    }, []);

    /**
     * On list item click, focus on the node represented by this item.
     */
    const onListClick = React.useCallback((event: React.MouseEvent<HTMLLIElement>) => {
        event.preventDefault();
        // Interrupt the timeout started in the change event listener so the user can click on
        // multiple option without having to redo the search.
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        const nodeId = (event.target as HTMLLIElement).getAttribute('data-id');
        if (!nodeId) return;
        const node = getNode(nodeId);
        if (node) focusNode(node, getViewport(), setCenter);
    }, []);

    return (
        <ReactFlowProvider>
            <div className="visualizer__node-search">
                <input
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    placeholder="Search symbol name"
                    id="visualizer__node-search-bar"
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                />
                <nav>
                    <ul id="visualizer__node-search-list">{filteredNodes}</ul>
                </nav>
            </div>
        </ReactFlowProvider>
    );
}
