import { browser, expect } from '@wdio/globals';
import {
    fitView,
    getNodeId,
    getNodes,
    getSubButton,
    getSuperButton,
    openWebView,
    SHA1_LEN,
    SubButtonType,
    unZoom,
    WebViewName,
} from '../helpers/testUtils';

before('finish loading extension', async () => {});

describe('Test the Call Graph', () => {
    before(async () => {
        await openWebView('cycle.adb', 13, 'Foo', WebViewName.CALL);

        // Un-zoom to make sur that all object are visible on the plan or else
        // wdio will not find them and the selector will return false results.
        // /!\ Always make sure that every element is visible!
        unZoom(15);
    });

    it('should load the right number of node at the beginning', async () => {
        // Get all the nodes and check if there is the right number.
        const nodes = await getNodes();
        expect(nodes.length).toBe(4);
    });

    it('should increase the number of node when clicking on a sub hierarchy button', async () => {
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

        // There is 4 nodes initially and then 1 more by getting the children of Foo.
        expect(nodes.length).toBe(5);
    });

    it('should increase the number of node when clicking on a super hierarchy button', async () => {
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

        // The 5 nodes from the previous tests are still there and Baz has 2 parents.
        expect(nodes.length).toBe(7);
    });

    it('should decrease the number of node when folding', async () => {
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

        expect(nodes.length).toBe(6);

        const subButton = await getSubButton(nodeId);

        expect(subButton.button).toExist();
        expect(subButton.buttonType).toBe(SubButtonType.FOLD_CLOSED);
    });

    it('should increase the number of node when un-folding', async () => {
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

        await fitView();

        expect(nodes.length).toBe(7);

        const subButton = await getSubButton(nodeId);

        expect(subButton.button).toExist();
        expect(subButton.buttonType).toBe(SubButtonType.FOLD_OPENED);
    });
});
