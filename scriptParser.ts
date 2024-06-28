import * as ts from 'typescript';
import { readFileSync } from 'fs';

interface ScriptInfo {
  mainFunctionArgs: Record<string, string>;
  typeDefinitions: Record<string, Record<string, string>>;
}

function extractScriptInfo(filePath: string): ScriptInfo {
  const sourceCode = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const mainFunctionArgs: Record<string, string> = {};
  const typeDefinitions: Record<string, Record<string, string>> = {};

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.getText() === 'main') {
      node.parameters.forEach((param) => {
        const name = param.name.getText();
        const type = param.type ? param.type.getText() : 'any';
        mainFunctionArgs[name] = type;
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      const typeName = node.name.getText();
      const typeObj: Record<string, string> = {};
      
      if (ts.isTypeLiteralNode(node.type)) {
        node.type.members.forEach((member) => {
          if (ts.isPropertySignature(member)) {
            const propName = member.name.getText();
            const propType = member.type ? member.type.getText() : 'any';
            typeObj[propName] = propType;
          }
        });
      }
      
      typeDefinitions[typeName] = typeObj;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { mainFunctionArgs, typeDefinitions };
}

export { extractScriptInfo, ScriptInfo };
