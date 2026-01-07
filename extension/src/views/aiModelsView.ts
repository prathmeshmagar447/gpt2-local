import * as vscode from 'vscode';
import axios from 'axios';

export class AIModelsViewProvider implements vscode.TreeDataProvider<ModelItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ModelItem | undefined | null | void> = new vscode.EventEmitter<ModelItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModelItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private models: any[] = [];
    private currentModel: string = '';

    constructor(private context: vscode.ExtensionContext) {
        this.loadModels();
        this.loadCurrentModel();
    }

    refresh(): void {
        this.loadModels();
        this.loadCurrentModel();
        this._onDidChangeTreeData.fire();
    }

    private async loadModels(): Promise<void> {
        try {
            const response = await axios.get('http://127.0.0.1:8000/models', { timeout: 5000 });
            this.models = response.data.models || [];
        } catch (error) {
            console.error('Failed to load models:', error);
            this.models = [];
        }
    }

    private loadCurrentModel(): void {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        this.currentModel = config.get('modelName', 'shibing624/code-autocomplete-gpt2-base');
    }

    getTreeItem(element: ModelItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ModelItem): Thenable<ModelItem[]> {
        if (!element) {
            // Root level - show all models
            return Promise.resolve(
                this.models.map(model => {
                    const isCurrent = model.name === this.currentModel;
                    const item = new ModelItem(
                        model.name.split('/').pop() || model.name,
                        model.description,
                        isCurrent ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.None,
                        model
                    );

                    if (isCurrent) {
                        item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
                        item.tooltip = `${model.description} (Currently Active)`;
                    } else {
                        item.iconPath = new vscode.ThemeIcon('hubot');
                        item.tooltip = `${model.description} - Click to switch`;
                    }

                    item.contextValue = 'modelItem';
                    return item;
                })
            );
        }
        return Promise.resolve([]);
    }
}

export class ModelItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly model: any
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.description = `${model.size} - ${model.best_for}`;
    }
}
