import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import axios from 'axios';

export class ServerManager {
    private serverProcess: ChildProcess | undefined;

    async startServer(context: vscode.ExtensionContext): Promise<void> {
        // 1. Locate server.py inside the extension installation folder
        const serverPath = path.join(context.extensionPath, 'server.py');
        console.log(`Launching server from: ${serverPath}`);

        // 2. Try multiple sources for Python path
        let pythonPath = this.findPythonPath();

        console.log(`Launching server with: ${pythonPath}`);

        // 3. Spawn using that specific python
        this.serverProcess = spawn(pythonPath, [serverPath]);

        // 4. Handle Server Output (for debugging)
        this.serverProcess.stdout?.on('data', (data) => {
            console.log(`[Server]: ${data}`);
        });

        this.serverProcess.stderr?.on('data', (data) => {
            console.error(`[Server Error]: ${data}`);
        });

        this.serverProcess.on('error', (error) => {
            console.error(`Failed to start server: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to start GPT-2 server: ${error.message}`);
        });

        this.serverProcess.on('close', (code) => {
            console.log(`Server exited with code ${code}`);
            if (code !== 0 && code !== null) {
                vscode.window.showErrorMessage(`GPT-2 Server crashed (Code: ${code}). Check Output panel.`);
            }
        });
    }

    stopServer(): void {
        if (this.serverProcess) {
            console.log('Killing GPT-2 Server...');
            this.serverProcess.kill();
            this.serverProcess = undefined;
        }
    }

    isRunning(): boolean {
        return this.serverProcess !== undefined && !this.serverProcess.killed;
    }

    async waitForServer(maxRetries: number = 30, delayMs: number = 1000): Promise<boolean> {
        for (let i = 0; i < maxRetries; i++) {
            try {
                await axios.get('http://127.0.0.1:8000/models', { timeout: 2000 });
                console.log('Server is ready! Warming up model...');

                // Warm up the model for better performance
                try {
                    await axios.post('http://127.0.0.1:8000/warmup', {}, { timeout: 10000 });
                    console.log('Model warmed up successfully!');
                } catch (warmupError: any) {
                    console.warn('Model warmup failed, but server is ready:', warmupError.message);
                }

                return true;
            } catch (error) {
                console.log(`Waiting for server... (${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        console.error('Server failed to start within timeout');
        return false;
    }

    private findPythonPath(): string {
        // Try VS Code Python configuration
        const pythonConfig = vscode.workspace.getConfiguration('python');
        let pythonPath = pythonConfig.get<string>('defaultInterpreterPath');

        if (pythonPath && pythonPath !== 'python') {
            return pythonPath;
        }

        // Try common Python executables
        const candidates = process.platform === 'win32'
            ? ['python', 'python3', 'py']
            : ['python3', 'python'];

        // Could add environment detection here (conda, virtualenv, etc.)
        // For now, return first candidate
        return candidates[0];
    }
}
