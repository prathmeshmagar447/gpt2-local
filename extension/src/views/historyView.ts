import * as vscode from 'vscode';
import { CompletionHistory } from '../completionHistory';

export class HistoryViewProvider implements vscode.TreeDataProvider<HistoryItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined | null | void> = new vscode.EventEmitter<HistoryItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private completionHistory: CompletionHistory;

    constructor(completionHistory: CompletionHistory) {
        this.completionHistory = completionHistory;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryItem): Thenable<HistoryItem[]> {
        if (!element) {
            // Root level - show recent completions
            const recent = this.completionHistory.getRecentCompletions(20);
            return Promise.resolve(
                recent.map((completion, index) => {
                    const preview = completion.text.length > 50 ?
                        completion.text.substring(0, 47) + '...' :
                        completion.text;

                    const timestamp = new Date(completion.timestamp);
                    const timeAgo = this.getTimeAgo(timestamp);

                    return new HistoryItem(
                        preview,
                        `Completed ${timeAgo}\n${completion.text}`,
                        vscode.TreeItemCollapsibleState.None,
                        completion,
                        index
                    );
                })
            );
        }

        return Promise.resolve([]);
    }

    private getTimeAgo(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }
}

export class HistoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly completion: any,
        public readonly index: number
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.description = new Date(completion.timestamp).toLocaleTimeString();
        this.iconPath = new vscode.ThemeIcon('history');
        this.contextValue = 'historyItem';

        // Add command to copy completion text
        this.command = {
            command: 'ai-code-companion.copyCompletion',
            title: 'Copy Completion',
            arguments: [completion.text]
        };
    }
}