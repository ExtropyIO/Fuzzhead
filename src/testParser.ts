
import * as path from 'path';
import * as ts from 'typescript';
import * as fs from 'fs';


function generateMockValue(typeKind: ts.SyntaxKind): any {
    switch (typeKind) {
        case ts.SyntaxKind.StringKeyword:
            // Generate a random string of 5 letters
            return Math.random().toString(36).substring(2, 7);
        case ts.SyntaxKind.NumberKeyword:
            // Generate a random number between 0 and 1000
            return Math.floor(Math.random() * 1000);
        case ts.SyntaxKind.BooleanKeyword:
            // Return a random boolean
            return Math.random() > 0.5;
        case ts.SyntaxKind.AnyKeyword:
            return "any-value";
        case ts.SyntaxKind.ObjectKeyword:
            return { message: "This is a mock object" };
        case ts.SyntaxKind.VoidKeyword:
            return undefined;

// need some mina specific types

        default:
            // For complex types (interfaces, arrays, etc.), return a placeholder.
            console.warn(`[Warning] Unsupported type kind: ${ts.SyntaxKind[typeKind]}. Returning null.`);
            return null;
    }
}

/**
 * The main function to analyse and run functions from a file.
 * @param zkAppFile - The file path to the compiled JavaScript file to be tested.
 */
async function analyseAndRunFunctions(zkAppFile: string) {
    const absoluteJsPath = path.resolve(zkAppFile);
    // Derive the source TS file path from the JS file path.
    // This assumes they are in the same directory structure but with different extensions.
    const sourceTsFile = absoluteJsPath.replace(/\.js$/, '.ts').replace(path.join(process.cwd(), 'dist'), process.cwd());

    console.log(`\n Testing file: ${path.basename(zkAppFile)}`);
    console.log(`   (Source: ${path.basename(sourceTsFile)})`);
    console.log('-'.repeat(50));

    if (!fs.existsSync(sourceTsFile)) {
        console.error(`[Error] Source TypeScript file not found: ${sourceTsFile}`);
        return;
    }
    if (!fs.existsSync(absoluteJsPath)) {
        console.error(`[Error] Compiled JavaScript file not found: ${absoluteJsPath}. `);
        return;
    }

    // --- Step 1: Parse the source code with the TypeScript Compiler API ---
    const program = ts.createProgram([sourceTsFile], { allowJs: true });
    const sourceFile = program.getSourceFile(sourceTsFile);

    if (!sourceFile) {
        console.error(`[Error] Could not load source file in TypeScript program.`);
        return;
    }

    // --- Step 2: Dynamically import the compiled module ---
    let targetModule;
    try {
        // Use a cache-busting query to ensure we get the latest version
        targetModule = await import(`file://${absoluteJsPath}?v=${Date.now()}`);
    } catch (e) {
        console.error(`[Error] Failed to import module: ${absoluteJsPath}`, e);
        return;
    }


    // --- Step 3: Traverse the AST to find exported functions ---
    ts.forEachChild(sourceFile, (node) => {
        // Check for `export function myFunction(...)`
        const isExportedFunction = ts.isFunctionDeclaration(node) &&
            node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword);

        // Check for `export const myArrowFunc = (...) => ...`
        const isExportedArrowFunc = ts.isVariableStatement(node) &&
            node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword) &&
            node.declarationList.declarations.some(decl => decl.initializer && ts.isArrowFunction(decl.initializer));

        if (isExportedFunction) {
            const functionName = node.name?.getText(sourceFile);
            if (functionName) {
                const funcToRun = targetModule[functionName];
                if (typeof funcToRun === 'function') {
                    const mockArgs = node.parameters.map(param => {
                        const typeKind = param.type?.kind ?? ts.SyntaxKind.AnyKeyword;
                        return generateMockValue(typeKind);
                    });
                    executeFunction(functionName, funcToRun, mockArgs);
                }
            }
        } else if (isExportedArrowFunc) {
            const declaration = node.declarationList.declarations[0];
            const functionName = declaration.name.getText(sourceFile);
            const initializer = declaration.initializer as ts.ArrowFunction;

            if (functionName && ts.isArrowFunction(initializer)) {
                 const funcToRun = targetModule[functionName];
                if (typeof funcToRun === 'function') {
                    const mockArgs = initializer.parameters.map(param => {
                        const typeKind = param.type?.kind ?? ts.SyntaxKind.AnyKeyword;
                        return generateMockValue(typeKind);
                    });
                    executeFunction(functionName, funcToRun, mockArgs);
                }
            }
        }
    });
}


/**
 * Executes a function with mock arguments and logs the result.
 * @param name - The name of the function.
 * @param func - The actual function to execute.
 * @param args - An array of mock arguments.
 */
function executeFunction(name: string, func: (...args: any[]) => any, args: any[]): void {
    const argsString = args.map(arg => JSON.stringify(arg) ?? 'undefined').join(', ');
    process.stdout.write(`  -> Calling ${name}(${argsString})... `);
    try {
        const result = func(...args);
        console.log(`✅ Success`);
        console.log(`     Output:`, result);
    } catch (e: any) {
        console.log(`❌ Error`);
        console.log(`     Message: ${e.message}`);
    }
}


// --- Script Entry Point ---
const main = () => {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Usage: node run-functions.js <path-to-compiled-js-file>");
        console.error("Example: node dist/run-functions.js dist/myFunctions.js");
        process.exit(1);
    }
    analyseAndRunFunctions(targetFile);
};

main();
