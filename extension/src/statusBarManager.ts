import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private isEnabled: boolean = true;
    private cacheHits = 0;
    private totalRequests = 0;
    private lastResponseTime = 0;

    constructor(context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'ai-code-companion.showStats';
        context.subscriptions.push(this.statusBarItem);
        this.updateStatusBarItem();
        this.statusBarItem.show();

        context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.toggle', () => {
            this.isEnabled = !this.isEnabled;
            this.updateStatusBarItem();
            vscode.window.showInformationMessage(`AI Code Companion is now ${this.isEnabled ? 'ON' : 'OFF'}`);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('ai-code-companion.showStats', () => {
            const hitRate = this.totalRequests > 0 ? Math.round((this.cacheHits / this.totalRequests) * 100) : 0;
            vscode.window.showInformationMessage(
                `AI Code Companion Stats: ${this.cacheHits}/${this.totalRequests} cache hits (${hitRate}%), Last response: ${this.lastResponseTime}ms`
            );
        }));
    }

    private updateStatusBarItem(): void {
        if (this.isEnabled) {
            const hitRate = this.totalRequests > 0 ? Math.round((this.cacheHits / this.totalRequests) * 100) : 0;
            this.statusBarItem.text = `$(robot) AI: ${hitRate}%`;
            this.statusBarItem.tooltip = `AI Code Companion - Cache hit rate: ${hitRate}%\nLast response: ${this.lastResponseTime}ms`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = `$(circle-slash) AI: OFF`;
            this.statusBarItem.tooltip = 'Click to enable AI Code Companion';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
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
