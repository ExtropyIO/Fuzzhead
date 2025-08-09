// index.mjs
// Final version using esbuild-wasm and marking dependencies as external.

import path from 'path';
import ts from 'typescript';
import fs from 'fs';
import { PrivateKey, Field, Bool, UInt32, UInt64, Mina, AccountUpdate } from 'o1js';
import esbuild from 'esbuild-wasm'; // Use the WASM version

// --- All helper functions are unchanged ---
let outputLogs = [];
const mockGeneratorRegistry = {};
function registerMockGenerator(typeName, generator) { mockGeneratorRegistry[typeName] = generator; }
function generateMockValue(typeKind, typeName) {
    if (mockGeneratorRegistry[typeName]) return mockGeneratorRegistry[typeName]();
    // Handle array types like Field[] or Bool[]
    if (typeName.endsWith('[]')) {
        const baseType = typeName.slice(0, -2);
        return Array.from({ length: 3 }, () => generateMockValue(typeKind, baseType));
    }

    switch (typeName) {
        case 'Field':
            return Field.random();
        case 'Bool':
            return Bool(Math.random() > 0.5);
        case 'PublicKey':
            return PrivateKey.random().toPublicKey();
        case 'PrivateKey':
            return PrivateKey.random();
        case 'UInt32':
            return UInt32.from(Math.floor(Math.random() * 1000));
        case 'UInt64':
            return UInt64.from(Math.floor(Math.random() * 1_000_000));
    }

    switch (typeKind) {
        case 152: return Math.random().toString(36).substring(2, 7);
        case 148: return Math.floor(Math.random() * 1000);
        case 136: return Math.random() > 0.5;
        default: return null;
    }
}

async function executeContractMethod(name, instance, methodName, args, sender, senderKey) {
    if (args.includes(null)) { outputLogs.push(`  -> Skipping ${name}(...) due to unsupported parameter types.`); return; }
    const argsString = args.map(arg => (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) ? `{...${arg.constructor.name}}` : JSON.stringify(arg)).join(', ');
    let logLine = `  -> Calling ${name}(${argsString})... `;
    try {
        const method = instance[methodName];
        const txn = await Mina.transaction(sender, () => {
            method.apply(instance, args);
        });
        await txn.prove();
        await txn.sign([senderKey]).send();

        logLine += `✅ Success`;
        outputLogs.push(logLine);
    } catch (e) {
        logLine += `❌ Error`;
        outputLogs.push(logLine);
        outputLogs.push(`     Message: ${e.message}`);
        if (e.stack) {
            outputLogs.push(`     Stack: ${e.stack}`);
        }
    }
}

