import * as path from 'path';
import * as ts from 'typescript';
import * as fs from 'fs';

// This function remains unchanged
function generateMockValue(typeKind: ts.SyntaxKind): any {
    switch (typeKind) {
        case ts.SyntaxKind.StringKeyword:
            return Math.random().toString(36).substring(2, 7);
        case ts.SyntaxKind.NumberKeyword:
            return Math.floor(Math.random() * 1000);
        case ts.SyntaxKind.BooleanKeyword:
            return Math.random() > 0.5;
        case ts.SyntaxKind.AnyKeyword:
            return "any-value";
        case ts.SyntaxKind.ObjectKeyword:
            return { message: "This is a mock object" };
        case ts.SyntaxKind.VoidKeyword:
            return undefined;
        default:
            // This is a placeholder for more complex types.
            return null;
    }
}

/**
 * The main function to analyse and run functions from a file.
 * @param sourceTsFile - The path to the source TypeScript file to be tested.
 */
async function analyseAndRunFunctions(sourceTsFile: string) {
    // --- Steps 1 & 2: Path validation and locating the compiled JS file ---
    // This logic is working correctly and remains unchanged.
    const absoluteTsPath = path.resolve(sourceTsFile);
    if (!fs.existsSync(absoluteTsPath)) {
        console.error(`[Error] Source TypeScript file not found: ${absoluteTsPath}`);
        return;
    }

    const tsConfigPath = ts.findConfigFile(absoluteTsPath, ts.sys.fileExists);
    if (!tsConfigPath) {
        console.error(`[Error] Could not find a 'tsconfig.json' for the file: ${absoluteTsPath}`);
        return;
    }

    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    const configContent = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsConfigPath));
    const outDir = configContent.options.outDir;
    if (!outDir) {
        console.error(`[Error] The 'tsconfig.json' at ${tsConfigPath} must specify an "outDir".`);
        return;
    }
    
    const rootDir = configContent.options.rootDir || path.dirname(tsConfigPath);
    const relativeTsPath = path.relative(rootDir, path.dirname(absoluteTsPath));
    const jsFileName = path.basename(absoluteTsPath, '.ts') + '.js';
    const absoluteJsPath = path.join(outDir, relativeTsPath, jsFileName);

    if (!fs.existsSync(absoluteJsPath)) {
        console.error(`[Error] Compiled JavaScript file not found at expected path: ${absoluteJsPath}`);
        console.error(`Please ensure the target project has been compiled with 'tsc'.`);
        return;
    }
    
    console.log(`\n Testing file: ${path.basename(absoluteJsPath)}`);
    console.log(`   (Source: ${path.basename(absoluteTsPath)})`);
    console.log('-'.repeat(50));
    
    // --- Step 3: Create the TypeScript Program and get the Type Checker ---
    const program = ts.createProgram([absoluteTsPath], { allowJs: true });
    const sourceFileForAst = program.getSourceFile(absoluteTsPath);
    if (!sourceFileForAst) {
        console.error(`[Error] Could not load source file in TypeScript program: ${absoluteTsPath}`);
        return;
    }
    // The Type Checker is the key to robustly finding exports.
    const checker = program.getTypeChecker();

    // --- Step 4: Dynamically import the compiled module ---
    let targetModule;
    try {
        targetModule = await import(`file://${absoluteJsPath}?v=${Date.now()}`);
    } catch (e) {
        console.error(`[Error] Failed to import module: ${absoluteJsPath}`, e);
        return;
    }

    // --- Step 5: Use the Type Checker to find all exports ---
    const moduleSymbol = checker.getSymbolAtLocation(sourceFileForAst);
    if (!moduleSymbol) {
        console.error("Could not find module symbol.");
        return;
    }

    const exports = checker.getExportsOfModule(moduleSymbol);
    exports.forEach(exportSymbol => {
        const functionName = exportSymbol.name;
        const declaration = exportSymbol.valueDeclaration;

        // Ensure the export is a function we can execute
        if (!declaration || !(ts.isFunctionDeclaration(declaration) || (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isArrowFunction(declaration.initializer)))) {
            return;
        }
        
        const funcToRun = targetModule[functionName];
        if (typeof funcToRun !== 'function') {
            return;
        }

        // Determine parameters based on the type of function declaration
        let parameters: ts.NodeArray<ts.ParameterDeclaration>;
        if (ts.isFunctionDeclaration(declaration)) {
            parameters = declaration.parameters;
        } else { // It's a VariableDeclaration with an ArrowFunction
            parameters = (declaration.initializer as ts.ArrowFunction).parameters;
        }
        
        const mockArgs = parameters.map(param => {
            const typeKind = param.type?.kind ?? ts.SyntaxKind.AnyKeyword;
            return generateMockValue(typeKind);
        });

        executeFunction(functionName, funcToRun, mockArgs);
    });
}

// This function remains unchanged
function executeFunction(name: string, func: (...args: any[]) => any, args: any[]): void {
    const argsString = args.map(arg => JSON.stringify(arg) ?? 'undefined').join(', ');
    process.stdout.write(`  -> Calling ${name}(${argsString})... `);
    try {
        const result = func(...args);
        console.log(`✅ Success`);
        // Only log output if it's not undefined
        if(result !== undefined) {
             console.log(`     Output:`, result);
        }
    } catch (e: any) {
        console.log(`❌ Error`);
        console.log(`     Message: ${e.message}`);
    }
}


// This entry point logic remains unchanged
const main = () => {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Usage: node testParser.js <path-to-source-ts-file>");
        console.error("Example: node dist/testParser.js ../otherProject/src/myFunctions.ts");
        process.exit(1);
    }
    analyseAndRunFunctions(targetFile);
};

main();