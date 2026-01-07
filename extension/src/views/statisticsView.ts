import * as vscode from 'vscode';
import { StatusBarManager } from '../statusBarManager';
import { CompletionHistory } from '../completionHistory';

export class StatisticsViewProvider implements vscode.TreeDataProvider<StatsItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatsItem | undefined | null | void> = new vscode.EventEmitter<StatsItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatsItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private statusBarManager: StatusBarManager;
    private completionHistory: CompletionHistory;

    constructor(
        private context: vscode.ExtensionContext,
        statusBarManager: StatusBarManager,
        completionHistory: CompletionHistory
    ) {
        this.statusBarManager = statusBarManager;
        this.completionHistory = completionHistory;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatsItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: StatsItem): Thenable<StatsItem[]> {
        if (!element) {
            // Root level - show statistics categories
            return Promise.resolve([
                new StatsItem('Performance Metrics', 'Real-time performance statistics', vscode.TreeItemCollapsibleState.Expanded, 'category', 'performance'),
                new StatsItem('Usage Statistics', 'Completion usage patterns', vscode.TreeItemCollapsibleState.Expanded, 'category', 'usage'),
                new StatsItem('Cache Analytics', 'Cache performance and efficiency', vscode.TreeItemCollapsibleState.Expanded, 'category', 'cache'),
                new StatsItem('Model Statistics', 'AI model performance data', vscode.TreeItemCollapsibleState.Expanded, 'category', 'model')
            ]);
        }

        // Child items for each category
        if (element.type === 'category') {
            switch (element.id) {
                case 'performance':
                    return Promise.resolve(this.getPerformanceStats());
                case 'usage':
                    return Promise.resolve(this.getUsageStats());
                case 'cache':
                    return Promise.resolve(this.getCacheStats());
                case 'model':
                    return Promise.resolve(this.getModelStats());
                default:
                    return Promise.resolve([]);
            }
        }

        return Promise.resolve([]);
    }

    private getPerformanceStats(): StatsItem[] {
        const hitRate = this.statusBarManager.getTotalRequests() > 0 ?
            Math.round((this.statusBarManager.getCacheHits() / this.statusBarManager.getTotalRequests()) * 100) : 0;

        return [
            new StatsItem(`Cache Hit Rate: ${hitRate}%`, 'Percentage of requests served from cache', vscode.TreeItemCollapsibleState.None, 'metric', 'cacheHitRate'),
            new StatsItem(`Last Response Time: ${this.statusBarManager.getLastResponseTime()}ms`, 'Time taken for last completion', vscode.TreeItemCollapsibleState.None, 'metric', 'lastResponseTime'),
            new StatsItem(`Total Requests: ${this.statusBarManager.getTotalRequests()}`, 'Total completion requests processed', vscode.TreeItemCollapsibleState.None, 'metric', 'totalRequests'),
            new StatsItem(`Cache Hits: ${this.statusBarManager.getCacheHits()}`, 'Requests served from cache', vscode.TreeItemCollapsibleState.None, 'metric', 'cacheHits')
        ];
    }

    private getUsageStats(): StatsItem[] {
        const recent = this.completionHistory.getRecentCompletions(100);
        const avgLength = recent.length > 0 ?
            Math.round(recent.reduce((sum, item) => sum + item.text.length, 0) / recent.length) : 0;
        // Note: getRecentCompletions returns simplified objects without documentUri
        // For now, we'll use a placeholder until we can access full history
        const uniqueFiles = 'N/A';

        return [
            new StatsItem(`Total Completions: ${this.completionHistory.getRecentCompletions(1000).length}`, 'Total completions generated', vscode.TreeItemCollapsibleState.None, 'metric', 'totalCompletions'),
            new StatsItem(`Average Length: ${avgLength} chars`, 'Average completion text length', vscode.TreeItemCollapsibleState.None, 'metric', 'avgLength'),
            new StatsItem(`Files Worked On: ${uniqueFiles}`, 'Number of unique files with completions', vscode.TreeItemCollapsibleState.None, 'metric', 'uniqueFiles'),
            new StatsItem(`Session Uptime: ${Math.floor((Date.now() - this.context.globalState.get('activationTime', Date.now())) / 1000 / 60)}m`, 'Extension running time', vscode.TreeItemCollapsibleState.None, 'metric', 'uptime')
        ];
    }

    private getCacheStats(): StatsItem[] {
        const hitRate = this.statusBarManager.getTotalRequests() > 0 ?
            Math.round((this.statusBarManager.getCacheHits() / this.statusBarManager.getTotalRequests()) * 100) : 0;
        const missRate = 100 - hitRate;

        return [
            new StatsItem(`Hit Rate: ${hitRate}%`, 'Cache effectiveness percentage', vscode.TreeItemCollapsibleState.None, 'metric', 'hitRate'),
            new StatsItem(`Miss Rate: ${missRate}%`, 'Requests requiring server computation', vscode.TreeItemCollapsibleState.None, 'metric', 'missRate'),
            new StatsItem(`Cache Efficiency: ${hitRate > 80 ? 'Excellent' : hitRate > 60 ? 'Good' : hitRate > 40 ? 'Fair' : 'Poor'}`, 'Overall cache performance rating', vscode.TreeItemCollapsibleState.None, 'metric', 'efficiency'),
            new StatsItem('Clear Cache', 'Reset cache and statistics', vscode.TreeItemCollapsibleState.None, 'action', 'clearCache')
        ];
    }

    private getModelStats(): StatsItem[] {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        const currentModel = config.get('modelName', 'Unknown');

        return [
            new StatsItem(`Current Model: ${currentModel.split('/').pop()}`, 'Active AI model', vscode.TreeItemCollapsibleState.None, 'metric', 'currentModel'),
            new StatsItem(`Temperature: ${config.get('temperature')}`, 'Model randomness setting', vscode.TreeItemCollapsibleState.None, 'metric', 'temperature'),
            new StatsItem(`Quantization: ${config.get('useQuantization') ? 'Enabled' : 'Disabled'}`, 'Memory optimization status', vscode.TreeItemCollapsibleState.None, 'metric', 'quantization'),
            new StatsItem('Benchmark Models', 'Test all models performance', vscode.TreeItemCollapsibleState.None, 'action', 'benchmark')
        ];
    }
}

export class StatsItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'category' | 'metric' | 'action',
        public readonly id: string
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.contextValue = type;

        // Set icons based on type
        switch (type) {
            case 'category':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'metric':
                this.iconPath = new vscode.ThemeIcon('graph');
                break;
            case 'action':
                this.iconPath = new vscode.ThemeIcon('tools');
                break;
        }

        // Color code metrics based on values
        if (type === 'metric' && this.label.includes('Rate')) {
            if (this.label.includes('80%') || this.label.includes('Excellent')) {
                this.iconPath = new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.green'));
            } else if (this.label.includes('60%') || this.label.includes('Good')) {
                this.iconPath = new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.yellow'));
            } else {
                this.iconPath = new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.red'));
            }
        }
    }
}