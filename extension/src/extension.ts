import * as vscode from 'vscode';
import axios from 'axios';
import { spawn } from 'child_process';
import { ServerManager } from './serverManager';
import { CompletionProvider } from './completionProvider';
import { StatusBarManager } from './statusBarManager';
import { CompletionHistory } from './completionHistory';
import { AIModelsViewProvider } from './views/aiModelsView';
import { SettingsViewProvider } from './views/settingsView';
import { StatisticsViewProvider } from './views/statisticsView';
import { HistoryViewProvider } from './views/historyView';
import { ChatViewProvider } from './views/chatView';

// Global instances
let serverManager: ServerManager;
let statusBarManager: StatusBarManager;
let completionHistory: CompletionHistory;
const activationTime = Date.now();

export async function activate(context: vscode.ExtensionContext) {
    console.log('AI Code Companion is active!');

    // Initialize managers
    serverManager = new ServerManager();
    completionHistory = new CompletionHistory();
    statusBarManager = new StatusBarManager(context, serverManager);

    // Server will be started via status bar toggle when needed

    // Register completion provider
    const completionProvider = new CompletionProvider();
    const registration = vscode.languages.registerInlineCompletionItemProvider(
        { scheme: 'file', language: '*' },
        completionProvider
    );
    context.subscriptions.push(registration);

    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.logAcceptance', (text: string, document: vscode.TextDocument, position: vscode.Position) => {
        console.log(`User accepted code: ${text}`);
        completionHistory.addAcceptedCompletion(text, document, position);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.undoLast', () => {
        completionHistory.undoLastCompletion();
        vscode.window.showInformationMessage('Undid last completion');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.showHistory', () => {
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

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'codeCompletion');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.switchModel', async () => {
        try {
            const response = await axios.get('http://127.0.0.1:8000/models', { timeout: 5000 });
            const models = response.data.models;

            // Create quick pick items with descriptions
            const quickPickItems = models.map((model: any) => ({
                label: model.name.split('/').pop() || model.name, // Show short name
                description: model.size,
                detail: `${model.description} - ${model.best_for}`,
                modelName: model.name
            })) as (vscode.QuickPickItem & { modelName: string })[];

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

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.benchmarkModels', async () => {
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

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.exportSettings', async () => {
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
                suggestionTheme: config.get('suggestionTheme'),
                showCompletionStats: config.get('showCompletionStats'),
                exportedAt: new Date().toISOString()
            };

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('ai-code-companion-settings.json'),
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

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.importSettings', async () => {
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
                await config.update('suggestionTheme', settings.suggestionTheme, vscode.ConfigurationTarget.Global);
                await config.update('showCompletionStats', settings.showCompletionStats, vscode.ConfigurationTarget.Global);

                vscode.window.showInformationMessage('Settings imported successfully! Restart may be required for some changes.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to import settings. Invalid file format.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.showCompletionStats', async () => {
        // Calculate statistics from status bar manager and completion history
        const stats = {
            totalCompletions: completionHistory.getRecentCompletions(1000).length,
            averageCompletionLength: completionHistory.getRecentCompletions(100).reduce((sum, item) => sum + item.text.length, 0) / Math.max(1, completionHistory.getRecentCompletions(100).length),
            cacheHits: statusBarManager.getCacheHits(),
            cacheMisses: statusBarManager.getTotalRequests() - statusBarManager.getCacheHits(),
            currentModel: vscode.workspace.getConfiguration('codeCompletion').get('modelName'),
            uptime: Math.floor((Date.now() - activationTime) / 1000 / 60) // minutes
        };

        const panel = vscode.window.createWebviewPanel(
            'completionStats',
            'AI Completion Statistics',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = generateStatsDashboardHTML(stats);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.manageModels', async () => {
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
            panel.webview.html = `<h2>Error: Cannot connect to server</h2><p>Make sure the AI Code Companion server is running.</p>`;
        }
    }));

    // Register additional commands for views
    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.refreshModels', () => {
        // Refresh will be handled by individual view providers
        vscode.window.showInformationMessage('Refreshing AI Models view...');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.openModelDocs', (modelName: string) => {
        const url = `https://huggingface.co/${modelName}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.copyCompletion', (text: string) => {
        vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('Completion copied to clipboard');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.clearCache', () => {
        // Reset cache counters
        statusBarManager.resetCache();
        vscode.window.showInformationMessage('Cache cleared successfully');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.testConnection', async () => {
        try {
            const response = await axios.get('http://127.0.0.1:8000/docs', { timeout: 5000 });
            vscode.window.showInformationMessage('✅ Server connection successful');
        } catch (error) {
            vscode.window.showErrorMessage('❌ Server connection failed. Make sure the Python server is running.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.showModelCacheLocation', async () => {
        try {
            // Get the Hugging Face cache directory
            const pythonProcess = spawn('python3', ['-c', 'from transformers import file_utils; print(file_utils.default_cache_path)']);

            let cachePath = '';
            pythonProcess.stdout.on('data', (data: Buffer) => {
                cachePath += data.toString().trim();
            });

            pythonProcess.on('close', (code: number) => {
                if (code === 0 && cachePath) {
                    const message = `🤖 AI Models Cache Location:\n\n📁 Directory: ${cachePath}\n\n💡 This is where Hugging Face models are stored locally.\n   Current size: ~6.5GB\n   Default model: ~493MB\n\nTo free space, you can delete this directory, but models will be re-downloaded on next use.`;

                    vscode.window.showInformationMessage(message, 'Open in Finder', 'Copy Path').then(selection => {
                        if (selection === 'Open in Finder') {
                            vscode.env.openExternal(vscode.Uri.file(cachePath));
                        } else if (selection === 'Copy Path') {
                            vscode.env.clipboard.writeText(cachePath);
                            vscode.window.showInformationMessage('Cache path copied to clipboard');
                        }
                    });
                } else {
                    vscode.window.showErrorMessage('Failed to determine model cache location');
                }
            });

            pythonProcess.on('error', (error: Error) => {
                vscode.window.showErrorMessage(`Error getting cache location: ${error.message}`);
            });

        } catch (error) {
            vscode.window.showErrorMessage('Failed to get model cache location');
        }
    }));

    // Register Tree Data Providers for Views
    const chatViewProvider = new ChatViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider));

    const aiModelsViewProvider = new AIModelsViewProvider(context);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('ai-models', aiModelsViewProvider));

    const settingsViewProvider = new SettingsViewProvider(context);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('ai-settings', settingsViewProvider));

    const statisticsViewProvider = new StatisticsViewProvider(context, statusBarManager, completionHistory);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('ai-statistics', statisticsViewProvider));

    const historyViewProvider = new HistoryViewProvider(completionHistory);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('ai-history', historyViewProvider));

    // Register setting modification command
    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.modifySetting', async (settingId: string) => {
        await settingsViewProvider.modifySetting(settingId);
    }));

    // Register view refresh commands
    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.refreshModels', () => {
        aiModelsViewProvider.refresh();
    }));

    // Handle model switching from views
    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.switchModel', async (modelName?: string) => {
        if (modelName) {
            // Direct model switch from view
            const config = vscode.workspace.getConfiguration('codeCompletion');
            await config.update('modelName', modelName, vscode.ConfigurationTarget.Global);
            aiModelsViewProvider.refresh();
            vscode.window.showInformationMessage(`Switched to model: ${modelName.split('/').pop()}`);
        } else {
            // Show model picker (existing logic)
            try {
                const response = await axios.get('http://127.0.0.1:8000/models', { timeout: 5000 });
                const models = response.data.models;

                const quickPickItems = models.map((model: any) => ({
                    label: model.name.split('/').pop() || model.name,
                    description: model.size,
                    detail: `${model.description} - ${model.best_for}`,
                    modelName: model.name
                })) as (vscode.QuickPickItem & { modelName: string })[];

                const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
                    placeHolder: 'Select AI model for code completion',
                    matchOnDescription: true,
                    matchOnDetail: true
                });

                if (selectedItem) {
                    const config = vscode.workspace.getConfiguration('codeCompletion');
                    await config.update('modelName', selectedItem.modelName, vscode.ConfigurationTarget.Global);
                    aiModelsViewProvider.refresh();
                    vscode.window.showInformationMessage(`Switched to model: ${selectedItem.label} (${selectedItem.description})`);
                }
            } catch (error) {
                vscode.window.showErrorMessage('Failed to fetch available models. Make sure the server is running.');
            }
        }
    }));

    // Register chat commands
    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.openChat', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.ai-code-companion');
        // Focus on the chat view
        await vscode.commands.executeCommand('ai-chat.focus');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.clearChat', () => {
        // This command will be handled by the ChatViewProvider
        vscode.window.showInformationMessage('Chat cleared');
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

function generateStatsDashboardHTML(stats: any): string {
    const cacheHitRate = stats.cacheHits + stats.cacheMisses > 0 ?
        Math.round((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100) : 0;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI Completion Statistics</title>
            <style>
                body { font-family: var(--vscode-font-family); margin: 20px; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
                h2 { color: var(--vscode-textLink-foreground); text-align: center; }
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
                .stat-card { background-color: var(--vscode-quickInput-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 20px; text-align: center; }
                .stat-value { font-size: 2em; font-weight: bold; color: var(--vscode-textLink-foreground); margin-bottom: 5px; }
                .stat-label { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
                .summary { background-color: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 4px; margin-bottom: 20px; }
                .good { color: var(--vscode-charts-green); }
                .warning { color: var(--vscode-charts-yellow); }
                .error { color: var(--vscode-errorForeground); }
            </style>
        </head>
        <body>
            <h2>📊 AI Completion Statistics</h2>

            <div class="summary">
                <strong>Session Summary:</strong> Extension has been active for ${stats.uptime} minutes<br>
                <strong>Current Model:</strong> ${stats.currentModel || 'Default'}<br>
                <strong>Cache Performance:</strong> <span class="${cacheHitRate > 80 ? 'good' : cacheHitRate > 50 ? 'warning' : 'error'}">${cacheHitRate}% hit rate</span>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalCompletions}</div>
                    <div class="stat-label">Total Completions</div>
                </div>

                <div class="stat-card">
                    <div class="stat-value">${Math.round(stats.averageCompletionLength)}</div>
                    <div class="stat-label">Avg. Completion Length</div>
                </div>

                <div class="stat-card">
                    <div class="stat-value ${cacheHitRate > 80 ? 'good' : cacheHitRate > 50 ? 'warning' : 'error'}">${cacheHitRate}%</div>
                    <div class="stat-label">Cache Hit Rate</div>
                </div>

                <div class="stat-card">
                    <div class="stat-value">${stats.uptime}m</div>
                    <div class="stat-label">Session Uptime</div>
                </div>
            </div>

            <div style="margin-top: 30px; padding: 15px; background-color: var(--vscode-textBlockQuote-background); border-radius: 4px;">
                <h3 style="margin-top: 0; color: var(--vscode-textLink-foreground);">💡 Usage Tips</h3>
                <ul style="color: var(--vscode-descriptionForeground);">
                    <li><strong>High cache hit rate</strong> indicates efficient suggestions and good performance</li>
                    <li><strong>Longer average completion length</strong> suggests comprehensive code suggestions</li>
                    <li><strong>Session uptime</strong> tracks how long the extension has been running</li>
                    <li>Use <strong>GPT-2: Benchmark Models</strong> to compare model performance</li>
                </ul>
            </div>
        </body>
        </html>
    `;
}

// --- CLEANUP ---
export function deactivate() {
    serverManager.stopServer();
}


