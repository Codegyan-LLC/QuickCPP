import { exec } from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let currentDecorationType: vscode.TextEditorDecorationType | undefined;
let errorDecorationType: vscode.TextEditorDecorationType | undefined;
let timeout: NodeJS.Timeout | undefined;

const defaultConfig = {
    executionDelay: 300,
    gppPath: 'g++',
    inlineColor: 'grey',
};

function activate(context: vscode.ExtensionContext) {
    const textChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            updateOutput(editor);
        }
    });

    const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
        const editor = event.textEditor;
        updateOutput(editor);
    });

    const blockExecutionDisposable = vscode.commands.registerCommand('quickcpp.runBlock', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            runSelectedBlock(editor);
        }
    });

    context.subscriptions.push(textChangeDisposable, selectionChangeDisposable, blockExecutionDisposable);
}

function updateOutput(editor: vscode.TextEditor) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        const documentText = editor.document.getText();
        runCppCode(documentText, editor);
    }, defaultConfig.executionDelay);
}

function clearOutput(editor: vscode.TextEditor) {
    if (currentDecorationType) {
        editor.setDecorations(currentDecorationType, []);
        currentDecorationType.dispose();
        currentDecorationType = undefined;
    }
    if (errorDecorationType) {
        editor.setDecorations(errorDecorationType, []);
        errorDecorationType.dispose();
        errorDecorationType = undefined;
    }
}

function runCppCode(code: string, editor: vscode.TextEditor) {
    const tempFilePath = path.join(__dirname, 'quickcpp.cpp');
    const outputFilePath = path.join(__dirname, 'quickcpp.out');
    fs.writeFileSync(tempFilePath, code);

    const gppPath = vscode.workspace.getConfiguration('quickcpp').get<string>('gppPath') || defaultConfig.gppPath;
    const startTime = Date.now();

    exec(`${gppPath} "${tempFilePath}" -o "${outputFilePath}" && "${outputFilePath}"`, (error, stdout, stderr) => {
        const endTime = Date.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(2);

        if (error || stderr) {
            clearOutput(editor);
            displayInlineOutput(stderr.trim() || (error ? error.message : 'Unknown error'), editor, executionTime, true);
        } else {
            clearOutput(editor);
            displayInlineOutput(stdout.trim(), editor, executionTime);
        }

        fs.unlinkSync(tempFilePath);
        if (fs.existsSync(outputFilePath)) {
            fs.unlinkSync(outputFilePath);
        }
    });
}

function runSelectedBlock(editor: vscode.TextEditor) {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText.trim()) {
        vscode.window.showErrorMessage('No C++ code selected to execute.');
        return;
    }

    const tempFilePath = path.join(__dirname, 'quickcpp_block.cpp');
    const outputFilePath = path.join(__dirname, 'quickcpp_block.out');
    fs.writeFileSync(tempFilePath, selectedText);

    const gppPath = vscode.workspace.getConfiguration('quickcpp').get<string>('gppPath') || defaultConfig.gppPath;

    exec(`${gppPath} "${tempFilePath}" -o "${outputFilePath}" && "${outputFilePath}"`, (error, stdout, stderr) => {
        if (error || stderr) {
            vscode.window.showErrorMessage(stderr.trim() || (error ? error.message : 'Unknown error'));
        } else {
            vscode.window.showInformationMessage(stdout.trim());
        }

        fs.unlinkSync(tempFilePath);
        if (fs.existsSync(outputFilePath)) {
            fs.unlinkSync(outputFilePath);
        }
    });
}

function displayInlineOutput(output: string, editor: vscode.TextEditor, executionTime: string, isError = false) {
    if (!output.trim()) {return;}
    clearOutput(editor);

    const color = isError ? 'red' : vscode.workspace.getConfiguration('quickcpp').get<string>('inlineColor') || defaultConfig.inlineColor;
    const formattedOutput = isError ? `Error: ${output} (Execution Time: ${executionTime}s)` : `${output} (Execution Time: ${executionTime}s)`;

    const currentLine = editor.selection.active.line;
    const targetLineText = editor.document.lineAt(currentLine).text;
    const decorations: vscode.DecorationOptions[] = [
        {
            range: new vscode.Range(currentLine, targetLineText.length, currentLine, targetLineText.length),
            renderOptions: {
                after: {
                    contentText: ` // ${formattedOutput}`,
                    color,
                },
            },
        },
    ];

    currentDecorationType = vscode.window.createTextEditorDecorationType({});
    editor.setDecorations(currentDecorationType, decorations);
}

function deactivate() {
    if (currentDecorationType) {currentDecorationType.dispose();}
    if (errorDecorationType) {errorDecorationType.dispose();}
}

module.exports = { activate, deactivate };
