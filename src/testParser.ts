import * as path from 'path';
import * as ts from 'typescript';
import * as fs from 'fs';

// This function is unchanged
function generateMockValue(typeKind: ts.SyntaxKind): any {
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

// This function is unchanged
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
        if(result !== undefined) {
             console.log(`     Output:`, result);
        }
    } catch (e: any) {
        console.log(`❌ Error`);
        console.log(`     Message: ${e.message}`);
    }
}

async function analyseAndRunFunctions(sourceTsFile: string) {
    // --- Path validation and locating the compiled JS file ---
    const absoluteTsPath = path.resolve(sourceTsFile);
    if (!fs.existsSync(absoluteTsPath)) {
        console.error(`[Error] Source TypeScript file not found: ${absoluteTsPath}`);
        return;
    }
    const tsConfigPath = ts.findConfigFile(absoluteTsPath, ts.sys.fileExists, 'tsconfig.json');
    if (!tsConfigPath) {
        console.error(`[Error] Could not find a 'tsconfig.json' for the file: ${absoluteTsPath}`);
        return;
    }
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    const configContent = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsConfigPath));
    
    // Read outDir and rootDir, which are now required for the script to work reliably
    const outDir = configContent.options.outDir;
    const rootDir = configContent.options.rootDir;

    if (!outDir || !rootDir) {
        console.error(`[Error] The 'tsconfig.json' at ${tsConfigPath} must specify both "outDir" and "rootDir".`);
        return;
    }

    // --- THIS IS THE CORRECTED PATH LOGIC ---
    // It correctly maps a file from the rootDir to the outDir.
    const relativePathFromRoot = path.relative(rootDir, absoluteTsPath);
    const jsPathInDist = relativePathFromRoot.replace(/\.ts$/, '.js');
    const absoluteJsPath = path.join(outDir, jsPathInDist);
    // --- END OF CORRECTION ---

    if (!fs.existsSync(absoluteJsPath)) {
        console.error(`[Error] Compiled JavaScript file not found at calculated path: ${absoluteJsPath}`);
        console.error(`Please ensure your project has been compiled with 'tsc'.`);
        return;
    }
    
    console.log(`\nFuzzing file: ${path.basename(absoluteJsPath)}`);
    console.log(`   (Source: ${path.basename(absoluteTsPath)})`);
    console.log('-'.repeat(50));
    
    const program = ts.createProgram([absoluteTsPath], {});
    const sourceFileForAst = program.getSourceFile(absoluteTsPath);
    if (!sourceFileForAst) {
        console.error(`[Error] Could not load source file: ${absoluteTsPath}`);
        return;
    }
    const checker = program.getTypeChecker();
    const targetModule = await import(`file://${absoluteJsPath}?v=${Date.now()}`);

    const moduleSymbol = checker.getSymbolAtLocation(sourceFileForAst);
    if (!moduleSymbol) {
        console.error("Could not find module symbol.");
        return;
    }

    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const exportSymbol of exports) {
        const functionName = exportSymbol.name;
        const declaration = exportSymbol.valueDeclaration;

        if (declaration && (ts.isFunctionDeclaration(declaration) || (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isArrowFunction(declaration.initializer)))) {
            const funcToRun = targetModule[functionName];
            if (typeof funcToRun !== 'function') continue;

            let parameters: ts.NodeArray<ts.ParameterDeclaration>;
            if (ts.isFunctionDeclaration(declaration)) {
                parameters = declaration.parameters;
            } else {
                parameters = (declaration.initializer as ts.ArrowFunction).parameters;
            }
            
            const mockArgs = parameters.map(param => {
                const typeKind = param.type?.kind ?? ts.SyntaxKind.AnyKeyword;
                return generateMockValue(typeKind);
            });

            await executeFunction(functionName, funcToRun, mockArgs);
        }
    }
}

// This function is unchanged
const main = () => {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Usage: node dist/testParser.js <path-to-source-ts-file>");
        process.exit(1);
    }
    analyseAndRunFunctions(targetFile).catch(err => console.error(err));
};

main();