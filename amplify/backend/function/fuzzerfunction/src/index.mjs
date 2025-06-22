// index.mjs
// Final version using esbuild-wasm and marking dependencies as external.

import path from 'path';
import ts from 'typescript';
import fs from 'fs';
import { PrivateKey } from 'o1js';
import esbuild from 'esbuild-wasm'; // Use the WASM version

// --- All helper functions are unchanged ---
let outputLogs = [];
const mockGeneratorRegistry = {};
function registerMockGenerator(typeName, generator) { mockGeneratorRegistry[typeName] = generator; }
function generateMockValue(typeKind, typeName) {
    if (mockGeneratorRegistry[typeName]) return mockGeneratorRegistry[typeName]();
    switch (typeKind) {
        case 152: return Math.random().toString(36).substring(2, 7);
        case 148: return Math.floor(Math.random() * 1000);
        case 136: return Math.random() > 0.5;
        default: return null;
    }
}
async function executeFunction(name, func, args) {
    if (args.includes(null)) { outputLogs.push(`  -> Skipping ${name}(...) due to unsupported parameter types.`); return; }
    const argsString = args.map(arg => (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) ? `{...${arg.constructor.name}}` : JSON.stringify(arg)).join(', ');
    let logLine = `  -> Calling ${name}(${argsString})... `;
    try {
        const result = await func(...args);
        logLine += `✅ Success`;
        outputLogs.push(logLine);
        if (result !== undefined) outputLogs.push(`     Output: ${JSON.stringify(result)}`);
    } catch (e) {
        logLine += `❌ Error`;
        outputLogs.push(logLine);
        outputLogs.push(`     Message: ${e.message}`);
    }
}

// --- Main Fuzzer Logic (unchanged) ---
async function analyseAndRun(sourceTsPath, bundledJsPath) {
    outputLogs.push(`\nFuzzing file: ${path.basename(bundledJsPath)}`);
    outputLogs.push(`   (Source: ${path.basename(sourceTsPath)})`);
    outputLogs.push('-'.repeat(50));

    const program = ts.createProgram([sourceTsPath], {});
    const sourceFileForAst = program.getSourceFile(sourceTsPath);
    if (!sourceFileForAst) { outputLogs.push("[Error] Could not get source file AST."); return; }
    const checker = program.getTypeChecker();
    
    const targetModule = await import(`file://${bundledJsPath}?v=${Date.now()}`);

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
                    instance = new targetModule[className]();
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
    outputLogs = [];
    try {
        const body = JSON.parse(event.body);
        const userCode = body.code;
        
        const targetFileName = 'fuzz-target.ts';
        const compiledFileName = 'fuzz-target.js';
        const bundleFileName = 'fuzz-bundle.js';

        const targetTsPath = path.join('/tmp', targetFileName);
        const compiledJsPath = path.join('/tmp', compiledFileName);
        const bundlePath = path.join('/tmp', bundleFileName);

        fs.writeFileSync(targetTsPath, userCode);
        
        const program = ts.createProgram([targetTsPath], {
            outDir: '/tmp',
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            esModuleInterop: true,
        });
        const emitResult = program.emit();
        if (emitResult.emitSkipped) throw new Error("TypeScript compilation failed.");
        
        // --- THIS IS THE FIX ---
        // Read our function's own package.json to find its dependencies.
        const pkgJsonPath = path.join(process.cwd(), 'package.json');
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        // Mark all dependencies as "external" so esbuild doesn't try to bundle them.
        const externalDeps = Object.keys(pkgJson.dependencies || {});

        await esbuild.build({
            entryPoints: [compiledJsPath],
            bundle: true,
            outfile: bundlePath,
            format: 'esm',
            platform: 'node',
            // Pass the list of external dependencies here.
            external: [...externalDeps, 'o1js-unsafe-bindings'], 
        });
        outputLogs.push("Compilation and bundling successful.");
        
        // Run the fuzzer on the BUNDLED file
        await analyseAndRun(targetTsPath, bundlePath);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Fuzzing complete.", output: outputLogs.join('\n') }),
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "An error occurred during fuzzing.", error: error.message, output: outputLogs.join('\n') }),
        };
    }
};
