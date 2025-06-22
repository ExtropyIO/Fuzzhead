import * as path from 'path';
import * as ts from 'typescript';
import * as fs from 'fs';

const mockGeneratorRegistry: { [key: string]: () => any } = {};

function registerMockGenerator(typeName: string, generator: () => any) {
    mockGeneratorRegistry[typeName] = generator;
}

function generateMockValue(typeKind: ts.SyntaxKind, typeName: string): any {
    if (mockGeneratorRegistry[typeName]) {
        return mockGeneratorRegistry[typeName]();
    }
    switch (typeKind) {
        case ts.SyntaxKind.StringKeyword:
            return Math.random().toString(36).substring(2, 7);
        case ts.SyntaxKind.NumberKeyword:
            return Math.floor(Math.random() * 1000);
        case ts.SyntaxKind.BooleanKeyword:
            return Math.random() > 0.5;
        default:
            return null;
    }
}

async function executeFunction(name: string, func: (...args: any[]) => any, args: any[]): Promise<void> {
    if (args.includes(null)) {
        process.stdout.write(`  -> Skipping ${name}(...) due to unsupported parameter types.\n`);
        return;
    }
    const argsString = args.map(arg => {
        if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
            return `{...${arg.constructor.name}}`;
        }
        return JSON.stringify(arg);
    }).join(', ');

    process.stdout.write(`  -> Calling ${name}(${argsString})... `);
    try {
        const result = await func(...args);
        console.log(`✅ Success`);
        if(result !== undefined) {
             console.log(`     Output:`, result);
        }
    } catch (e: any) {
        console.log(`❌ Error`);
        console.log(`     Message: ${e.message}`);
    }
}

async function analyseAndRunFunctions(sourceTsFile: string) {

    const absoluteTsPath = path.resolve(sourceTsFile);
    if (!fs.existsSync(absoluteTsPath)) { console.error(`[Error] Source TypeScript file not found: ${absoluteTsPath}`); return; }
    const tsConfigPath = ts.findConfigFile(absoluteTsPath, ts.sys.fileExists, 'tsconfig.json');
    if (!tsConfigPath) { console.error(`[Error] Could not find a 'tsconfig.json' for the file: ${absoluteTsPath}`); return; }
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    const configContent = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsConfigPath));
    const outDir = configContent.options.outDir;
    const rootDir = configContent.options.rootDir;
    if (!outDir || !rootDir) { console.error(`[Error] The 'tsconfig.json' at ${tsConfigPath} must specify both "outDir" and "rootDir".`); return; }
    const relativePathFromRoot = path.relative(rootDir, absoluteTsPath);
    const jsPathInDist = relativePathFromRoot.replace(/\.ts$/, '.js');
    const absoluteJsPath = path.join(outDir, jsPathInDist);
    if (!fs.existsSync(absoluteJsPath)) { console.error(`[Error] Compiled JavaScript file not found at calculated path: ${absoluteJsPath}`); return; }
    
    console.log(`\nFuzzing file: ${path.basename(absoluteJsPath)}`);
    console.log(`   (Source: ${path.basename(absoluteTsPath)})`);
    console.log('-'.repeat(50));
    
    const program = ts.createProgram([absoluteTsPath], {});
    const sourceFileForAst = program.getSourceFile(absoluteTsPath);
    if (!sourceFileForAst) { return; }
    const checker = program.getTypeChecker();
    const targetModule = await import(`file://${absoluteJsPath}?v=${Date.now()}`);

    
// Generator for the Sudoku example
    const SudokuClass = targetModule.Sudoku;
    if (SudokuClass) {
        registerMockGenerator('Sudoku', () => {
            const emptyBoard = Array(9).fill(0).map(() => Array(9).fill(0));
            return SudokuClass.from(emptyBoard);
        });
        console.log("   - Registered custom mock generator for type 'Sudoku'.");
    }


    // 1. Get the custom `Player` class from the imported tictactoe module
    const PlayerClass = targetModule.Player; 

    // 2. Register a generator for the 'Player' type
    if (PlayerClass) {
        registerMockGenerator('Player', () => {
            // TODO: Fill in the logic to create a valid Player instance.
            
            const { PrivateKey } = require('o1js'); // You might need to import o1js types
            const mockKey = PrivateKey.random().toPublicKey();
            return new PlayerClass({ publicKey: mockKey});
        });
        console.log("   - Registered custom mock generator for type 'Player'.");
    }


    const moduleSymbol = checker.getSymbolAtLocation(sourceFileForAst);
    if (!moduleSymbol) { return; }

    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const exportSymbol of exports) {
        const resolvedSymbol = (exportSymbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(exportSymbol) : exportSymbol;
        const declaration = resolvedSymbol.declarations?.[0];
        if (!declaration) continue;

        if (ts.isClassDeclaration(declaration)) {
            const className = resolvedSymbol.name;
            const isSmartContract = declaration.heritageClauses?.some(c => c.types.some(t => t.expression.getText(sourceFileForAst) === 'SmartContract')) ?? false;

            if (isSmartContract) {
                console.log(`✅ Found SmartContract: ${className}`);
                let instance;
                try {
                    const ClassToRun = targetModule[className];
                    instance = new ClassToRun();
                    console.log(`   - Instantiated ${className} successfully.`);
                } catch (e: any) {
                    console.log(`   - ❌ Failed to instantiate ${className}: ${e.message}`);
                    continue; 
                }
                
                // --- THIS IS THE FIX ---
                // We use a `for...of` loop to ensure methods are awaited serially.
                for (const member of declaration.members) {
                    if (ts.isMethodDeclaration(member)) {
                        const hasMethodDecorator = ts.canHaveDecorators(member) && ts.getDecorators(member)?.some(d => d.expression.getText(sourceFileForAst).startsWith('method'));
                        if (hasMethodDecorator) {
                            const methodName = member.name.getText(sourceFileForAst);
                            const mockArgs = member.parameters.map(p => generateMockValue(p.type?.kind ?? ts.SyntaxKind.AnyKeyword, p.type?.getText(sourceFileForAst) || ''));
                            await executeFunction(`${className}.${methodName}`, instance[methodName].bind(instance), mockArgs);
                        }
                    }
                }
            }
        }
    }
}

const main = () => {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Usage: node dist/testParser.js <path-to-source-ts-file>");
        process.exit(1);
    }
    analyseAndRunFunctions(targetFile).catch(err => console.error(err));
};

main();