import type { AgentState } from "./agent";
import { createAgent, modelType } from "./agent";
import {
  codeGeneratorUserPrompt,
  codeGeneratorSystemPrompt,
  exampleWindmillScript,
} from "../prompts";
import { getActivePiecesScripts } from "../octokit";
import * as fs from "fs/promises";
import * as path from "path";

export const codeGenerator = await createAgent(
  "CodeGenerator",
  codeGeneratorSystemPrompt,
  modelType,
);

export async function codeGenFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("CodeGenerator Agent called");

  let input = codeGeneratorUserPrompt
    .replace("{integration}", state.integration)
    .replace("{task}", state.task)
    .replace("{example}", exampleWindmillScript)
    .replace(
      "{activePiecesPrompt}",
      await getActivePiecesScripts(state.integration, state.task),
    );

  if (state.additionalInfo) {
    input += `\n\nAdditional info obtained from Tavily: ${state.additionalInfo}`;
  }

  const result = await codeGenerator.invoke({
    input: input,
  });
  const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
  const code = match?.[1] || "";

  // Write the code to a local file
  try {
    const filePath = path.join(process.cwd(), "generated-code.ts");
    await fs.writeFile(filePath, code, "utf8");
    console.log(`Generated code has been written to ${filePath}`);
  } catch (error) {
    console.error("Error writing generated code to file:", error);
  }

  return { ...state, sender: "CodeGenerator", code: code };
}
