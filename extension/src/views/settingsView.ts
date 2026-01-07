import * as vscode from 'vscode';
import { Logger } from '../logger';

export class SettingsViewProvider implements vscode.TreeDataProvider<SettingItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SettingItem | undefined | null | void> = new vscode.EventEmitter<SettingItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SettingItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private logger = Logger.getInstance();

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

    // Setting modification methods
    async modifySetting(settingId: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeCompletion');

        try {
            switch (settingId) {
                case 'temperature':
                    await this.modifyNumberSetting('temperature', 'Temperature', 'Controls randomness (0.1 = focused, 1.0 = creative)', 0.1, 2.0, 0.1);
                    break;
                case 'topP':
                    await this.modifyNumberSetting('topP', 'Top-P', 'Nucleus sampling parameter (0.1-1.0)', 0.1, 1.0, 0.05);
                    break;
                case 'topK':
                    await this.modifyNumberSetting('topK', 'Top-K', 'Top-k sampling parameter (1-100)', 1, 100, 1);
                    break;
                case 'maxTokens':
                    await this.modifyNumberSetting('maxTokens', 'Max Tokens', 'Maximum completion length (10-512)', 10, 512, 1);
                    break;
                case 'modelName':
                    await this.modifyModelSetting();
                    break;
                case 'useQuantization':
                    await this.modifyBooleanSetting('useQuantization', 'Use Quantization', 'Enable 8-bit quantization for memory efficiency');
                    break;
                case 'suggestionTheme':
                    await this.modifyEnumSetting('suggestionTheme', 'Suggestion Theme', 'Visual style for completions', ['default', 'subtle', 'prominent', 'colored']);
                    break;
                case 'showCompletionStats':
                    await this.modifyBooleanSetting('showCompletionStats', 'Show Completion Stats', 'Display cache stats in status bar');
                    break;
                case 'serverUrl':
                    await this.modifyStringSetting('serverUrl', 'Server URL', 'Backend server endpoint URL');
                    break;
                case 'logLevel':
                    await this.modifyEnumSetting('logLevel', 'Log Level', 'Debugging verbosity level', ['error', 'warn', 'info', 'debug']);
                    break;
                default:
                    vscode.window.showErrorMessage(`Unknown setting: ${settingId}`);
            }
        } catch (error) {
            this.logger.error(`Failed to modify setting ${settingId}:`, error);
            vscode.window.showErrorMessage(`Failed to modify setting: ${settingId}`);
        }
    }

    private async modifyNumberSetting(key: string, label: string, description: string, min: number, max: number, step: number): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        const currentValue = config.get<number>(key, 0);

        const newValue = await vscode.window.showInputBox({
            prompt: `Enter ${label} (${min}-${max})`,
            placeHolder: currentValue.toString(),
            value: currentValue.toString(),
            validateInput: (value) => {
                const num = parseFloat(value);
                if (isNaN(num)) return 'Please enter a valid number';
                if (num < min || num > max) return `Value must be between ${min} and ${max}`;
                return null;
            }
        });

        if (newValue !== undefined) {
            const numValue = parseFloat(newValue);
            await config.update(key, numValue, vscode.ConfigurationTarget.Global);
            this.logger.info(`Setting ${key} changed from ${currentValue} to ${numValue}`);
            vscode.window.showInformationMessage(`${label} updated to ${numValue}`);
            this.refresh();
        }
    }

    private async modifyStringSetting(key: string, label: string, description: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        const currentValue = config.get<string>(key, '');

        const newValue = await vscode.window.showInputBox({
            prompt: `Enter ${label}`,
            placeHolder: currentValue,
            value: currentValue,
            validateInput: (value) => {
                if (!value.trim()) return 'Value cannot be empty';
                return null;
            }
        });

        if (newValue !== undefined) {
            await config.update(key, newValue, vscode.ConfigurationTarget.Global);
            this.logger.info(`Setting ${key} changed from "${currentValue}" to "${newValue}"`);
            vscode.window.showInformationMessage(`${label} updated to ${newValue}`);
            this.refresh();
        }
    }

    private async modifyBooleanSetting(key: string, label: string, description: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        const currentValue = config.get<boolean>(key, false);

        const newValue = !currentValue; // Toggle the boolean
        await config.update(key, newValue, vscode.ConfigurationTarget.Global);
        this.logger.info(`Setting ${key} changed from ${currentValue} to ${newValue}`);
        vscode.window.showInformationMessage(`${label} ${newValue ? 'enabled' : 'disabled'}`);
        this.refresh();
    }

    private async modifyEnumSetting(key: string, label: string, description: string, options: string[]): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        const currentValue = config.get<string>(key, options[0]);

        const selectedValue = await vscode.window.showQuickPick(options, {
            placeHolder: `Select ${label}`,
            canPickMany: false
        });

        if (selectedValue) {
            await config.update(key, selectedValue, vscode.ConfigurationTarget.Global);
            this.logger.info(`Setting ${key} changed from "${currentValue}" to "${selectedValue}"`);
            vscode.window.showInformationMessage(`${label} updated to ${selectedValue}`);
            this.refresh();
        }
    }

    private async modifyModelSetting(): Promise<void> {
        try {
            const axios = require('axios');
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
                this.logger.info(`Model changed to ${selectedItem.modelName}`);
                vscode.window.showInformationMessage(`Model updated to ${selectedItem.label}`);
                this.refresh();
            }
        } catch (error) {
            this.logger.error('Failed to fetch available models:', error);
            vscode.window.showErrorMessage('Failed to fetch available models. Make sure the server is running.');
        }
    }
}

export class SettingItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'category' | 'setting' | 'action',
        public readonly id: string,
        public readonly provider?: SettingsViewProvider
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
                // Make settings clickable by adding a command
                this.command = {
                    command: 'ai-code-companion.modifySetting',
                    title: 'Modify Setting',
                    arguments: [id]
                };
                break;
            case 'action':
                this.iconPath = new vscode.ThemeIcon('tools');
                break;
        }
    }
}
