import * as vscode from 'vscode';

export class SettingsViewProvider implements vscode.TreeDataProvider<SettingItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SettingItem | undefined | null | void> = new vscode.EventEmitter<SettingItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SettingItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SettingItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SettingItem): Thenable<SettingItem[]> {
        if (!element) {
            // Root level - show setting categories
            return Promise.resolve([
                new SettingItem('AI Model Settings', 'Configure AI model parameters', vscode.TreeItemCollapsibleState.Expanded, 'category', 'model'),
                new SettingItem('Performance Settings', 'Optimize completion performance', vscode.TreeItemCollapsibleState.Expanded, 'category', 'performance'),
                new SettingItem('UI Settings', 'Customize appearance and behavior', vscode.TreeItemCollapsibleState.Expanded, 'category', 'ui'),
                new SettingItem('Server Settings', 'Configure backend server', vscode.TreeItemCollapsibleState.Expanded, 'category', 'server')
            ]);
        }

        // Child items for each category
        if (element.type === 'category') {
            switch (element.id) {
                case 'model':
                    return Promise.resolve(this.getModelSettings());
                case 'performance':
                    return Promise.resolve(this.getPerformanceSettings());
                case 'ui':
                    return Promise.resolve(this.getUISettings());
                case 'server':
                    return Promise.resolve(this.getServerSettings());
                default:
                    return Promise.resolve([]);
            }
        }

        return Promise.resolve([]);
    }

    private getModelSettings(): SettingItem[] {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        return [
            new SettingItem(`Temperature: ${config.get('temperature')}`, 'Controls randomness (0.1 = focused)', vscode.TreeItemCollapsibleState.None, 'setting', 'temperature'),
            new SettingItem(`Top-P: ${config.get('topP')}`, 'Nucleus sampling parameter', vscode.TreeItemCollapsibleState.None, 'setting', 'topP'),
            new SettingItem(`Top-K: ${config.get('topK')}`, 'Top-k sampling parameter', vscode.TreeItemCollapsibleState.None, 'setting', 'topK'),
            new SettingItem(`Max Tokens: ${config.get('maxTokens')}`, 'Maximum completion length', vscode.TreeItemCollapsibleState.None, 'setting', 'maxTokens'),
            new SettingItem(`Model: ${config.get('modelName')?.toString().split('/').pop() || 'Unknown'}`, 'Current AI model', vscode.TreeItemCollapsibleState.None, 'setting', 'modelName'),
            new SettingItem(`Quantization: ${config.get('useQuantization') ? 'Enabled' : 'Disabled'}`, '8-bit quantization for memory efficiency', vscode.TreeItemCollapsibleState.None, 'setting', 'useQuantization')
        ];
    }

    private getPerformanceSettings(): SettingItem[] {
        return [
            new SettingItem('Cache Management', 'Clear and optimize completion cache', vscode.TreeItemCollapsibleState.None, 'action', 'clearCache'),
            new SettingItem('Benchmark Models', 'Run performance tests on all models', vscode.TreeItemCollapsibleState.None, 'action', 'benchmark'),
            new SettingItem('View Statistics', 'Show detailed performance metrics', vscode.TreeItemCollapsibleState.None, 'action', 'statistics')
        ];
    }

    private getUISettings(): SettingItem[] {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        return [
            new SettingItem(`Theme: ${config.get('suggestionTheme')}`, 'Visual style for completions', vscode.TreeItemCollapsibleState.None, 'setting', 'suggestionTheme'),
            new SettingItem(`Show Stats: ${config.get('showCompletionStats') ? 'Yes' : 'No'}`, 'Display cache stats in status bar', vscode.TreeItemCollapsibleState.None, 'setting', 'showCompletionStats'),
            new SettingItem('Export Settings', 'Save current configuration', vscode.TreeItemCollapsibleState.None, 'action', 'export'),
            new SettingItem('Import Settings', 'Load saved configuration', vscode.TreeItemCollapsibleState.None, 'action', 'import')
        ];
    }

    private getServerSettings(): SettingItem[] {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        return [
            new SettingItem(`Server URL: ${config.get('serverUrl')}`, 'Backend server endpoint', vscode.TreeItemCollapsibleState.None, 'setting', 'serverUrl'),
            new SettingItem(`Log Level: ${config.get('logLevel')}`, 'Debugging verbosity', vscode.TreeItemCollapsibleState.None, 'setting', 'logLevel'),
            new SettingItem('Test Connection', 'Verify server connectivity', vscode.TreeItemCollapsibleState.None, 'action', 'testConnection'),
            new SettingItem('Restart Server', 'Reload backend service', vscode.TreeItemCollapsibleState.None, 'action', 'restartServer')
        ];
    }
}

export class SettingItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'category' | 'setting' | 'action',
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
            case 'setting':
                this.iconPath = new vscode.ThemeIcon('settings-gear');
                break;
            case 'action':
                this.iconPath = new vscode.ThemeIcon('tools');
                break;
        }
    }
}