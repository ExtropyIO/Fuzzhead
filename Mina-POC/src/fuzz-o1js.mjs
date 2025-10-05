import path from 'path';
import fs from 'fs';
import os from 'os';
import url from 'url';
import ts from 'typescript';
import esbuild from 'esbuild';
import { Mina, PrivateKey, AccountUpdate, Field, Bool, UInt32, UInt64, SmartContract } from 'o1js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
let outputLogs = [];

// Mock generators
const mockGeneratorRegistry = {};
function registerMockGenerator(typeName, generator) { mockGeneratorRegistry[typeName] = generator; }

// Standard types that work everywhere
const SUPPORTED_TYPES = [
    'Field', 'Bool', 'UInt32', 'UInt64', 'UInt8',
    'PublicKey', 'PrivateKey', 'Signature',
    'Group', 'Scalar', 'string', 'number', 'boolean'
];

function generateStandardType(typeName) {
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
        case 'UInt8':
            return UInt8.from(Math.floor(Math.random() * 256));
        case 'string':
            return Math.random().toString(36).substring(2, 7);
        case 'number':
            return Math.floor(Math.random() * 1000);
        case 'boolean':
            return Math.random() > 0.5;
        default:
            return null;
    }
}

function generateMockValue(typeKind, typeName) {
    // Handle arrays of supported types
    if (typeName.endsWith('[]')) {
        const baseType = typeName.slice(0, -2);
        if (SUPPORTED_TYPES.includes(baseType)) {
            return Array.from({ length: 3 }, () => generateMockValue(typeKind, baseType));
        }
        return null; // Unsupported array type
    }

    // Standard o1js types
    if (SUPPORTED_TYPES.includes(typeName)) {
        return generateStandardType(typeName);
    }

    // Custom/unknown type
    return null; // Signal: "can't generate this"
}

async function executeContractMethod(name, instance, methodName, args, sender, senderKey, proofsEnabled, zkAppPrivateKey) {
    try {
        const method = instance[methodName];
        const txn = await Mina.transaction({ sender, fee: 0 }, async () => {
            await method.apply(instance, args);
            if (!proofsEnabled) {
                // When proofs are disabled, require signature authorization
                instance.requireSignature();
            }
        });
        if (proofsEnabled) {
            await txn.prove();
        }
        const keys = proofsEnabled ? [senderKey] : [senderKey, zkAppPrivateKey].filter(Boolean);
        await txn.sign(keys).send();
        return { status: 'passed' };
    } catch (e) {
        return { status: 'failed', error: e.message };
    }
}

