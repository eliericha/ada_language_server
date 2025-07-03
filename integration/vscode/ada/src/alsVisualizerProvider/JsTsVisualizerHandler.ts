import { VisualizerHandler } from '../alsVisualizerProvider';
import * as vscode from 'vscode';

export class JsTsVisualizerHandler extends VisualizerHandler {
    isInProject(uri: vscode.Uri) {
        return !uri.fsPath.includes('node_modules') && super.isInProject(uri);
    }
}
