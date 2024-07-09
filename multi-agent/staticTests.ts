import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

export function staticTests(filePath: string): string {
  let results = '';

  // Test 1: Check if the file contains valid TypeScript code
  function checkValidTypeScript(filePath: string): string {
    try {
      const sourceCode = fs.readFileSync(filePath, 'utf-8');
      
      // Attempt to parse the code
      new Function(sourceCode);
      
      return "Test Passed: Code appears to be syntactically valid and executable.\n";
    } catch (error) {
      return `Test Failed: Code contains syntax errors: ${error}\n`;
    }
  }
  // function checkValidTypeScript(): void {
  //   const program = ts.createProgram([filePath], {});
  //   const diagnostics = ts.getPreEmitDiagnostics(program);
  //
  //   if (diagnostics.length === 0) {
  //     results += "Test 1 Passed: File contains valid TypeScript code.\n";
  //   } else {
  //     results += "Test 1 Failed: TypeScript errors found:\n";
  //     diagnostics.forEach((diagnostic) => {
  //       if (diagnostic.file) {
  //         const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
  //         const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  //         results += `  Line ${line + 1}, Column ${character + 1}: ${message}\n`;
  //       } else {
  //         results += `  ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}\n`;
  //       }
  //     });
  //   }
  // }

  // Test 2: Check URL validity in string literals
  function checkURLs(): void {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
    const stringLiteralRegex = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

    let match;
    let validURLs = 0;
    let invalidURLs = 0;

    while ((match = stringLiteralRegex.exec(fileContent)) !== null) {
      const stringLiteral = match[0].slice(1, -1);  // Remove quotes
      if (stringLiteral.includes('http')) {
        if (urlRegex.test(stringLiteral)) {
          validURLs++;
        } else {
          invalidURLs++;
          results += `Invalid URL found: ${stringLiteral}\n`;
        }
      }
    }

    results += `Test 2 Results: Found ${validURLs} valid URLs and ${invalidURLs} invalid URLs.\n`;
    if (invalidURLs === 0) {
      results += "Test 2 Passed: All URLs in string literals are valid.\n";
    } else {
      results += "Test 2 Failed: Invalid URLs found in string literals.\n";
    }
  }

  try {
    checkValidTypeScript();
    checkURLs();
  } catch (error) {
    results += `Error running tests: ${error}\n`;
  }

  return results;
}

// Usage example:
// const testResults = staticTests('/path/to/your/typescript/file.ts');
// console.log(testResults);