async function analyseAndRun(sourceTsPath, bundlePath) {
    outputLogs.push(`\nFuzzing file: ${path.basename(sourceTsPath)}`);
    outputLogs.push('-'.repeat(50));

    // Get number of fuzz runs from environment variable, default to 200
    const numFuzzRuns = parseInt(process.env.FUZZ_RUNS || '200');

    // AST for methods/decorators
    const program = ts.createProgram([sourceTsPath], {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext
    });
    const sourceFileForAst = program.getSourceFile(sourceTsPath);
    if (!sourceFileForAst) { outputLogs.push('[Error] Could not get source file AST.'); return; }
    const checker = program.getTypeChecker();

    // Import bundled module
    const mod = await import(`file://${bundlePath}?v=${Date.now()}`);
    const targetModule = mod.default ?? mod;

    // Find all SmartContract classes in the file (exported or not)
    const allSmartContractClasses = [];

    function findSmartContractClasses(node) {
        if (ts.isClassDeclaration(node) && node.name) {
            const className = node.name.text;

            // Check if it extends SmartContract
            const extendsSmartContract = node.heritageClauses?.some(clause =>
                clause.token === ts.SyntaxKind.ExtendsKeyword &&
                clause.types.some(type => type.expression.getText(sourceFileForAst) === 'SmartContract')
            );

            if (extendsSmartContract) {
                allSmartContractClasses.push({ name: className, declaration: node });
            }
        }
        ts.forEachChild(node, findSmartContractClasses);
    }

    findSmartContractClasses(sourceFileForAst);

    for (const { name: className, declaration } of allSmartContractClasses) {

        // Try to get the class from the module
        let ZkappClass = targetModule[className];

        if (!ZkappClass) {
            outputLogs.push(`⚠️  ${className} is not exported, skipping for now`);
            continue;
        }

        // Runtime check: extends SmartContract?
        const extendsSmart = typeof ZkappClass === 'function' && (ZkappClass.prototype instanceof SmartContract);
        if (!extendsSmart) {
            outputLogs.push(`   - ${className} not a SmartContract (runtime check)`);
            continue;
        }

        outputLogs.push(`✅ Found SmartContract: ${className}`);

        // Collect methods + decorators
        const methodInfos = declaration.members.filter(ts.isMethodDeclaration).map(m => {
            let decoratorsArr;
            if (ts.canHaveDecorators?.(m)) decoratorsArr = ts.getDecorators(m);
            else decoratorsArr = m.decorators;
            const decoratorNames = decoratorsArr?.map(d => d.expression.getText(sourceFileForAst)) || [];
            return { name: m.name.getText(sourceFileForAst), decoratorNames, node: m };
        });
        outputLogs.push('-'.repeat(50));

        // Local chain + optional compile
        const proofsEnabled = process.env.COMPILE === '1'; // default: proofs OFF
        const shouldCompile = proofsEnabled;
        try {
            if (shouldCompile) {
                await ZkappClass.compile();
                outputLogs.push(`- Compilation successful.`);
            } else {
                outputLogs.push(`- Running with proofs disabled (COMPILE=0).`);
            }

            const Local = await Mina.LocalBlockchain({ proofsEnabled });
            Mina.setActiveInstance(Local);

            const acc0 = Local.testAccounts[0];
            let deployerKey;
            let deployerAccount;
            if (acc0 && 'privateKey' in acc0 && acc0.privateKey) {
                deployerKey = acc0.privateKey;
                deployerAccount = acc0.publicKey;
            } else if (acc0 && 'key' in acc0 && acc0.key) {
                deployerKey = acc0.key;
                deployerAccount = acc0.key.toPublicKey();
            } else if (acc0 instanceof PrivateKey) {
                deployerKey = acc0;
                deployerAccount = acc0.toPublicKey();
            } else {
                throw new Error('Could not read deployer key from Local.testAccounts[0]');
            }
            // Use an existing funded local account as zkApp key to avoid account-creation logic
            const acc2 = Local.testAccounts[2];
            let zkAppPrivateKey;
            let zkAppAddress;
            if (acc2 && 'privateKey' in acc2 && acc2.privateKey) {
                zkAppPrivateKey = acc2.privateKey;
                zkAppAddress = acc2.publicKey;
            } else if (acc2 && 'key' in acc2 && acc2.key) {
                zkAppPrivateKey = acc2.key;
                zkAppAddress = acc2.key.toPublicKey();
            } else if (acc2 instanceof PrivateKey) {
                zkAppPrivateKey = acc2;
                zkAppAddress = acc2.toPublicKey();
            } else {
                zkAppPrivateKey = PrivateKey.random();
                zkAppAddress = zkAppPrivateKey.toPublicKey();
            }

            const instance = new ZkappClass(zkAppAddress);

            const initMethodInfo = methodInfos.find(m => m.name === 'init');

            // Deploy in its own transaction
            const deployTxn = await Mina.transaction({ sender: deployerAccount, fee: 0 }, async () => {
                instance.deploy({ zkappKey: zkAppPrivateKey });
                // Set verification key from compiled contract only if proofs are enabled
                if (proofsEnabled && ZkappClass._verificationKey) {
                    instance.account.verificationKey.set(ZkappClass._verificationKey);
                }
            });
            if (proofsEnabled) await deployTxn.prove?.();
            outputLogs.push(`- Signing deploy txn with keys: feePayer=${!!deployerKey}, zkKey=${!!zkAppPrivateKey}`);
            await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();
            outputLogs.push(`- Deployed ${className} to local Mina.`);

            // Simplified init handling - accept that state may not be initialized
            if (initMethodInfo && process.env.SKIP_INIT !== '1') {
                const mockArgs = initMethodInfo.node.parameters.map(p => {
                    const tName = p.type?.getText(sourceFileForAst) || '';
                    return generateMockValue(p.type?.kind ?? 131, tName);
                });

                // Always call init, even if it has no parameters
                if (mockArgs.length === 0 || !mockArgs.includes(null)) {
                    try {
                        if (proofsEnabled) {
                            // When proofs are enabled, call init in a transaction with proper proving
                            const initTxn = await Mina.transaction({ sender: deployerAccount, fee: 0 }, async () => {
                                await instance.init.apply(instance, mockArgs);
                            });
                            await initTxn.prove();
                            await initTxn.sign([deployerKey]).send();
                            outputLogs.push(`- Ran init() in a transaction with proofs.`);
                        } else {
                            // When proofs are disabled, skip init entirely to avoid authorization issues
                            outputLogs.push(`- Skipping init() when proofs disabled to avoid authorization issues.`);
                            outputLogs.push(`- Note: Some methods may fail due to uninitialized state - this is expected for fuzzing.`);
                        }

                    } catch (e) {
                        outputLogs.push(`- Error during init: ${e.message}`);
                        outputLogs.push(`- Continuing with fuzzing - some methods may fail due to uninitialized state.`);
                    }
                } else {
                    outputLogs.push(`  - Skipping init() due to un-mockable params.`);
                }
            } else if (process.env.SKIP_INIT === '1') {
                outputLogs.push(`- SKIP_INIT=1: skipping init()`);
            } else {
                outputLogs.push(`- No init() method found.`);
            }

            // Execute @method-decorated (excluding init)
            let executeList = methodInfos.filter(i => i.decoratorNames.some(n => n.includes('method'))).filter(i => i.name !== 'init');

            if (executeList.length === 0) {
                outputLogs.push(`   - No @method methods found to execute (excluding 'init').`);
            } else {
                const acc1 = Local.testAccounts[1];
                let senderKey;
                let senderAccount;
                if (acc1 && 'privateKey' in acc1 && acc1.privateKey) {
                    senderKey = acc1.privateKey;
                    senderAccount = acc1.publicKey;
                } else if (acc1 && 'key' in acc1 && acc1.key) {
                    senderKey = acc1.key;
                    senderAccount = acc1.key.toPublicKey();
                } else if (acc1 instanceof PrivateKey) {
                    senderKey = acc1;
                    senderAccount = acc1.toPublicKey();
                } else {
                    throw new Error('Could not read sender key from Local.testAccounts[1]');
                }

                let passedCount = 0;
                let failedCount = 0;
                let skippedCount = 0;

                outputLogs.push(`- Starting fuzzing of ${executeList.length} method(s)...`);
                outputLogs.push(``);

                for (const info of executeList) {

                    if (info.node.parameters.length === 0) {
                        outputLogs.push(``);
                        outputLogs.push(`- Skipping method: ${info.name} (no input parameters)`);
                        continue;
                    }

                    outputLogs.push(``);
                    outputLogs.push(`- Fuzzing method: ${info.name}`);

                    for (let i = 0; i < numFuzzRuns; i++) {
                        const mockArgs = info.node.parameters.map(p => {
                            const tName = p.type?.getText(sourceFileForAst) || '';
                            return generateMockValue(p.type?.kind ?? 131, tName);
                        });

                        if (mockArgs.includes(null)) {
                            skippedCount++;
                        } else {
                            const result = await executeContractMethod(`${className}.${info.name}`, instance, info.name, mockArgs, senderAccount, senderKey, proofsEnabled, zkAppPrivateKey);
                            if (result.status === 'passed') {
                                passedCount++;
                                // Log successful test with input values
                                const argsStr = mockArgs.map(arg => {
                                    if (arg && typeof arg === 'object' && arg.toString) {
                                        return arg.toString();
                                    }
                                    return String(arg);
                                }).join(', ');
                                // outputLogs.push(`  ✅ ${className}.${info.name}() PASSED on iteration ${i + 1} with args: [${argsStr}]`);
                            } else {
                                outputLogs.push(`  ❌ ${className}.${info.name}() FAILED on iteration ${i + 1}: ${result.error}`);
                                failedCount++;
                            }
                        }
                    }
                }

                // Enhanced summary message
                const totalTested = passedCount + failedCount;
                const totalRuns = totalTested + skippedCount;
                outputLogs.push(`\n🏁 Fuzzing complete:`);
                outputLogs.push(`   ✅ ${passedCount} runs passed`);
                outputLogs.push(`   ❌ ${failedCount} runs failed`);
                if (skippedCount > 0) {
                    outputLogs.push(`   ⏭️  ${skippedCount} runs skipped (unsupported parameter types)`);
                }
                outputLogs.push(`   📊 Total: ${totalRuns} runs across ${executeList.length} method(s)`);
                outputLogs.push(`   🔄 ${numFuzzRuns} iterations per method`);
            }
        } catch (e) {
            outputLogs.push(`- Error during local run: ${e.message}`);
            if (e.stack) outputLogs.push(e.stack);
        }
    }
}

