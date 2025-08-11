// lambda-handler.mjs

import path from 'path';
import ts from 'typescript';
import fs from 'fs';
import { PrivateKey } from 'o1js'; // Correctly using 'import'

// This will hold our fuzzer's output logs to be returned to the user.
let outputLogs = [];
const mockGeneratorRegistry = {};

// --- Helper Functions  ---

function registerMockGenerator(typeName, generator) {
    mockGeneratorRegistry[typeName] = generator;
}

function generateMockValue(typeKind, typeName) {
    if (mockGeneratorRegistry[typeName]) {
        return mockGeneratorRegistry[typeName]();
    }
    // Using numeric values for SyntaxKind since we can't use the enum directly
    switch (typeKind) {
        case 152: // StringKeyword
            return Math.random().toString(36).substring(2, 7);
        case 148: // NumberKeyword
            return Math.floor(Math.random() * 1000);
        case 136: // BooleanKeyword
            return Math.random() > 0.5;
        default:
            return null;
    }
}

async function executeFunction(name, func, args) {
    if (args.includes(null)) {
        outputLogs.push(`  -> Skipping ${name}(...) due to unsupported parameter types.`);
        return;
    }
    const argsString = args.map(arg => {
        if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
            return `{...${arg.constructor.name}}`;
        }
        return JSON.stringify(arg);
    }).join(', ');

    outputLogs.push(`  -> Calling ${name}(${argsString})... `);
    try {
        const result = await func(...args);
        outputLogs[outputLogs.length - 1] += `✅ Success`; // Append to the "Calling..." line
        if (result !== undefined) {
             outputLogs.push(`     Output: ${JSON.stringify(result)}`);
        }
    } catch (e) {
        outputLogs[outputLogs.length - 1] += `❌ Error`; // Append to the "Calling..." line
        outputLogs.push(`     Message: ${e.message}`);
    }
}

// --- Main Fuzzer Logic (Refactored for Lambda) ---

async function analyseAndRun(sourceTsPath, bundledJsPath) {
    outputLogs.push(`\nFuzzing file: ${path.basename(bundledJsPath)}`);
    outputLogs.push(`   (Source: ${path.basename(sourceTsPath)})`);
    outputLogs.push('-'.repeat(50));

    const program = ts.createProgram([sourceTsPath], {});
    const sourceFileForAst = program.getSourceFile(sourceTsPath);
    if (!sourceFileForAst) { outputLogs.push("[Error] Could not get source file AST."); return; }
    const checker = program.getTypeChecker();
    
    const targetModule = await import(`file://${bundledJsPath}?v=${Date.now()}`);

    // Debug: Log what's in the module
    outputLogs.push(`   - Available exports: ${Object.keys(targetModule).join(', ')}`);

    if (targetModule.Sudoku) registerMockGenerator('Sudoku', () => targetModule.Sudoku.from(Array(9).fill(0).map(() => Array(9).fill(0))));
    if (targetModule.Player) registerMockGenerator('Player', () => new targetModule.Player({ publicKey: PrivateKey.random().toPublicKey() }));

    const moduleSymbol = checker.getSymbolAtLocation(sourceFileForAst);
    if (!moduleSymbol) { outputLogs.push("[Error] Could not find module symbol."); return; }

    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const exportSymbol of exports) {
        const resolvedSymbol = (exportSymbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(exportSymbol) : exportSymbol;
        const declaration = resolvedSymbol.declarations?.[0];
        if (!declaration) continue;

        if (ts.isClassDeclaration(declaration)) {
            const className = resolvedSymbol.name;
            const isSmartContract = declaration.heritageClauses?.some(c => c.types.some(t => t.expression.getText(sourceFileForAst) === 'SmartContract')) ?? false;

            if (isSmartContract) {
                outputLogs.push(`✅ Found SmartContract: ${className}`);
                let instance;
                try {
                    // Try different ways to get the constructor
                    let ClassConstructor = targetModule[className];
                    
                    // If it's not a constructor, try default export
                    if (typeof ClassConstructor !== 'function') {
                        ClassConstructor = targetModule.default;
                        outputLogs.push(`   - Trying default export for ${className}`);
                    }
                    
                    // If still not a constructor, try to find it in the module
                    if (typeof ClassConstructor !== 'function') {
                        outputLogs.push(`   - Class ${className} not found as constructor. Available: ${Object.keys(targetModule).join(', ')}`);
                        continue;
                    }
                    
                    instance = new ClassConstructor();
                    outputLogs.push(`   - Instantiated ${className} successfully.`);
                } catch (e) {
                    outputLogs.push(`   - ❌ Failed to instantiate ${className}: ${e.message}`);
                    continue; 
                }
                
                for (const member of declaration.members) {
                    if (ts.isMethodDeclaration(member)) {
                        const hasMethodDecorator = ts.canHaveDecorators(member) && ts.getDecorators(member)?.some(d => d.expression.getText(sourceFileForAst).startsWith('method'));
                        if (hasMethodDecorator) {
                            const methodName = member.name.getText(sourceFileForAst);
                            const mockArgs = member.parameters.map(p => generateMockValue(p.type?.kind ?? 131, p.type?.getText(sourceFileForAst) || ''));
                            await executeFunction(`${className}.${methodName}`, instance[methodName].bind(instance), mockArgs);
                        }
                    }
                }
            }
        }
    }
}

// --- Lambda Handler ---
export const handler = async (event) => {
    // Reset logs for each invocation
    outputLogs = [];
    
    try {
        const body = JSON.parse(event.body);
        const userCode = body.code;
        const targetFileName = 'fuzz-target.ts';
        const compiledFileName = 'fuzz-target.js';
        const targetTsPath = path.join('/tmp', targetFileName);
        const compiledJsPath = path.join('/tmp', compiledFileName);

        fs.writeFileSync(targetTsPath, userCode);
        outputLogs.push(`Successfully wrote code to ${targetTsPath}`);

        const program = ts.createProgram([targetTsPath], {
            outDir: '/tmp',
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.NodeNext, // Use ES Module output
            esModuleInterop: true,
            // Add other tsconfig options if needed
        });
        
        const emitResult = program.emit();
        if (emitResult.emitSkipped) {
            // Collect diagnostic messages if compilation fails
            const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
            allDiagnostics.forEach(diagnostic => {
                if (diagnostic.file) {
                    let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
                    let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                    outputLogs.push(`Compilation Error: ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
                } else {
                    outputLogs.push(`Compilation Error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
                }
            });
            throw new Error("TypeScript compilation failed.");
        }
        outputLogs.push(`Successfully compiled to ${compiledJsPath}`);

        // Call the main fuzzer logic
        await analyseAndRun(targetTsPath, compiledJsPath);

        // Return a success response
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                message: "Fuzzing complete.",
                output: outputLogs.join('\n')
            }),
        };

        
    } catch (error) {
        console.error(error);
        // Return an error response
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                message: "An error occurred during fuzzing.",
                error: error.message,
                output: outputLogs.join('\n')
            }),
        };
    }
};
