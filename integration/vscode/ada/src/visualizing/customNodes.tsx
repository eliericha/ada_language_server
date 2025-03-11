import * as React from 'react';
import { Handle, Node, NodeProps, Position } from '@xyflow/react';
import './customNodes.css';

type LabelNode = Node<{ label: string }, 'label'>;

const handleStyle = { left: 10 };

export function Triangle({ data, isConnectable }: NodeProps<LabelNode>) {
    return (
        <div className="triangle-up">
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
            <div className="center">{data.label}</div>
        </div>
    );
}

export function Rectangle({ data, isConnectable }: NodeProps<LabelNode>) {
    const [state, setState] = React.useState(false);
    let toolSize = 0;
    const onEnter = React.useCallback(() => {
        setState(true);
    }, []);
    const onLeave = React.useCallback(() => {
        setState(false);
    }, []);
    // Maybe find another way to avoid calling this function on each rerender
    // (cannot memoize it or it will always return 0)
    const getTooltipSize = (el: HTMLDivElement) => {
        if (!el || toolSize != 0) return;
        toolSize = el.getBoundingClientRect().width;
    };

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
            <div
                className="center"
                title={data.label}
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
                ref={getTooltipSize}
            >
                {data.label}
            </div>
            <div
                className="tooltip"
                style={{ visibility: state ? 'visible' : 'hidden' }}
                ref={(el) => {
                    if (!el) return;
                    // If the tooltip would be display (ie the user is overing it) check if this div
                    // is bigger than the node itself
                    // console.log(toolSize);
                    if (state) setState(toolSize < el.getBoundingClientRect().width);
                }}
            >
                {data.label}
            </div>
        </div>
    );
}

export function Trapezoid({ data, isConnectable }: NodeProps<LabelNode>) {
    return (
        <div className="trapezoid">
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
            <div className="center">{data.label}</div>
        </div>
    );
}

export function Circle({ data, isConnectable }: NodeProps<LabelNode>) {
    return (
        <div className="circle hoverable">
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
            <div className="center">{data.label}</div>
        </div>
    );
}

export function Oval({ data, isConnectable }: NodeProps<LabelNode>) {
    return (
        <div className="oval hoverable">
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
            <div className="center">{data.label}</div>
        </div>
    );
}

export function Parallelogram({ data, isConnectable }: NodeProps<LabelNode>) {
    return (
        <div className="parallelogram hoverable">
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
            <div className="center">{data.label}</div>
        </div>
    );
}

export function TextUpdaterNode({ data, isConnectable }: NodeProps<LabelNode>) {
    console.log(data);
    const onChange = React.useCallback((evt: { target: { value: unknown } }) => {
        console.log(evt.target.value);
    }, []);

    return (
        <div className="text-updater-node">
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
            <div>
                <label htmlFor="text">Text:</label>
                <input id="text" name="text" onChange={onChange} className="nodrag" />
            </div>
            <div>{data.label}</div>
            <Handle
                type="source"
                position={Position.Bottom}
                id="a"
                style={handleStyle}
                isConnectable={isConnectable}
            />
            <Handle type="source" position={Position.Bottom} id="b" isConnectable={isConnectable} />
        </div>
    );
}

export default TextUpdaterNode;