// Function to find all TypeScript dependencies
function findTsDependencies(tsFilePath, visited = new Set()) {
    if (visited.has(tsFilePath)) return [];
    visited.add(tsFilePath);

    const dependencies = [];
    const sourceCode = fs.readFileSync(tsFilePath, 'utf-8');
    const sourceFile = ts.createSourceFile(tsFilePath, sourceCode, ts.ScriptTarget.Latest, true);

    function visit(node) {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const importPath = node.moduleSpecifier.text;
            if (importPath.startsWith('./') || importPath.startsWith('../')) {
                const baseDir = path.dirname(tsFilePath);
                const resolvedPath = path.resolve(baseDir, importPath);
                const tsPath = resolvedPath.endsWith('.ts') ? resolvedPath : resolvedPath + '.ts';

                if (fs.existsSync(tsPath)) {
                    dependencies.push(tsPath);
                    // Recursively find dependencies of this file
                    dependencies.push(...findTsDependencies(tsPath, visited));
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return dependencies;
}

async function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error('Usage: node src/fuzz-o1js.mjs path/to/Contract.ts');
        console.error('');
        console.error('Environment variables:');
        console.error('  FUZZ_RUNS=<number>    Number of fuzz iterations per method (default: 200)');
        console.error('  COMPILE=0             Disable proofs for faster testing');
        console.error('  SKIP_INIT=1           Skip init() method execution');
        process.exit(1);
    }
    const absInput = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
    if (!fs.existsSync(absInput)) {
        console.error(`File not found: ${absInput}`);
        process.exit(1);
    }

    // Bundle with esbuild, externalize deps from package.json
    const outDir = path.join(process.cwd(), '.fuzz');
    fs.mkdirSync(outDir, { recursive: true });
    const bundlePath = path.join(outDir, 'fuzz-local-bundle.mjs');
    const compiledJsPath = path.join(outDir, 'compiled.js');
    let external = [
        'o1js',
        'o1js-unsafe-bindings',
        'cachedir',
        'os', 'fs', 'path', 'url', 'crypto', 'util', 'stream', 'events', 'buffer',
        'child_process', 'cluster', 'dgram', 'dns', 'http', 'https', 'net', 'tls',
        'readline', 'repl', 'string_decoder', 'tty', 'vm', 'zlib', 'assert',
        'constants', 'domain', 'punycode', 'querystring', 'timers', 'v8',
        'worker_threads', 'perf_hooks', 'trace_events', 'async_hooks', 'inspector',
        'module', 'process', 'console'
    ];
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
        external = [...Object.keys(pkg.dependencies || {}), ...external];
    } catch { }

    // Find all TypeScript dependencies
    const allTsFiles = [absInput, ...findTsDependencies(absInput)];
    console.log(`Found ${allTsFiles.length} TypeScript files to transpile:`, allTsFiles.map(f => path.basename(f)));

    // Transpile all TS files -> JS with legacy decorators & metadata
    const transpiledFiles = new Map();

    for (const tsFile of allTsFiles) {
        const tsSource = fs.readFileSync(tsFile, 'utf-8');
        const transpiled = ts.transpileModule(tsSource, {
            compilerOptions: {
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                useDefineForClassFields: false,
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                esModuleInterop: true,
                allowSyntheticDefaultImports: true
            },
            fileName: path.basename(tsFile)
        });

        const jsFileName = path.basename(tsFile, '.ts') + '.js';
        const jsPath = path.join(outDir, jsFileName);
        fs.writeFileSync(jsPath, transpiled.outputText);
        transpiledFiles.set(tsFile, jsPath);
    }

    // Write the main compiled file
    const mainTranspiledContent = fs.readFileSync(transpiledFiles.get(absInput), 'utf-8');
    fs.writeFileSync(compiledJsPath, mainTranspiledContent);

    try {
        await esbuild.build({
            entryPoints: [compiledJsPath],
            bundle: true,
            outfile: bundlePath,
            format: 'esm',
            platform: 'node',
            target: 'es2022',
            external,
            resolveExtensions: ['.js', '.ts'],
            plugins: [{
                name: 'resolve-relative-imports',
                setup(build) {
                    build.onResolve({ filter: /^\./ }, (args) => {
                        const resolvedPath = path.resolve(path.dirname(args.importer), args.path);
                        const jsPath = resolvedPath.endsWith('.js') ? resolvedPath : resolvedPath + '.js';

                        // Check if we have a transpiled version
                        if (fs.existsSync(jsPath)) {
                            return { path: jsPath };
                        }

                        // Fallback to original resolution
                        return null;
                    });
                }
            }]
        });
    } catch (buildError) {
        // Check if the error is related to module resolution
        if (buildError.message && buildError.message.includes('Could not resolve')) {
            console.error('\n🚨 ESBuild Resolution Error Detected!🚨\n');
            console.error('\n💡 Recommended Solution:');
            console.error('To continue fuzzing, temporarily comment out local file imports in your TypeScript file.');
            console.error('After commenting out the imports, run the fuzzer again.');
            console.error('Note: This will limit fuzzing to methods that don\'t depend on these imports.');
            process.exit(1);
        } else {
            // Re-throw other build errors
            throw buildError;
        }
    }

    await analyseAndRun(absInput, bundlePath);
    console.log(outputLogs.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });