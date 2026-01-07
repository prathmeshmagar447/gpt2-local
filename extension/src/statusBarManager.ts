import * as vscode from 'vscode';
import { ServerManager } from './serverManager';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private isEnabled: boolean = true;
    private serverRunning: boolean = false;
    private cacheHits = 0;
    private totalRequests = 0;
    private lastResponseTime = 0;
    private serverManager: ServerManager;

    constructor(context: vscode.ExtensionContext, serverManager: ServerManager) {
        this.serverManager = serverManager;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'ai-code-companion.toggle';
        context.subscriptions.push(this.statusBarItem);
        this.updateStatusBarItem();
        this.statusBarItem.show();

        context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.toggle', async () => {
            if (this.serverRunning) {
                // Stop server
                this.serverManager.stopServer();
                this.serverRunning = false;
                this.isEnabled = false;
                vscode.window.showInformationMessage('AI Code Companion server stopped');
            } else {
                // Start server
                this.setLoading(true);
                try {
                    await this.serverManager.startServer(context);
                    const serverReady = await this.serverManager.waitForServer();
                    if (serverReady) {
                        this.serverRunning = true;
                        this.isEnabled = true;
                        vscode.window.showInformationMessage('AI Code Companion server started');
                    } else {
                        vscode.window.showErrorMessage('Failed to start AI Code Companion server');
                    }
                } catch (error) {
                    vscode.window.showErrorMessage('Failed to start AI Code Companion server');
                } finally {
                    this.setLoading(false);
                }
            }
            this.updateStatusBarItem();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.showStats', () => {
            const hitRate = this.totalRequests > 0 ? Math.round((this.cacheHits / this.totalRequests) * 100) : 0;
            vscode.window.showInformationMessage(
                `AI Code Companion Stats: ${this.cacheHits}/${this.totalRequests} cache hits (${hitRate}%), Last response: ${this.lastResponseTime}ms`
            );
        }));
    }

    private updateStatusBarItem(): void {
        if (this.serverRunning && this.isEnabled) {
            const hitRate = this.totalRequests > 0 ? Math.round((this.cacheHits / this.totalRequests) * 100) : 0;
            this.statusBarItem.text = `$(robot) AI: ${hitRate}%`;
            this.statusBarItem.tooltip = `AI Code Companion - Server Running\nCache hit rate: ${hitRate}%\nLast response: ${this.lastResponseTime}ms\nClick to stop server`;
            this.statusBarItem.backgroundColor = undefined;
        } else if (this.serverRunning && !this.isEnabled) {
            this.statusBarItem.text = `$(robot) AI: PAUSED`;
            this.statusBarItem.tooltip = 'AI server is running but completions are disabled\nClick to stop server';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.text = `$(circle-slash) AI: OFF`;
            this.statusBarItem.tooltip = 'AI server is stopped\nClick to start server';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }

    isAutocompleteEnabled(): boolean {
        return this.isEnabled;
    }

    setLoading(isLoading: boolean): void {
        if (isLoading) {
            this.statusBarItem.text = `$(sync~spin) AI: Loading...`;
            this.statusBarItem.tooltip = 'Initializing AI model...';
        } else {
            this.updateStatusBarItem();
        }
    }

    recordRequest(isCacheHit: boolean, responseTime: number): void {
        this.totalRequests++;
        if (isCacheHit) {
            this.cacheHits++;
        }
        this.lastResponseTime = responseTime;
        this.updateStatusBarItem();
    }

    getCacheHits(): number {
        return this.cacheHits;
    }

    getTotalRequests(): number {
        return this.totalRequests;
    }

    getLastResponseTime(): number {
        return this.lastResponseTime;
    }

    resetCache(): void {
        this.cacheHits = 0;
        this.totalRequests = 0;
        this.lastResponseTime = 0;
        this.updateStatusBarItem();
    }
}
