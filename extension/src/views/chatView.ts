import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ai-chat';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'sendMessage':
                    await this._handleChatMessage(message.text);
                    break;
                case 'clearChat':
                    this._clearChat();
                    break;
            }
        });
    }

    private async _handleChatMessage(text: string) {
        if (!this._view) return;

        try {
            // Add user message to chat
            this._addMessageToChat('user', text);

            // Show typing indicator
            this._showTypingIndicator();

            // Send to server
            const response = await this._sendChatMessage(text);

            // Hide typing indicator and add response
            this._hideTypingIndicator();
            this._addMessageToChat('assistant', response);

        } catch (error) {
            this._hideTypingIndicator();
            this._addMessageToChat('assistant', `Error: ${error}`);
        }
    }

    private async _sendChatMessage(message: string): Promise<string> {
        try {
            const axios = require('axios');
            const response = await axios.post('http://127.0.0.1:8000/chat', {
                message: message,
                context: this._getCodeContext()
            }, { timeout: 10000 });

            return response.data.response;
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('AI server is not running. Please start the server first.');
            }
            throw new Error(error.response?.data?.detail || error.message);
        }
    }

    private _getCodeContext(): string {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return '';

        const document = editor.document;
        const position = editor.selection.active;

        // Get context around cursor (last 10 lines)
        const startLine = Math.max(0, position.line - 10);
        const endLine = Math.min(document.lineCount - 1, position.line + 5);
        const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);

        return document.getText(range);
    }

    private _addMessageToChat(role: 'user' | 'assistant', content: string) {
        if (!this._view) return;

        this._view.webview.postMessage({
            type: 'addMessage',
            role: role,
            content: content
        });
    }

    private _showTypingIndicator() {
        if (!this._view) return;

        this._view.webview.postMessage({
            type: 'showTyping'
        });
    }

    private _hideTypingIndicator() {
        if (!this._view) return;

        this._view.webview.postMessage({
            type: 'hideTyping'
        });
    }

    private _clearChat() {
        if (!this._view) return;

        this._view.webview.postMessage({
            type: 'clearChat'
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Chat</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }

                .chat-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .message {
                    max-width: 80%;
                    padding: 8px 12px;
                    border-radius: 8px;
                    word-wrap: break-word;
                }

                .message.user {
                    align-self: flex-end;
                    background-color: var(--vscode-textLink-foreground);
                    color: var(--vscode-editor-background);
                }

                .message.assistant {
                    align-self: flex-start;
                    background-color: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                }

                .message-header {
                    font-weight: bold;
                    font-size: 0.8em;
                    margin-bottom: 4px;
                    opacity: 0.8;
                }

                .typing-indicator {
                    display: none;
                    align-self: flex-start;
                    padding: 8px 12px;
                    background-color: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    border-radius: 8px;
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                }

                .input-container {
                    border-top: 1px solid var(--vscode-panel-border);
                    padding: 10px;
                    background-color: var(--vscode-editorWidget-background);
                }

                .input-row {
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                }

                .chat-input {
                    flex: 1;
                    min-height: 20px;
                    max-height: 100px;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    resize: none;
                    font-family: inherit;
                    font-size: inherit;
                }

                .chat-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                }

                .send-button {
                    padding: 8px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: inherit;
                }

                .send-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .send-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 5px 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-titleBar-activeBackground);
                }

                .toolbar-button {
                    background: none;
                    border: none;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 0.9em;
                }

                .toolbar-button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }

                .status {
                    font-size: 0.8em;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <span class="status">🤖 AI Assistant</span>
                <button class="toolbar-button" onclick="clearChat()">🗑️ Clear</button>
            </div>

            <div class="chat-container">
                <div id="chat-messages" class="chat-messages">
                    <div class="message assistant">
                        <div class="message-header">AI Assistant</div>
                        Hello! I'm your AI coding assistant. I can help you with:
                        <ul>
                            <li>Code explanations and debugging</li>
                            <li>Writing and improving code</li>
                            <li>Answering programming questions</li>
                            <li>Code reviews and suggestions</li>
                        </ul>
                        What would you like help with?
                    </div>
                </div>

                <div id="typing-indicator" class="typing-indicator">
                    AI is typing...
                </div>
            </div>

            <div class="input-container">
                <div class="input-row">
                    <textarea
                        id="chat-input"
                        class="chat-input"
                        placeholder="Ask me anything about your code..."
                        rows="1"
                        onkeydown="handleKeyDown(event)"
                        oninput="autoResize(this)"
                    ></textarea>
                    <button id="send-button" class="send-button" onclick="sendMessage()">Send</button>
                </div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const chatMessages = document.getElementById('chat-messages');
                const chatInput = document.getElementById('chat-input');
                const sendButton = document.getElementById('send-button');
                const typingIndicator = document.getElementById('typing-indicator');

                function addMessage(role, content) {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message ' + role;

                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'message-header';
                    headerDiv.textContent = role === 'user' ? 'You' : 'AI Assistant';

                    const contentDiv = document.createElement('div');
                    contentDiv.innerHTML = content.replace(/\\n/g, '<br>');

                    messageDiv.appendChild(headerDiv);
                    messageDiv.appendChild(contentDiv);
                    chatMessages.appendChild(messageDiv);

                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }

                function showTyping() {
                    typingIndicator.style.display = 'block';
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }

                function hideTyping() {
                    typingIndicator.style.display = 'none';
                }

                function clearChat() {
                    vscode.postMessage({ type: 'clearChat' });
                }

                function clearChatView() {
                    // Keep only the welcome message
                    while (chatMessages.children.length > 1) {
                        chatMessages.removeChild(chatMessages.lastChild);
                    }
                    hideTyping();
                }

                function sendMessage() {
                    const text = chatInput.value.trim();
                    if (text) {
                        vscode.postMessage({ type: 'sendMessage', text: text });
                        chatInput.value = '';
                        autoResize(chatInput);
                        sendButton.disabled = true;
                    }
                }

                function handleKeyDown(event) {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                    }
                }

                function autoResize(textarea) {
                    textarea.style.height = 'auto';
                    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
                    sendButton.disabled = !textarea.value.trim();
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.type) {
                        case 'addMessage':
                            addMessage(message.role, message.content);
                            break;
                        case 'showTyping':
                            showTyping();
                            break;
                        case 'hideTyping':
                            hideTyping();
                            break;
                        case 'clearChat':
                            clearChatView();
                            break;
                    }
                });

                // Initialize
                chatInput.focus();
                autoResize(chatInput);
            </script>
        </body>
        </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}