import { useReactFlow, Node } from '@xyflow/react';
import React from 'react';
import { NodeData } from '../visualizerTypes';

let timeoutId: NodeJS.Timeout | null = null;
/**
 *
 * @returns A div containing the search bar itself and the list that will contain the child results
 */
export function SearchBar() {
    const { getNodes, getNode, setCenter } = useReactFlow();
    const [current, setCurrent] = React.useState(-1);
    const [filteredNodes, setFilteredNodes] = React.useState<React.JSX.Element[]>([]);

    /**
     * Display a dropdown list of nodes that matches the request inputted in the search bar.
     * @param event - The change event
     *
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
                            className="node-search-item"
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

    const focusNode = (nodeId: string) => {
        const node = getNode(nodeId);
        if (!node) return;

        void setCenter(
            node.position.x + (node.width ?? 0) / 2,
            node.position.y + (node.height ?? 0) / 2,
            { duration: 500, zoom: 1 },
        );
    };

    const onKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            const ul = document.getElementById('node-search-list') as HTMLUListElement;
            const childs = ul.children;
            if (current > -1) childs[current].classList.remove('search-selected');
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
                const nodeId = childs[current].getAttribute('data-id');
                if (!nodeId) return;
                focusNode(nodeId);
            }
            // If anything else is typed reset the list
            else {
                newCurrent = -1;
            }

            setCurrent(newCurrent);
            if (newCurrent === -1) return;

            //Add the class to the current selected option and scroll the list to make sure
            // the element is into view
            childs[newCurrent].classList.add('search-selected');
            childs[newCurrent].scrollIntoView({ behavior: 'auto', block: 'nearest' });
        },
        [filteredNodes, current],
    );

    // Reset the start of the search bar.
    const handleLostFocus = (): void => {
        setFilteredNodes([]);
        setCurrent(-1);
        const searchBar = document.getElementById('node-search-bar');
        if (!searchBar) return;
        (searchBar as HTMLInputElement).value = '';
    };

    // Handle the case the user clicks out of the search bar
    // The timeout is added for the case where the user clicks on one of the list item to prevent
    // the whole list to be destroyed before the action is done.
    React.useEffect(() => {
        const handleChange = () => {
            timeoutId = setTimeout(() => {
                handleLostFocus();
            }, 150);
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
        focusNode(nodeId);
    }, []);

    return (
        <div className="node-search">
            <input
                type="search"
                inputMode="search"
                autoComplete="off"
                placeholder="Search symbol name"
                id="node-search-bar"
                onChange={onChange}
                onKeyDown={onKeyDown}
            />
            <nav>
                <ul id="node-search-list">{filteredNodes}</ul>
            </nav>
        </div>
    );
}
