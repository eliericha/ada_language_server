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

describe('Test the Type Graph', () => {
    before(async () => {
        await openWebView('types.adb', 4, 'Qux', WebViewName.TYPE);
        // Un-zoom to make sur that all object are visible on the plan or else
        // wdio will not find them and the selector will return false results.
        // /!\ Always make sure that every element is visible!
        unZoom(15);
    });

    it('should load the right number of node at the beginning', async () => {
        // Get all the nodes and check if there is the right number.
        const nodes = await getNodes();
        expect(nodes.length).toBe(3);
    });

    it('should increase the number of node when clicking on a sub hierarchy button', async () => {
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

        // There is 3 nodes initially and then 1 more by getting the children of Foo.
        expect(nodes.length).toBe(4);
    });

    it('should increase the number of node when clicking on a super hierarchy button', async () => {
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

        // The 3 nodes from the previous tests are still there and Foo has 1 parent.
        expect(nodes.length).toBe(5);
    });
});
