import * as ts from "typescript";
import { file } from "bun";

export async function staticTests(filePath: string): Promise<string> {
  let results = "";

  // Test 1: Check if the file contains valid TypeScript code
  async function checkValidTypeScript(): Promise<void> {
    try {
      const fileContent = await file(filePath).text();
      const sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true,
      );

      const syntaxErrors = sourceFile.parseDiagnostics;

      if (syntaxErrors.length === 0) {
        results +=
          "Syntax Test Passed: File contains valid TypeScript syntax.\n";
      } else {
        const errorMessages = syntaxErrors
          .map((error) =>
            ts.flattenDiagnosticMessageText(error.messageText, "\n"),
          )
          .join("\n");
        results += `Syntax Test Failed: TypeScript syntax errors found:\n${errorMessages}\n`;
      }
    } catch (error) {
      results += `Syntax Test Error: Unable to analyze file: ${error.message}\n`;
    }
  }

  // Test 2: Check URL validity in string literals
  async function checkURLs(): Promise<void> {
    try {
      const fileContent = await file(filePath).text();
      const urlRegex =
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
      const stringLiteralRegex =
        /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

      let validURLs = 0;
      let invalidURLs = 0;

      let match;
      while ((match = stringLiteralRegex.exec(fileContent)) !== null) {
        const stringLiteral = match[0].slice(1, -1); // Remove quotes
        if (stringLiteral.includes("http")) {
          if (urlRegex.test(stringLiteral)) {
            validURLs++;
          } else {
            invalidURLs++;
            results += `Invalid URL found: ${stringLiteral}\n`;
          }
        }
      }

      results += `URL Test Results: Found ${validURLs} valid URLs and ${invalidURLs} invalid URLs.\n`;
      if (invalidURLs === 0) {
        results += "URL Test Passed: All URLs in string literals are valid.\n";
      } else {
        results += "URL Test Failed: Invalid URLs found in string literals.\n";
      }
    } catch (error) {
      results += `URL Test Error: Unable to check URLs: ${error.message}\n`;
    }
  }

  try {
    await checkValidTypeScript();
    await checkURLs();
  } catch (error) {
    results += `Error running tests: ${error}\n`;
  }

  return results;
}

// Usage example:
// staticTests('/path/to/your/typescript/file.ts').then(console.log);import * as ts from 'typescript';
// console.log(await staticTests("generated-tests.ts"));
