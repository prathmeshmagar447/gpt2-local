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

            // Create quick pick items with descriptions
            const quickPickItems = models.map((model: any) => ({
                label: model.name.split('/').pop() || model.name, // Show short name
                description: model.size,
                detail: `${model.description} - ${model.best_for}`,
                modelName: model.name
            } as vscode.QuickPickItem & { modelName: string }));

            const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select AI model for code completion',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selectedItem) {
                const config = vscode.workspace.getConfiguration('codeCompletion');
                await config.update('modelName', selectedItem.modelName, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Switched to model: ${selectedItem.label} (${selectedItem.description})`);
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to fetch available models. Make sure the server is running.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.benchmarkModels', async () => {
        try {
            const response = await axios.get('http://127.0.0.1:8000/models', { timeout: 5000 });
            const models = response.data.models;

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Benchmarking AI Models',
                cancellable: true
            }, async (progress, token) => {
                const results = [];

                for (let i = 0; i < models.length; i++) {
                    if (token.isCancellationRequested) break;

                    const model = models[i];
                    progress.report({
                        increment: (i / models.length) * 100,
                        message: `Testing ${model.name.split('/').pop()}...`
                    });

                    try {
                        const startTime = Date.now();

                        // Test with a simple code snippet
                        const testResponse = await axios.post('http://127.0.0.1:8000/predict', {
                            code_context: 'def calculate_area',
                            multiline: true,
                            model_name: model.name
                        }, { timeout: 10000 });

                        const responseTime = Date.now() - startTime;
                        const completion = testResponse.data.completion;

                        results.push({
                            model: model.name.split('/').pop(),
                            size: model.size,
                            responseTime: `${responseTime}ms`,
                            completionLength: completion ? completion.length : 0,
                            quality: completion && completion.includes('return') ? 'Good' : 'Basic'
                        });

                    } catch (error) {
                        results.push({
                            model: model.name.split('/').pop(),
                            size: model.size,
                            responseTime: 'Failed',
                            completionLength: 0,
                            quality: 'Error'
                        });
                    }
                }

                // Show results in a webview panel
                const panel = vscode.window.createWebviewPanel(
                    'modelBenchmark',
                    'AI Model Benchmark Results',
                    vscode.ViewColumn.One,
                    {}
                );

                panel.webview.html = generateBenchmarkHTML(results);

            });

        } catch (error) {
            vscode.window.showErrorMessage('Failed to run model benchmarks. Make sure the server is running.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.exportSettings', async () => {
        try {
            const config = vscode.workspace.getConfiguration('codeCompletion');
            const settings = {
                serverUrl: config.get('serverUrl'),
                temperature: config.get('temperature'),
                topP: config.get('topP'),
                topK: config.get('topK'),
                maxTokens: config.get('maxTokens'),
                modelName: config.get('modelName'),
                useQuantization: config.get('useQuantization'),
                logLevel: config.get('logLevel'),
                exportedAt: new Date().toISOString()
            };

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('gpt2-completion-settings.json'),
                filters: { 'JSON': ['json'] }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(settings, null, 2)));
                vscode.window.showInformationMessage('Settings exported successfully!');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to export settings.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.importSettings', async () => {
        try {
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: { 'JSON': ['json'] }
            });

            if (uri && uri[0]) {
                const content = await vscode.workspace.fs.readFile(uri[0]);
                const settings = JSON.parse(content.toString());

                const config = vscode.workspace.getConfiguration('codeCompletion');

                // Import settings
                await config.update('serverUrl', settings.serverUrl, vscode.ConfigurationTarget.Global);
                await config.update('temperature', settings.temperature, vscode.ConfigurationTarget.Global);
                await config.update('topP', settings.topP, vscode.ConfigurationTarget.Global);
                await config.update('topK', settings.topK, vscode.ConfigurationTarget.Global);
                await config.update('maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
                await config.update('modelName', settings.modelName, vscode.ConfigurationTarget.Global);
                await config.update('useQuantization', settings.useQuantization, vscode.ConfigurationTarget.Global);
                await config.update('logLevel', settings.logLevel, vscode.ConfigurationTarget.Global);

                vscode.window.showInformationMessage('Settings imported successfully! Restart may be required for some changes.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to import settings. Invalid file format.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('gpt2-autocomplete.manageModels', async () => {
        const panel = vscode.window.createWebviewPanel(
            'modelManager',
            'AI Model Manager',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        try {
            const response = await axios.get('http://127.0.0.1:8000/models', { timeout: 5000 });
            const models = response.data.models;

            panel.webview.html = generateModelManagerHTML(models);
        } catch (error) {
            panel.webview.html = `<h2>Error: Cannot connect to server</h2><p>Make sure the GPT-2 server is running.</p>`;
        }
    }));
}

// --- HTML GENERATION FUNCTIONS ---

function generateBenchmarkHTML(results: any[]): string {
    const tableRows = results.map(result => `
        <tr>
            <td>${result.model}</td>
            <td>${result.size}</td>
            <td>${result.responseTime}</td>
            <td>${result.completionLength}</td>
            <td class="${result.quality === 'Good' ? 'good' : result.quality === 'Basic' ? 'basic' : 'error'}">${result.quality}</td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI Model Benchmark Results</title>
            <style>
                body { font-family: var(--vscode-font-family); margin: 20px; }
                h2 { color: var(--vscode-textLink-foreground); }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
                th { background-color: var(--vscode-list-hoverBackground); font-weight: bold; }
                .good { color: var(--vscode-charts-green); }
                .basic { color: var(--vscode-charts-yellow); }
                .error { color: var(--vscode-errorForeground); }
                .summary { background-color: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 4px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h2>🤖 AI Model Benchmark Results</h2>
            <div class="summary">
                <strong>Summary:</strong> Tested ${results.length} models with a sample code completion task.<br>
                <strong>Best Performance:</strong> ${results.find(r => r.quality === 'Good')?.model || 'N/A'}<br>
                <strong>Fastest Response:</strong> ${results.filter(r => r.responseTime !== 'Failed').sort((a,b) => parseInt(a.responseTime) - parseInt(b.responseTime))[0]?.model || 'N/A'}
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Model</th>
                        <th>Size</th>
                        <th>Response Time</th>
                        <th>Completion Length</th>
                        <th>Quality</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>

            <p style="margin-top: 20px; font-size: 12px; color: var(--vscode-descriptionForeground);">
                Note: Benchmarks are performed with a simple test case. Real-world performance may vary based on code context and hardware.
            </p>
        </body>
        </html>
    `;
}

function generateModelManagerHTML(models: any[]): string {
    const modelCards = models.map(model => `
        <div class="model-card">
            <h3>${model.name.split('/').pop()}</h3>
            <div class="model-info">
                <span class="size">${model.size}</span>
                <span class="best-for">${model.best_for}</span>
            </div>
            <p class="description">${model.description}</p>
            <div class="actions">
                <button onclick="switchToModel('${model.name}')">Switch to Model</button>
                <button onclick="benchmarkModel('${model.name}')">Benchmark</button>
            </div>
        </div>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI Model Manager</title>
            <style>
                body { font-family: var(--vscode-font-family); margin: 20px; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
                h2 { color: var(--vscode-textLink-foreground); text-align: center; }
                .model-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
                .model-card { background-color: var(--vscode-quickInput-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 15px; }
                .model-card h3 { margin-top: 0; color: var(--vscode-textLink-foreground); }
                .model-info { display: flex; gap: 10px; margin-bottom: 10px; }
                .size { background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 3px; font-size: 12px; }
                .best-for { background-color: var(--vscode-textLink-foreground); color: var(--vscode-editor-background); padding: 2px 6px; border-radius: 3px; font-size: 12px; }
                .description { color: var(--vscode-descriptionForeground); margin-bottom: 15px; }
                .actions { display: flex; gap: 10px; }
                button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
                button:hover { background-color: var(--vscode-button-hoverBackground); }
                .status { text-align: center; margin-top: 20px; padding: 10px; background-color: var(--vscode-textBlockQuote-background); border-radius: 4px; }
            </style>
        </head>
        <body>
            <h2>🎯 AI Model Manager</h2>
            <div class="status">
                Manage your AI models, switch between them, and monitor performance.
            </div>

            <div class="model-grid">
                ${modelCards}
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function switchToModel(modelName) {
                    vscode.postMessage({ command: 'switchModel', modelName });
                }

                function benchmarkModel(modelName) {
                    vscode.postMessage({ command: 'benchmarkModel', modelName });
                }
            </script>
        </body>
        </html>
    `;
}

// --- CLEANUP ---
export function deactivate() {
    serverManager.stopServer();
}
