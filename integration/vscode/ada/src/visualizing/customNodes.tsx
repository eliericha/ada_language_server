import * as React from 'react';
import { Handle, Node, NodeProps, Position } from '@xyflow/react';
import './customNodes.css';
import { NodeData, RelationDirection } from '../vizualizerTypes';

type DataNode = Node<NodeData, 'data'>;

const vscode = acquireVsCodeApi();
export const nodeTypes = {
    rectangle: Rectangle,
};

const nodeString: string[] = ['rectangle'];
export function nodeFactory(x: number, y: number, data: NodeData) {
    const { ...objData } = data;
    return {
        id: data.label,
        type: nodeString[0],
        position: { x: x, y: y },
        data: objData,
    };
}
// var(--vscode-symbolIcon-arrayForeground)
export function Rectangle({ data, isConnectable }: NodeProps<DataNode>) {
    const requestTypes = React.useCallback(({ direction = RelationDirection.Out }) => {
        vscode.postMessage({
            command: 'requestTypes',
            data: JSON.stringify({ location: data.location, direction: direction }),
        });
    }, []);
    const iconClassName = 'icon codicon codicon-symbol-' + data.kind;
    const color = 'var(--vscode-symbolIcon-' + data.kind + 'Foreground';
    return (
        <div className="rectangle hoverable">
            <Handle
                className="invis"
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
            />
            <Handle
                className="invis"
                type="source"
                position={Position.Bottom}
                id="b"
                isConnectable={isConnectable}
            />
            <div className="title">
                <span className={iconClassName} style={{ color: color }}></span>
                <div className="text"> {data.label}</div>
            </div>
            <div className="center" title={data.label}>
                {data.label}
            </div>
            <button
                className="codicon codicon-type-hierarchy-sub button subButton"
                title="Add subtypes to the graph"
                onClick={() => requestTypes({ direction: RelationDirection.In })}
            ></button>
            <button
                className="codicon codicon-type-hierarchy-super button superButton"
                title="Add supertypes to the graph"
                onClick={() => requestTypes({ direction: RelationDirection.Out })}
            ></button>
        </div>
    );
}
