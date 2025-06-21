import * as path from 'path';
import * as ts from 'typescript';
import * as fs from 'fs';

// (generateMockValue and executeFunction are unchanged)
function generateMockValue(typeKind: ts.SyntaxKind, typeName: string): any {
    if (typeKind === ts.SyntaxKind.TypeReference && typeName === 'Sudoku') { return null; }
    switch (typeKind) {
        case ts.SyntaxKind.StringKeyword: return Math.random().toString(36).substring(2, 7);
        case ts.SyntaxKind.NumberKeyword: return Math.floor(Math.random() * 1000);
        case ts.SyntaxKind.BooleanKeyword: return Math.random() > 0.5;
        default: return null;
    }
}
async function executeFunction(name: string, func: (...args: any[]) => any, args: any[]): Promise<void> {
    if (args.includes(null)) {
        process.stdout.write(`  -> Skipping ${name}(...) due to unsupported parameter types.\n`);
        return;
    }
    const argsString = args.map(arg => JSON.stringify(arg) ?? 'undefined').join(', ');
    process.stdout.write(`  -> Calling ${name}(${argsString})... `);
    try {
        const result = await func(...args);
        console.log(`✅ Success`);
        if(result !== undefined) { console.log(`     Output:`, result); }
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

    const moduleSymbol = checker.getSymbolAtLocation(sourceFileForAst);
    if (!moduleSymbol) { return; }

    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const exportSymbol of exports) {
        // =================================================================
        // --- THIS IS THE CORRECTED DEBUGGING BLOCK ---
        console.log(`\n---> Processing Export Symbol: '${exportSymbol.name}'`);

        // Step 1: Check the 'Alias' flag on the symbol to see if it's an alias.
        const isAlias = (exportSymbol.flags & ts.SymbolFlags.Alias) !== 0;

        // Step 2: Resolve the alias to get the original symbol if it is one.
        const resolvedSymbol = isAlias
            ? checker.getAliasedSymbol(exportSymbol) 
            : exportSymbol;
        
        if (isAlias) {
            console.log(`   - It's an alias, resolved to symbol '${resolvedSymbol.name}'.`);
        } else {
            console.log(`   - It's not an alias.`);
        }

        // Step 3: Get the declaration from the final, resolved symbol.
        const declaration = resolvedSymbol.declarations?.[0];
        console.log(`   - Final declaration kind is: ${ts.SyntaxKind[declaration?.kind ?? 0]}`);
        // =================================================================

        if (!declaration) continue;

        // --- STAGE 1 & 2 LOGIC (using the final resolved declaration) ---
        if (ts.isFunctionDeclaration(declaration) || (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isArrowFunction(declaration.initializer))) {
            const funcToRun = targetModule[resolvedSymbol.name];
            if (typeof funcToRun !== 'function') continue;
            let parameters: ts.NodeArray<ts.ParameterDeclaration>;
            if (ts.isFunctionDeclaration(declaration)) {
                parameters = declaration.parameters;
            } else {
                parameters = (declaration.initializer as ts.ArrowFunction).parameters;
            }
            const mockArgs = parameters.map(p => generateMockValue(p.type?.kind ?? ts.SyntaxKind.AnyKeyword, p.type?.getText(sourceFileForAst) || ''));
            await executeFunction(resolvedSymbol.name, funcToRun, mockArgs);
        }
        else if (ts.isClassDeclaration(declaration)) {
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
                declaration.members.forEach(async (member) => {
                    if (ts.isMethodDeclaration(member)) {
                        const hasMethodDecorator = ts.canHaveDecorators(member) && ts.getDecorators(member)?.some(d => d.expression.getText(sourceFileForAst).startsWith('method'));
                        if (hasMethodDecorator) {
                            const methodName = member.name.getText(sourceFileForAst);
                            const mockArgs = member.parameters.map(p => generateMockValue(p.type?.kind ?? ts.SyntaxKind.AnyKeyword, p.type?.getText(sourceFileForAst) || ''));
                            await executeFunction(`${className}.${methodName}`, instance[methodName].bind(instance), mockArgs);
                        }
                    }
                });
            }
        }
    }
}

// --- Script Entry Point (Unchanged) ---
const main = () => {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Usage: node dist/testParser.js <path-to-source-ts-file>");
        process.exit(1);
    }
    analyseAndRunFunctions(targetFile).catch(err => console.error(err));
};

main();