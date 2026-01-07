import * as vscode from 'vscode';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}

export class Logger {
    private static instance: Logger;
    private logLevel: LogLevel = LogLevel.INFO;

    private constructor() {
        this.updateLogLevel();
        vscode.workspace.onDidChangeConfiguration(() => {
            this.updateLogLevel();
        });
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private updateLogLevel(): void {
        const config = vscode.workspace.getConfiguration('codeCompletion');
        const level = config.get<string>('logLevel', 'info');
        switch (level) {
            case 'error': this.logLevel = LogLevel.ERROR; break;
            case 'warn': this.logLevel = LogLevel.WARN; break;
            case 'info': this.logLevel = LogLevel.INFO; break;
            case 'debug': this.logLevel = LogLevel.DEBUG; break;
        }
    }

    error(message: string, ...args: any[]): void {
        if (this.logLevel >= LogLevel.ERROR) {
            console.error(`[GPT-2 Extension] ${message}`, ...args);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.logLevel >= LogLevel.WARN) {
            console.warn(`[GPT-2 Extension] ${message}`, ...args);
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.logLevel >= LogLevel.INFO) {
            console.info(`[GPT-2 Extension] ${message}`, ...args);
        }
    }

    debug(message: string, ...args: any[]): void {
        if (this.logLevel >= LogLevel.DEBUG) {
            console.debug(`[GPT-2 Extension] ${message}`, ...args);
        }
    }
}