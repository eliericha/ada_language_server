import { browser, expect } from '@wdio/globals';
import {
    clickContextMenuDeleteButton,
    closeVSCodePopUpNotifications,
    fitView,
    getEdge,
    getEdges,
    getIncomingEdges,
    getNodeContextMenu,
    getNodeId,
    getNodes,
    getOutgoingEdges,
    getReferencesItems,
    getSearchItems,
    getSubButton,
    getSuperButton,
    openContextMenuReferencesPicker,
    openEdgeReferencesPicker,
    openNodeContextMenu,
    openWebView,
    setSearchBar,
    SubButtonType,
    WebViewName,
} from '../helpers/testUtils';

describe('Test the Call Graph', async () => {
    before(async () => {
        // Wait a few seconds to make sure all notifications appear.
        await closeVSCodePopUpNotifications(7000);

        await openWebView('cycle.adb', 13, 'Foo', WebViewName.CALL);
    });

    beforeEach(async function () {
        await browser.saveScreenshot(`./dbg-${this.currentTest?.fullTitle()}-before.png`);
    });

    afterEach(async function () {
        await browser.saveScreenshot(`./dbg-${this.currentTest?.fullTitle()}-after.png`);
    });

    it('should load the right number of node at the beginning', async () => {
        const expectedNodeLen = 4;
        const expectedEdgeLen = 3;

        // Get all the nodes and check if there is the right number.
        const nodes = await getNodes();
        expect(nodes.length).toBe(expectedNodeLen);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);

        expect(await fitView()).toBe(true);
        // Wait for the view to be fitted.
        await browser.pause(500);
    });

    it('should increase the number of node when clicking on a sub hierarchy button', async () => {
        const expectedNodeLen = 5;
        const expectedEdgeLen = 5;

        // Get Foo function symbol.
        const nodeId = await getNodeId(3, 9, 'cycle.ads');

        let nodes = await getNodes();
        let baseLen = nodes.length;

        const { button, buttonType } = await getSubButton(nodeId);
        expect(button).toExist();
        expect(buttonType).toBe(SubButtonType.HIERARCHY);

        button.click();

        await browser.waitUntil(async () => {
            nodes = await getNodes();
            return baseLen !== nodes.length;
        });

        expect(await fitView()).toBe(true);
        // Wait for the view to be fitted.
        await browser.pause(1000);

        // There are 4 nodes initially and then 1 more by getting the children of Foo.
        expect(nodes.length).toBe(expectedNodeLen);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });

    it('should have the right number of children and parent on a node', async () => {
        const expectedIncomingLen = 4;
        const expectedOutgoingLen = 2;

        // Get Foo function symbol.
        const nodeId = await getNodeId(3, 9, 'cycle.ads');
        const incEdge = await getIncomingEdges(nodeId);
        const outEdge = await getOutgoingEdges(nodeId);

        expect(incEdge.length).toBe(expectedIncomingLen);
        expect(outEdge.length).toBe(expectedOutgoingLen);
    });

    it('should increase the number of node when clicking on a super hierarchy button', async () => {
        const expectedNodeLen = 7;
        const expectedEdgeLen = 7;

        // Get Baz function symbol.
        const nodeId = await getNodeId(4, 12, 'cycle.adb');

        let nodes = await getNodes();
        let baseLen = nodes.length;

        const button = await getSuperButton(nodeId);
        expect(button).toExist();

        button.click();

        await browser.waitUntil(async () => {
            nodes = await getNodes();
            return baseLen !== nodes.length;
        });

        expect(await fitView()).toBe(true);
        // Wait for the view to be fitted.
        await browser.pause(500);

        // The 5 nodes from the previous tests are still there and Baz has 2 parents.
        expect(nodes.length).toBe(expectedNodeLen);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });

    it('should decrease the number of node when folding', async () => {
        const expectedNodeLen = 6;
        const expectedEdgeLen = 5;

        // Get Foo function symbol.
        const nodeId = await getNodeId(3, 9, 'cycle.ads');

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

        expect(await fitView()).toBe(true);
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
        const expectedNodeLen = 7;
        const expectedEdgeLen = 7;

        // Get Foo function symbol.
        const nodeId = await getNodeId(3, 9, 'cycle.ads');

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

        expect(await fitView()).toBe(true);
        // Wait for the view to be fitted.
        await browser.pause(500);

        expect(nodes.length).toBe(expectedNodeLen);

        const subButton = await getSubButton(nodeId);

        expect(subButton.button).toExist();
        expect(subButton.buttonType).toBe(SubButtonType.FOLD_OPENED);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });

    it('should display result when inputing text in the search bar', async function () {
        // Limite the timeout of this test to 5 seconds. Need async function () to work.
        this.timeout(5000);

        const expectedItemsLen = 3;
        expect(await setSearchBar('B')).toBe(true);

        let searchItems = await getSearchItems();

        while (searchItems.length === 0) {
            searchItems = await getSearchItems();
        }

        expect(searchItems.length).toBe(expectedItemsLen);
    });

    it('should open the context menu when right clicking on a node', async () => {
        // Get Foo function symbol.
        const nodeId = await getNodeId(3, 9, 'cycle.ads');

        expect(await openNodeContextMenu(nodeId)).toBe(true);

        // Wait for the ContextMenu to open.
        await browser.pause(1000);

        const contextMenu = await getNodeContextMenu();

        expect(contextMenu.error).toBe(undefined);
    });

    it('should open the references context menu when hovering the references button in context menu', async () => {
        const expectedReferencesLen = 26;
        await openContextMenuReferencesPicker();

        // Wait for the References Picker to open.
        await browser.pause(1000);

        const referencesItems = await getReferencesItems(true);

        expect(referencesItems.length).toBe(expectedReferencesLen);
    });

    it('should delete the node when selecting the delete button', async () => {
        const expectedNodeLen = 6;
        const expectedEdgeLen = 2;
        let nodes = await getNodes();
        const baseLen = nodes.length;

        await clickContextMenuDeleteButton();

        await browser.waitUntil(async () => {
            nodes = await getNodes();
            return baseLen !== nodes.length;
        });

        expect(await fitView()).toBe(true);
        // Wait for the view to be fitted.
        await browser.pause(500);

        expect(nodes.length).toBe(expectedNodeLen);

        const edges = await getEdges();
        expect(edges.length).toBe(expectedEdgeLen);
    });

    it('should open the references picker when hovering an edge', async () => {
        const expectedReferencesLen = 1;

        const nodeId = await getNodeId(4, 12, 'cycle.adb');
        const nodeId2 = await getNodeId(48, 12, 'cycle.adb');

        const edge = await getEdge(nodeId, nodeId2);

        expect(edge.error).toBe(undefined);

        await openEdgeReferencesPicker(edge);

        // Wait for the references menu to open;
        await browser.pause(2000);

        const referencesItems = await getReferencesItems(true);

        expect(referencesItems.length).toBe(expectedReferencesLen);
    });
});
