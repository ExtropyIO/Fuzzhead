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
function generateMockValue(typeKind, typeName) {
    if (mockGeneratorRegistry[typeName]) return mockGeneratorRegistry[typeName]();
    if (typeName.endsWith('[]')) {
        const baseType = typeName.slice(0, -2);
        return Array.from({ length: 3 }, () => generateMockValue(typeKind, baseType));
    }
    switch (typeName) {
        case 'Field': return Field.random();
        case 'Bool': return Bool(Math.random() > 0.5);
        case 'PublicKey': return PrivateKey.random().toPublicKey();
        case 'PrivateKey': return PrivateKey.random();
        case 'UInt32': return UInt32.from(Math.floor(Math.random() * 1000));
        case 'UInt64': return UInt64.from(Math.floor(Math.random() * 1_000_000));
    }
    switch (typeKind) {
        case 152: return Math.random().toString(36).substring(2, 7); // string
        case 148: return Math.floor(Math.random() * 1000); // number
        case 136: return Math.random() > 0.5; // boolean
        default: return null;
    }
}

async function executeContractMethod(name, instance, methodName, args, sender, senderKey, proofsEnabled, zkAppPrivateKey) {
    if (args.includes(null)) { outputLogs.push(`  -> Skipping ${name}(...) (unsupported param types)`); return; }
    const argsString = args.map(a => (typeof a === 'object' && a !== null && !Array.isArray(a)) ? `{...${a.constructor.name}}` : JSON.stringify(a)).join(', ');
    let line = `  -> Calling ${name}(${argsString})... `;
    try {
        const method = instance[methodName];
        const txn = await Mina.transaction({ sender, fee: 0 }, async () => {
            if (!proofsEnabled) instance.requireSignature();
            await method.apply(instance, args);
        });
        if (proofsEnabled) await txn.prove?.();
        const keys = proofsEnabled ? [senderKey] : [senderKey, zkAppPrivateKey].filter(Boolean);
        await txn.sign(keys).send();
        outputLogs.push(line + '✅ Success');
    } catch (e) {
        outputLogs.push(line + '❌ Error');
        outputLogs.push(`     Message: ${e.message}`);
    }
}

async function analyseAndRun(sourceTsPath, bundlePath) {
    outputLogs.push(`\nFuzzing file: ${path.basename(bundlePath)}`);
    outputLogs.push(`   (Source: ${path.basename(sourceTsPath)})`);
    outputLogs.push('-'.repeat(50));

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
    outputLogs.push(`Imported module exports: ${Object.keys(targetModule).join(', ')}`);

    // Optional custom mocks
    if (targetModule.Sudoku) registerMockGenerator('Sudoku', () => targetModule.Sudoku.from(Array(9).fill(0).map(() => Array(9).fill(0))));

    const moduleSymbol = checker.getSymbolAtLocation(sourceFileForAst);
    if (!moduleSymbol) { outputLogs.push('[Error] Could not find module symbol.'); return; }
    const exports = checker.getExportsOfModule(moduleSymbol);
    outputLogs.push(`Found ${exports.length} exports in the module.`);

    for (const exportSymbol of exports) {
        const resolvedSymbol = (exportSymbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(exportSymbol) : exportSymbol;
        const declaration = resolvedSymbol.declarations?.[0];
        if (!declaration) continue;

        if (ts.isClassDeclaration(declaration)) {
            const className = resolvedSymbol.name;
            outputLogs.push(`  - Found class: ${className}`);

            // runtime check: extends SmartContract?
            const ZkappClass = targetModule[className];
            const extendsSmart = typeof ZkappClass === 'function' && (ZkappClass.prototype instanceof SmartContract);
            if (!extendsSmart) {
                outputLogs.push(`   - Not a SmartContract (runtime check)`);
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
            const proofsEnabled = process.env.COMPILE !== '0'; // default: proofs ON
            const shouldCompile = proofsEnabled;
            try {
                outputLogs.push(`- ${shouldCompile ? 'Compiling' : 'Skipping compile'} ${className}...`);
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
                outputLogs.push(`- Instantiated ${className} successfully.`);

                const initMethodInfo = methodInfos.find(m => m.name === 'init');

                // 1) Deploy in its own transaction
                const deployTxn = await Mina.transaction({ sender: deployerAccount, fee: 0 }, async () => {
                    instance.deploy({ zkappKey: zkAppPrivateKey });
                    // Set verification key from compiled contract
                    instance.account.verificationKey.set(ZkappClass._verificationKey);
                });
                if (proofsEnabled) await deployTxn.prove?.();
                outputLogs.push(`- Signing deploy txn with keys: feePayer=${!!deployerKey}, zkKey=${!!zkAppPrivateKey}`);
                await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();
                outputLogs.push(`- Deployed ${className} to local Mina.`);

                // 2) Call init (if present) in a separate transaction
                if (initMethodInfo && process.env.SKIP_INIT !== '1') {
                    const mockArgs = initMethodInfo.node.parameters.map(p => {
                        const tName = p.type?.getText(sourceFileForAst) || '';
                        return generateMockValue(p.type?.kind ?? 131, tName);
                    });
                    if (!mockArgs.includes(null)) {
                        const initTxn = await Mina.transaction({ sender: deployerAccount, fee: 0 }, async () => {
                            if (!proofsEnabled) instance.requireSignature();
                            await instance.init.apply(instance, mockArgs);
                        });
                        if (proofsEnabled) await initTxn.prove?.();
                        const initKeys = proofsEnabled ? [deployerKey] : [deployerKey, zkAppPrivateKey];
                        await initTxn.sign(initKeys).send();
                        outputLogs.push(`- Ran init() in a separate transaction.`);
                    } else {
                        outputLogs.push(`  - Skipping init() due to un-mockable params.`);
                    }
                } else if (process.env.SKIP_INIT === '1') {
                    outputLogs.push(`- SKIP_INIT=1: skipping init()`);
                }

                // Execute @method-decorated (excluding init)
                let executeList = methodInfos.filter(i => i.decoratorNames.some(n => n.includes('method'))).filter(i => i.name !== 'init');
                if (executeList.length === 0) outputLogs.push(`   - No @method methods found to execute (excluding 'init').`);

                const sender = Local.testAccounts[1];
                for (const info of executeList) {
                    const mockArgs = info.node.parameters.map(p => {
                        const tName = p.type?.getText(sourceFileForAst) || '';
                        return generateMockValue(p.type?.kind ?? 131, tName);
                    });
                    await executeContractMethod(`${className}.${info.name}`, instance, info.name, mockArgs, sender.publicKey, sender.privateKey, proofsEnabled, zkAppPrivateKey);
                }
            } catch (e) {
                outputLogs.push(`- Error during local run: ${e.message}`);
                if (e.stack) outputLogs.push(e.stack);
            }
        }
    }
}

async function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error('Usage: node src/fuzz-local.mjs path/to/Contract.ts');
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
    let external = ['o1js-unsafe-bindings'];
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
        external = [...Object.keys(pkg.dependencies || {}), ...external];
    } catch { }

    // Transpile TS -> JS with legacy decorators & metadata
    const tsSource = fs.readFileSync(absInput, 'utf-8');
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
        fileName: path.basename(absInput)
    });
    fs.writeFileSync(compiledJsPath, transpiled.outputText);

    await esbuild.build({
        entryPoints: [compiledJsPath],
        bundle: true,
        outfile: bundlePath,
        format: 'esm',
        platform: 'node',
        target: 'es2022',
        external
    });

    await analyseAndRun(absInput, bundlePath);
    console.log(outputLogs.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });