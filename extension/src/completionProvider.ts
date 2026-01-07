import * as vscode from 'vscode';
import axios, { CancelTokenSource } from 'axios';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
    private debounceTimer: NodeJS.Timeout | undefined;
    private cancelTokenSource: CancelTokenSource = axios.CancelToken.source();

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[]> {

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.cancelTokenSource.cancel('New input.');
            this.cancelTokenSource = axios.CancelToken.source();
        }

        return new Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[]>((resolve) => {
            this.debounceTimer = setTimeout(async () => {
                if (token.isCancellationRequested) {
                    resolve([]);
                    return;
                }

                try {
                    const startLine = Math.max(0, position.line - 5); // Reduced from 10 to 5 lines for faster processing
                    const range = new vscode.Range(startLine, 0, position.line, position.character);
                    const contextText = document.getText(range);

                    if (!contextText.trim()) {
                        resolve([]);
                        return;
                    }

                    // Determine if this is likely a multiline completion
                    const isMultiline = this.detectMultiline(document, position);

                    // Get model from VS Code settings
                    const config = vscode.workspace.getConfiguration('codeCompletion');
                    const modelName = config.get<string>('modelName', 'shibing624/code-autocomplete-gpt2-base');

                    const response = await axios.post('http://127.0.0.1:8000/predict', {
                        code_context: contextText,
                        multiline: isMultiline,
                        model_name: modelName
                    }, {
                        cancelToken: this.cancelTokenSource.token,
                        timeout: 2000
                    });

                    const prediction = response.data.completion;

                    if (!prediction || prediction.trim().length === 0) {
                        resolve([]);
                        return;
                    }

                    const item = new vscode.InlineCompletionItem(
                        prediction,
                        new vscode.Range(position, position)
                    );

                    item.command = {
                        command: 'gpt2-autocomplete.logAcceptance',
                        title: 'Log Acceptance',
                        arguments: [prediction, document, position]
                    };

                    resolve([item]);

                } catch (error) {
                    if (!axios.isCancel(error)) {
                        const err = error as any;
                        if (err.code === 'ECONNREFUSED') {
                            console.warn("Server not ready yet. Retrying on next request.");
                        } else if (err.response) {
                            console.error(`Server error ${err.response.status}: ${err.response.data.detail || err.message}`);
                        } else {
                            console.error("API Error:", err.message);
                        }
                    }
                    resolve([]);
                }
            }, 150);
        });
    }

    private detectMultiline(document: vscode.TextDocument, position: vscode.Position): boolean {
        const lineText = document.lineAt(position.line).text.trim();
        const languageId = document.languageId;

        // Language-specific multiline detection
        switch (languageId) {
            case 'python':
                return this.detectPythonMultiline(lineText, document, position);
            case 'javascript':
            case 'typescript':
            case 'java':
            case 'cpp':
            case 'c':
                return this.detectCStyleMultiline(lineText, document, position);
            default:
                // Fallback to basic detection
                return lineText.endsWith(':') ||
                       lineText.startsWith('def ') ||
                       lineText.startsWith('class ') ||
                       lineText.startsWith('if ') ||
                       lineText.startsWith('for ') ||
                       lineText.startsWith('while ');
        }
    }

    private detectPythonMultiline(lineText: string, document: vscode.TextDocument, position: vscode.Position): boolean {
        return lineText.endsWith(':') ||
               lineText.startsWith('def ') ||
               lineText.startsWith('class ') ||
               lineText.startsWith('if ') ||
               lineText.startsWith('for ') ||
               lineText.startsWith('while ') ||
               lineText.startsWith('try:') ||
               lineText.startsWith('with ') ||
               lineText.match(/^\s*@/) !== null; // Decorators
    }

    private detectCStyleMultiline(lineText: string, document: vscode.TextDocument, position: vscode.Position): boolean {
        return lineText.endsWith('{') ||
               lineText.startsWith('if ') ||
               lineText.startsWith('for ') ||
               lineText.startsWith('while ') ||
               lineText.startsWith('switch ') ||
               lineText.startsWith('class ') ||
               lineText.startsWith('function ') ||
               lineText.startsWith('public ') ||
               lineText.startsWith('private ') ||
               lineText.startsWith('protected ');
    }
}