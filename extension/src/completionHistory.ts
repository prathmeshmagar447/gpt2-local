import * as vscode from 'vscode';

export class CompletionHistory {
    private history: Array<{ text: string; timestamp: number; documentUri: string; position: vscode.Position }> = [];
    private maxHistorySize = 50;

    addAcceptedCompletion(text: string, document: vscode.TextDocument, position: vscode.Position): void {
        this.history.unshift({
            text,
            timestamp: Date.now(),
            documentUri: document.uri.toString(),
            position: position
        });

        // Keep only recent history
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(0, this.maxHistorySize);
        }
    }

    getLastCompletion(): { text: string; documentUri: string; position: vscode.Position } | undefined {
        return this.history.length > 0 ? this.history[0] : undefined;
    }

    getRecentCompletions(limit: number = 10): Array<{ text: string; timestamp: number }> {
        return this.history.slice(0, limit).map(item => ({
            text: item.text,
            timestamp: item.timestamp
        }));
    }

    undoLastCompletion(): void {
        const last = this.getLastCompletion();
        if (last) {
            // Find the document and position
            const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === last.documentUri);
            if (document) {
                const edit = new vscode.WorkspaceEdit();
                const endPosition = document.positionAt(document.offsetAt(last.position) + last.text.length);
                edit.delete(document.uri, new vscode.Range(last.position, endPosition));
                vscode.workspace.applyEdit(edit);
            }
        }
    }
}