import * as vscode from 'vscode';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

// Global state
let isEnabled = true;
let myStatusBarItem: vscode.StatusBarItem;
let serverProcess: ChildProcess | undefined; // Reference to the Python server

export function activate(context: vscode.ExtensionContext) {
    console.log('GPT-2 Ghost Text Autocomplete is active!');

    // --- 1. START PYTHON SERVER AUTOMATICALLY ---
    startServer(context);

    // --- 2. STATUS BAR SETUP ---
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    myStatusBarItem.command = 'gpt2-autocomplete.toggle';
    context.subscriptions.push(myStatusBarItem);
    updateStatusBarItem();
    myStatusBarItem.show();

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.toggle', () => {
        isEnabled = !isEnabled;
        updateStatusBarItem();
        vscode.window.showInformationMessage(`GPT-2 Autocomplete is now ${isEnabled ? 'ON' : 'OFF'}`);
    }));

    // --- 3. AUTOCOMPLETE PROVIDER ---
    let debounceTimer: NodeJS.Timeout | undefined;
    let cancelTokenSource = axios.CancelToken.source();

    const provider: vscode.InlineCompletionItemProvider = {
        async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken) {

            if (!isEnabled) return [];

            if (debounceTimer) {
                clearTimeout(debounceTimer);
                cancelTokenSource.cancel('New input.');
                cancelTokenSource = axios.CancelToken.source();
            }

            return new Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[]>((resolve) => {
                debounceTimer = setTimeout(async () => {
                    if (token.isCancellationRequested || !isEnabled) {
                        resolve([]);
                        return;
                    }

                    try {
                        const startLine = Math.max(0, position.line - 10);
                        const range = new vscode.Range(startLine, 0, position.line, position.character);
                        const contextText = document.getText(range);

                        if (!contextText.trim()) {
                            resolve([]);
                            return;
                        }

                        // Determine if this is likely a multiline completion
                        const isMultiline = document.lineAt(position.line).text.trim().endsWith(':') ||
                                          document.lineAt(position.line).text.trim().startsWith('def ') ||
                                          document.lineAt(position.line).text.trim().startsWith('class ');

                        const response = await axios.post('http://127.0.0.1:8000/predict', {
                            code_context: contextText,
                            multiline: isMultiline
                        }, {
                            cancelToken: cancelTokenSource.token,
                            timeout: 2000
                        });

                        const prediction = response.data.completion;

                        if (!prediction || prediction.trim().length === 0) {
                            resolve([]);
                            return;
                        }

                        const item = new vscode.InlineCompletionItem(
                            prediction,
                            new vscode.Range(position, position)
                        );
                        
                        item.command = {
                            command: 'gpt2-autocomplete.logAcceptance',
                            title: 'Log Acceptance',
                            arguments: [prediction]
                        };

                        resolve([item]);

                    } catch (error) {
                        if (!axios.isCancel(error)) {
                            // Suppress connection errors if server is still starting up
                            console.error("API Error (Server might be starting):", (error as any).message);
                        }
                        resolve([]);
                    }
                }, 300);
            });
        }
    };

    const registration = vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file', language: '*' }, provider);
    context.subscriptions.push(registration);
    
    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.logAcceptance', (text) => {
        console.log(`User accepted code: ${text}`);
    }));
}

// --- HELPER FUNCTIONS ---

async function startServer(context: vscode.ExtensionContext) {
    // 1. Locate server.py inside the extension installation folder
    const serverPath = path.join(context.extensionPath, 'server.py');
    console.log(`Launching server from: ${serverPath}`);

    // 2. Try to get the active Python path from VS Code configuration
    const pythonConfig = vscode.workspace.getConfiguration('python');
    let pythonPath = pythonConfig.get<string>('defaultInterpreterPath');

    // Fallback if not set
    if (!pythonPath || pythonPath === 'python') {
        pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    }

    console.log(`Launching server with: ${pythonPath}`);

    // 3. Spawn using that specific python
    serverProcess = spawn(pythonPath, [serverPath]);

    // 4. Handle Server Output (for debugging)
    serverProcess.stdout?.on('data', (data) => {
        console.log(`[Server]: ${data}`);
    });

    serverProcess.stderr?.on('data', (data) => {
        console.error(`[Server Error]: ${data}`);
    });

    serverProcess.on('close', (code) => {
        console.log(`Server exited with code ${code}`);
        if (code !== 0 && code !== null) {
            vscode.window.showErrorMessage(`GPT-2 Server crashed (Code: ${code}). Check Output panel.`);
        }
    });
}

function updateStatusBarItem() {
    if (isEnabled) {
        myStatusBarItem.text = `$(zap) GPT-2: ON`;
        myStatusBarItem.backgroundColor = undefined;
    } else {
        myStatusBarItem.text = `$(circle-slash) GPT-2: OFF`;
        myStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}

// --- CLEANUP ---
export function deactivate() {
    if (serverProcess) {
        console.log('Killing GPT-2 Server...');
        serverProcess.kill(); // Kills the Python process when VS Code closes
    }
}
