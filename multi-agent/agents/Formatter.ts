import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getEnvVariableNames, getDependencies } from "../read-local";
import * as fs from "fs/promises";
import * as path from "path";

const formatter = await createAgent(
  "Formatter",
  `
  You are a formatter for TypeScript scripts in the Windmill integration hub.
  Your task is to read all scripts in the 'hub' directory, verify that they have the same resource type at the start of each file,
  and rewrite any scripts that don't adhere to this format.

  Key requirements:
  1. Ensure all scripts in an integration folder have the same resource type definition at the start.
  2. The resource type must have the same name and attributes across all scripts.
  3. If a script doesn't conform, rewrite it to match the format of the majority.
  4. Preserve the functionality of any rewritten scripts.
  5. Use only the available environment variables and dependencies listed below.

  Available environment variables:
  ${getEnvVariableNames().toString()}

  Available dependencies:
  ${getDependencies().toString()}
  `,
  modelType,
);

const userPrompt = `
  Format and verify the resource type consistency for all scripts in the '{integration}' folder within the 'hub' directory.
  Here are the contents of the scripts:

  {scriptContents}

  Analyze these scripts and determine if they all have the same resource type definition at the start.
  If any scripts don't conform, rewrite them to match the majority format while preserving their functionality.
  Provide a summary of your findings and any changes made.
  For each rewritten script, start with a line '// Filename: [original filename]' followed by the rewritten content.
`;

export async function formatterFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("Formatter Agent called");

  const hubDir = path.join(process.cwd(), "hub");
  const integrationDir = path.join(hubDir, state.integration);

  let scriptContents = "";
  let scripts: { [filename: string]: string } = {};

  try {
    const files = await fs.readdir(integrationDir);
    for (const file of files) {
      if (path.extname(file) === ".ts") {
        const content = await fs.readFile(
          path.join(integrationDir, file),
          "utf8",
        );
        scriptContents += `File: ${file}\n\n${content}\n\n`;
        scripts[file] = content;
      }
    }
  } catch (error) {
    console.error(`Error reading scripts: ${error}`);
    return { ...state, formattingError: `Error reading scripts: ${error}` };
  }

  const input = userPrompt
    .replace("{integration}", state.integration)
    .replace("{scriptContents}", scriptContents);

  const result = await formatter.invoke({
    input: input,
  });

  // Extract rewritten scripts and summary from the result
  const rewrittenScripts: { [filename: string]: string } = {};
  const summary = result.content
    .replace(/```typescript[\s\S]*?```/g, "")
    .trim();

  const scriptMatches = result.content.match(/```typescript\n([\s\S]*?)\n```/g);
  if (scriptMatches) {
    for (const match of scriptMatches) {
      const scriptContent = match
        .replace(/```typescript\n/, "")
        .replace(/\n```/, "");
      const lines = scriptContent.split("\n");
      const filenameLine = lines[0];
      const filename = filenameLine.replace("// Filename: ", "").trim();
      rewrittenScripts[filename] = lines.slice(1).join("\n").trim();
    }
  }

  // Write rewritten scripts back to files
  const updatedFiles: string[] = [];
  for (const [filename, content] of Object.entries(scripts)) {
    const rewrittenContent = rewrittenScripts[filename];
    if (rewrittenContent && rewrittenContent !== content) {
      try {
        await fs.writeFile(
          path.join(integrationDir, filename),
          rewrittenContent,
          "utf8",
        );
        console.log(`Rewritten ${filename}`);
        updatedFiles.push(filename);
      } catch (error) {
        console.error(`Error writing rewritten script ${filename}: ${error}`);
      }
    }
  }

  return {
    ...state,
    sender: "Formatter",
    formattingSummary: summary,
    rewrittenScripts: updatedFiles,
  };
}
