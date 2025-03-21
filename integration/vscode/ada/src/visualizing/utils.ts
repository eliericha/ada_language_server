import { Hierarchy } from '../visualizerTypes';

/**
 * Helper function to return the type of Hierarchy needing to be called depending on the kind of
 * the node.
 * As vscode cannot be imported here, it can't be used to compare the kind parameter.
 *
 * @param kind - the symbol kind of a node.
 * @returns
 */
export function getNodeKind(kind: string) {
    if (kind === 'Class' || kind === 'Object') return Hierarchy.TYPES;
    return Hierarchy.CALL;
}