// --- Main Fuzzer Logic (unchanged) ---
async function analyseAndRun(sourceTsPath, bundledJsPath) {
    outputLogs.push(`\nFuzzing file: ${path.basename(bundledJsPath)}`);
    outputLogs.push(`   (Source: ${path.basename(sourceTsPath)})`);
    outputLogs.push('-'.repeat(50));

    const program = ts.createProgram([sourceTsPath], {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
    });
    const sourceFileForAst = program.getSourceFile(sourceTsPath);
    if (!sourceFileForAst) { outputLogs.push("[Error] Could not get source file AST."); return; }
    const checker = program.getTypeChecker();

    let targetModule;
    try {
        const importUrl = `file://${bundledJsPath}?v=${Date.now()}`;
        outputLogs.push(`Attempting to import: ${importUrl}`);
        const imported = await import(importUrl);
        targetModule = imported.default ?? imported;
        outputLogs.push(`Imported module exports: ${Object.keys(targetModule).join(', ')}`);
    } catch (importError) {
        outputLogs.push(`❌ Failed to import bundled module: ${importError.message}`);
        outputLogs.push(`Import error details: ${importError.stack}`);
        return;
    }

    if (targetModule.Sudoku) registerMockGenerator('Sudoku', () => targetModule.Sudoku.from(Array(9).fill(0).map(() => Array(9).fill(0))));
    if (targetModule.Player) registerMockGenerator('Player', () => new targetModule.Player({ publicKey: PrivateKey.random().toPublicKey() }));

    const moduleSymbol = checker.getSymbolAtLocation(sourceFileForAst);
    if (!moduleSymbol) { outputLogs.push("[Error] Could not find module symbol."); return; }

    const exports = checker.getExportsOfModule(moduleSymbol);
    outputLogs.push(`Found ${exports.length} exports in the module.`);

    // Keep track of classes we have already handled
    const seenClasses = new Set();

    for (const exportSymbol of exports) {
        const resolvedSymbol = (exportSymbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(exportSymbol) : exportSymbol;
        const declaration = resolvedSymbol.declarations?.[0];
        if (!declaration) {
            outputLogs.push(`  - Export ${resolvedSymbol.name}: No declaration found`);
            continue;
        }

        if (ts.isClassDeclaration(declaration)) {
            const className = resolvedSymbol.name;

            // Skip duplicate aliases (e.g. default + named export)
            if (seenClasses.has(className)) {
                outputLogs.push(`  - Duplicate class export: ${className} (skipping)`);
                continue;
            }
            seenClasses.add(className);
            outputLogs.push(`  - Found class: ${className}`);

            // Check for SmartContract inheritance
            const heritageClauses = declaration.heritageClauses || [];
            let isSmartContract = false;

            for (const clause of heritageClauses) {
                for (const type of clause.types) {
                    const baseTypeName = type.expression.getText(sourceFileForAst);
                    outputLogs.push(`    - Extends: ${baseTypeName}`);
                    if (baseTypeName === 'SmartContract') {
                        isSmartContract = true;
                    }
                }
            }

            if (isSmartContract) {
                outputLogs.push(`✅ Found SmartContract: ${className}`);
                const ZkappClass = targetModule[className];
                let instance;
                let isDeployed = false;
                let Local;

                try {
                    outputLogs.push(`- Compiling ${className}...`);
                    await ZkappClass.compile();
                    outputLogs.push(`- Compilation successful.`);
                } catch (e) {
                    outputLogs.push(`- ⚠️ Could not compile ${className}: ${e.message}`);
                    if (e.stack) outputLogs.push(e.stack);
                    return;
                }

                try {
                    outputLogs.push(`- Setting up local Mina instance.`);
                    Local = await Mina.LocalBlockchain({ proofsEnabled: false });
                    Mina.setActiveInstance(Local);
                } catch (e) {
                    outputLogs.push(`- ⚠️ Could not set up local Mina instance: ${e.message}`);
                    if (e.stack) outputLogs.push(e.stack);
                    return;
                }

                const deployer = Local.testAccounts[0];
                const deployerAccount = deployer.publicKey;
                const deployerKey = deployer.privateKey;
                const zkAppPrivateKey = PrivateKey.random();
                const zkAppAddress = zkAppPrivateKey.toPublicKey();
                outputLogs.push(`- Network and accounts configured.`);

                const methodInfos = declaration.members.filter(ts.isMethodDeclaration).map(m => {
                    let decoratorsArr;
                    if (ts.canHaveDecorators?.(m)) decoratorsArr = ts.getDecorators(m);
                    else decoratorsArr = m.decorators;
                    const decoratorNames = decoratorsArr?.map(d => d.expression.getText(sourceFileForAst)) || [];
                    return { name: m.name.getText(sourceFileForAst), decoratorNames, node: m };
                });
                outputLogs.push('-'.repeat(50));

                try {
                    instance = new ZkappClass(zkAppAddress);
                    outputLogs.push(`- Instantiated ${className} successfully.`);

                    const initMethodInfo = methodInfos.find(m => m.name === 'init');

                    const txn = await Mina.transaction(deployerAccount, () => {
                        AccountUpdate.fundNewAccount(deployerAccount);
                        instance.deploy();

                        if (initMethodInfo) {
                            outputLogs.push(`   - Found 'init' method. Calling it during deployment.`);
                            const mockArgs = initMethodInfo.node.parameters.map(p => {
                                const tName = p.type?.getText(sourceFileForAst) || '';
                                const val = generateMockValue(p.type?.kind ?? 131, tName);
                                if (val === null) {
                                    outputLogs.push(`     - Cannot generate mock for 'init' param type '${tName}'`);
                                }
                                return val;
                            });

                            if (!mockArgs.includes(null)) {
                                instance.init.apply(instance, mockArgs);
                            } else {
                                outputLogs.push(`   - Skipping 'init' call due to un-mockable parameters.`);
                            }
                        }
                    });

                    await txn.prove();
                    await txn.sign([deployerKey, zkAppPrivateKey]).send();
                    isDeployed = true;
                    outputLogs.push(`- Deployed ${className} to local Mina instance.`);
                } catch (e) {
                    outputLogs.push(`- ⚠️ Could not instantiate or deploy ${className}: ${e.message}`);
                    if (e.stack) outputLogs.push(e.stack);
                }


                if (instance && isDeployed) {
                    let executeList = methodInfos.filter(i => i.decoratorNames.some(n => n.includes('method')));
                    executeList = executeList.filter(i => i.name !== 'init');

                    if (executeList.length === 0) {
                        outputLogs.push(`   - No @method-decorated methods found to execute (excluding 'init').`);
                    } else {
                        outputLogs.push(`   - Found ${executeList.length} @method-decorated methods to execute.`);
                    }

                    const sender = Local.testAccounts[1];


                    for (const info of executeList) {
                        const mockArgs = info.node.parameters.map(p => {
                            const tName = p.type?.getText(sourceFileForAst) || '';
                            const val = generateMockValue(p.type?.kind ?? 131, tName);
                            if (val === null) {
                                outputLogs.push(`     - Cannot generate mock for param type '${tName}'`);
                            }
                            return val;
                        });
                        await executeContractMethod(`${className}.${info.name}`, instance, info.name, mockArgs, sender.publicKey, sender.privateKey);
                    }
                }
            } else {
                outputLogs.push(`   - Not a SmartContract (doesn't extend SmartContract)`);
            }
        } else {
            outputLogs.push(`  - Export ${resolvedSymbol.name}: Not a class (${declaration.kind})`);
        }
    }

    if (exports.length === 0) {
        outputLogs.push("No exports found in the module. Make sure your SmartContract is exported.");
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
        const bundleFileName = 'fuzz-bundle.mjs';

        const targetTsPath = path.join('/tmp', targetFileName);
        const compiledJsPath = path.join('/tmp', compiledFileName);
        const bundlePath = path.join('/tmp', bundleFileName);

        fs.writeFileSync(targetTsPath, userCode);

        const program = ts.createProgram([targetTsPath], {
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            useDefineForClassFields: false,
            outDir: '/tmp',
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
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
            target: 'es2022',
            // Pass the list of external dependencies here.
            external: [...externalDeps, 'o1js-unsafe-bindings'],
        });
        outputLogs.push("Compilation and bundling successful.");

        // Ensure /tmp/node_modules points to our function's node_modules so that imports resolve correctly
        try {
            const tmpNodeModules = path.join('/tmp', 'node_modules');
            const funcNodeModules = path.join(process.cwd(), 'node_modules');
            if (!fs.existsSync(tmpNodeModules)) {
                fs.symlinkSync(funcNodeModules, tmpNodeModules, 'dir');
                outputLogs.push(`Created symlink: ${tmpNodeModules} -> ${funcNodeModules}`);
            }
        } catch (symlinkErr) {
            outputLogs.push(`Could not create node_modules symlink: ${symlinkErr.message}`);
        }

        // Debug: Show the first few lines of the bundled file
        // try {
        //     const bundleContent = fs.readFileSync(bundlePath, 'utf-8');
        //     const firstLines = bundleContent.split('\n').slice(0, 5).join('\n');
        //     outputLogs.push(`Bundle preview (first 5 lines):\n${firstLines}`);
        // } catch (e) {
        //     outputLogs.push(`Could not read bundle file: ${e.message}`);
        // }

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