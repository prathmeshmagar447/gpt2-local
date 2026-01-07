import * as vscode from 'vscode';
import axios from 'axios';
import { ServerManager } from './serverManager';
import { CompletionProvider } from './completionProvider';
import { StatusBarManager } from './statusBarManager';
import { CompletionHistory } from './completionHistory';

// Global instances
let serverManager: ServerManager;
let statusBarManager: StatusBarManager;
let completionHistory: CompletionHistory;

export function activate(context: vscode.ExtensionContext) {
    console.log('GPT-2 Ghost Text Autocomplete is active!');

    // Initialize managers
    serverManager = new ServerManager();
    statusBarManager = new StatusBarManager(context);
    completionHistory = new CompletionHistory();

    // Start Python server
    serverManager.startServer(context);

    // Register completion provider
    const completionProvider = new CompletionProvider();
    const registration = vscode.languages.registerInlineCompletionItemProvider(
        { scheme: 'file', language: '*' },
        completionProvider
    );
    context.subscriptions.push(registration);

    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.logAcceptance', (text: string, document: vscode.TextDocument, position: vscode.Position) => {
        console.log(`User accepted code: ${text}`);
        completionHistory.addAcceptedCompletion(text, document, position);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.undoLast', () => {
        completionHistory.undoLastCompletion();
        vscode.window.showInformationMessage('Undid last completion');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.showHistory', () => {
        const recent = completionHistory.getRecentCompletions();
        if (recent.length === 0) {
            vscode.window.showInformationMessage('No completion history');
            return;
        }
        const items = recent.map(item => ({
            label: item.text.substring(0, 50) + (item.text.length > 50 ? '...' : ''),
            detail: new Date(item.timestamp).toLocaleString()
        }));
        vscode.window.showQuickPick(items, { placeHolder: 'Recent completions' });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'codeCompletion');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.switchModel', async () => {
        try {
            const response = await axios.get('http://127.0.0.1:8000/models', { timeout: 5000 });
            const models = response.data.models;

            const selectedModel = await vscode.window.showQuickPick(models, {
                placeHolder: 'Select AI model for code completion'
            });

            if (selectedModel) {
                const config = vscode.workspace.getConfiguration('codeCompletion');
                await config.update('modelName', selectedModel, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to model: ${selectedModel}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to fetch available models. Make sure the server is running.');
        }
    }));
}

// --- CLEANUP ---
export function deactivate() {
    serverManager.stopServer();
}
