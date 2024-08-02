import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getActivePiecesScripts } from "../octokit";
import * as fs from "fs/promises";
import * as path from "path";
import { actionExample, triggerExample } from "../tools/examples";

export const codeGenerator = await createAgent("CodeGenerator", modelType);

export async function codeGenFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("CodeGenerator Agent called");

  // Check if resource_type.json exists
  const schemaPath = path.join("hub", state.integration, "resource_type.json");
  let existingSchema = "";
  try {
    existingSchema = await fs.readFile(schemaPath, "utf8");
    console.log("Existing schema found and loaded.");
  } catch (error) {
    console.log("No existing schema found. A new one will be created.");
  }

  // Set system prompt and user prompt based on taskType
  let systemPrompt = "";
  let userPrompt = "";
  let exampleScript = "";

  if (["Create", "Read", "Update", "Delete"].includes(state.taskType!)) {
    systemPrompt = `
    You are tasked with creating a TypeScript script for an action.
    Create a single main function exported as "export async function main(...)".
    Take as parameters any information you need.
    Return the result of the action.
    Use fetch for HTTP requests and do not import any external libraries.
    Define a type which contains the authentication information and only that.
    The name of the type should be the capitalized name of the integration.
    If no authentication is needed, don't define a type.
    Return the type after the code encoded as a JSON schema.
    The parameters of the type should be camelCase.
    Handle errors appropriately.

    Here's how interactions have to look like:
    user: [sample_question]
    assistant: \`\`\`typescript
    [code]
    \`\`\`

    \`\`\`json
    [schema of resource type]
    \`\`\`

    Check that the returned code adheres to this format.
    `;
    exampleScript = actionExample;
  } else if (state.taskType === "Trigger") {
    systemPrompt = `
    You are tasked with creating a TypeScript script for a trigger.
    Create two functions:
      1. "export async function run(...)" which performs the trigger logic.
      2. "export async function getOptions(...)" which returns any dynamic options for the trigger.
    Take as parameters any information you need.
    Return the result of the trigger.
    Use fetch for HTTP requests and do not import any external libraries.
    Define a type which contains the authentication information and only that.
    The name of the type should be the capitalized name of the integration.
    If no authentication is needed, don't define a type.
    Return the type after the code encoded as a JSON schema.
    The parameters of the type should be camelCase.
    Handle errors appropriately.

    Here's how interactions have to look like:
    user: [sample_question]
    assistant: \`\`\`typescript
    [code]
    \`\`\`

    \`\`\`json
    [schema of resource type]
    \`\`\`

    Check that the returned code adheres to this format.
    `;
    exampleScript = triggerExample;
  }

  let schemaPrompt = existingSchema
    ? `\n\nExisting schema for this integration:\n${existingSchema}\nPlease respect the resource type as specified in this JSON schema when generating the code.`
    : "";

  userPrompt = `
    Generate a standalone script that ${state.taskType === "Trigger" ? "implements a trigger for" : "performs the action of"} ${state.task} in ${state.integration}.

    Integration name: ${state.integration}.

    The script type is: ${state.taskType}

    Your code should look like this:
    ${exampleScript}
    You can find the necessary endpoints/logic in here:
    ${await getActivePiecesScripts(state.integration, state.task)}
    ${schemaPrompt}
  `;

  if (state.additionalInfo) {
    userPrompt += `\n\nAdditional info obtained from Tavily: ${state.additionalInfo}`;
  }

  const result = await codeGenerator.invoke({
    system: systemPrompt,
    input: userPrompt,
  });

  const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
  const code = match?.[1] || "";

  const matchJSON = result.content.match(/```json\n([\s\S]*?)\n```/);
  const json = matchJSON?.[1] || "";

  console.log("Our results: ", result.content);
  console.log("JSON schema: ", json);

  // Write the code to a local file
  try {
    const filePath = path.join(process.cwd(), "generated-code.ts");
    await fs.writeFile(filePath, code, "utf8");
    console.log(`Generated code has been written to ${filePath}`);
  } catch (error) {
    console.error("Error writing generated code to file:", error);
  }

  return { ...state, sender: "CodeGenerator", code: code, schema: json };
}
