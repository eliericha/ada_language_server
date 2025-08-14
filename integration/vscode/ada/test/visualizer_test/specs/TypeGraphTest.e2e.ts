import { browser, expect } from '@wdio/globals';
import {
    closeVSCodePopUpNotifications,
    fitView,
    getEdge,
    getEdgeDestination,
    getEdges,
    getEdgeSource,
    getIdfromEdge,
    getNodeId,
    getNodes,
    getSubButton,
    getSuperButton,
    openWebView,
    SHA1_LEN,
    SubButtonType,
    zoomOut,
    WebViewName,
} from '../helpers/testUtils';

describe('Test the Type Graph', () => {
    before(async () => {
        // Wait a few seconds to make sure all notifications appear.
        await closeVSCodePopUpNotifications(7000);

        await openWebView('types.adb', 4, 'Qux', WebViewName.TYPE);
    });

    it('should load the right number of node at the beginning', async () => {
        const expectedNodeLen = 3;
        const expectedEdgeLen = 2;

        // Get all the nodes and check if there is the right number.
        const nodes = await getNodes();
        expect(nodes.length).toBe(expectedNodeLen);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);

        await fitView();
        // Wait for the view to be fitted.
        await browser.pause(500);
    });

    it('should increase the number of node when clicking on a sub hierarchy button', async () => {
        const expectedNodeLen = 4;
        const expectedEdgeLen = 3;

        // Get Bar type symbol.
        const nodeId = await getNodeId(5, 11, 'types.adb');

        let nodes = await getNodes();
        let baseLen = nodes.length;

        const { button, buttonType } = await getSubButton(nodeId);
        expect(button).toExist();
        expect(buttonType).toBe(SubButtonType.HIERARCHY);

        await button.click();

        await browser.waitUntil(async () => {
            nodes = await getNodes();
            return baseLen !== nodes.length;
        });

        await fitView();
        // Wait for the view to be fitted.
        await browser.pause(500);

        // There are 3 nodes initially and then 1 more by getting the children of Foo.
        expect(nodes.length).toBe(expectedNodeLen);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });

    it('should increase the number of node when clicking on a super hierarchy button', async () => {
        const expectedNodeLen = 5;
        const expectedEdgeLen = 4;

        // Get Foo type symbol.
        const nodeId = await getNodeId(3, 11, 'types.adb');

        let nodes = await getNodes();
        let baseLen = nodes.length;

        const button = await getSuperButton(nodeId);
        expect(button).toExist();

        await button.click();

        await browser.waitUntil(async () => {
            nodes = await getNodes();
            return baseLen !== nodes.length;
        });

        await fitView();
        // Wait for the view to be fitted.
        await browser.pause(500);

        // The 3 nodes from the previous tests are still there and Foo has 1 parent.
        expect(nodes.length).toBe(expectedNodeLen);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });

    it('should decrease the number of node when folding', async () => {
        const expectedNodeLen = 3;
        const expectedEdgeLen = 2;

        // Get Qux function symbol.
        const nodeId = await getNodeId(4, 11, 'types.adb');

        let nodes = await getNodes();
        let baseLen = nodes.length;

        let { button, buttonType } = await getSubButton(nodeId);

        expect(button).toExist();
        expect(buttonType).toBe(SubButtonType.FOLD_OPENED);

        await button.click();

        await browser.waitUntil(async () => {
            nodes = await getNodes();
            return baseLen !== nodes.length;
        });

        await fitView();
        // Wait for the view to be fitted.
        await browser.pause(500);

        expect(nodes.length).toBe(expectedNodeLen);

        const subButton = await getSubButton(nodeId);

        expect(subButton.button).toExist();
        expect(subButton.buttonType).toBe(SubButtonType.FOLD_CLOSED);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });

    it('should increase the number of node when un-folding', async () => {
        const expectedNodeLen = 5;
        const expectedEdgeLen = 4;

        // Get Qux function symbol.
        const nodeId = await getNodeId(4, 11, 'types.adb');

        let nodes = await getNodes();
        let baseLen = nodes.length;

        let { button, buttonType } = await getSubButton(nodeId);

        expect(button).toExist();
        expect(buttonType).toBe(SubButtonType.FOLD_CLOSED);

        await button.click();

        await browser.waitUntil(async () => {
            nodes = await getNodes();
            return baseLen !== nodes.length;
        });

        await fitView();
        // Wait for the view to be fitted.
        await browser.pause(500);

        expect(nodes.length).toBe(expectedNodeLen);

        const subButton = await getSubButton(nodeId);

        expect(subButton.button).toExist();
        expect(subButton.buttonType).toBe(SubButtonType.FOLD_OPENED);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });
});
