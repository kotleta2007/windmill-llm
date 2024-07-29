import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getActivePiecesScripts } from "../octokit";
import * as fs from "fs/promises";
import * as path from "path";

export const codeGenerator = await createAgent(
  "CodeGenerator",
  `
  You are tasked with creating a TypeScript script that can be either an action or a trigger.
  For actions, create a single main function exported as "export async function main(...)".
  For triggers, create two functions:
    1. "export async function run(...)" which performs the trigger logic.
    2. "export async function getOptions(...)" which returns any dynamic options for the trigger.

  Take as parameters any information you need.
  Return the result of the action or trigger.
  Use fetch for HTTP requests and do not import any external libraries.
  Define a type which contains the authentication information and only that.
  The name of the type should be the capitalized name of the integration.
  If no authentication is needed, don't define a type.
  Return the type after the code encoded as a JSON schema.
  The parameters of the type should be camelCase.
  Handle errors appropriately.

  Here's how interactions should look:
  user: [sample_question]
  assistant: \`\`\`typescript
  [code]
  \`\`\`

  \`\`\`json
  [schema of resource type]
  \`\`\`

  Ensure the returned code adheres to this format.
  `,
  modelType,
);

export async function codeGenFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("CodeGenerator Agent called");

  // Check if schema.json exists
  const schemaPath = path.join("hub", state.integration, "schema.json");
  let existingSchema = "";
  try {
    existingSchema = await fs.readFile(schemaPath, "utf8");
    console.log("Existing schema found and loaded.");
  } catch (error) {
    console.log("No existing schema found. A new one will be created.");
  }

  let schemaPrompt = existingSchema
    ? `\n\nExisting schema for this integration:\n${existingSchema}\nPlease respect the resource type as specified in this JSON schema when generating the code.`
    : "";

  let input = `
    Generate a standalone script that ${state.taskType === "Trigger" ? "implements a trigger for" : "performs the action of"} {task} in {integration}.

    Integration name: {integration}.

    The script type is: ${state.taskType}

    Your code should look like this:
    {example}.
    You can find the necessary endpoints/logic in here:
    {activePiecesPrompt}.
    ${schemaPrompt}
    `
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

  const matchJSON = result.content.match(/```json\n([\s\S]*?)\n```/);
  const json = matchJSON?.[1] || "";

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

const exampleWindmillScript = `
  import { getState, setState } from "windmill-client";

  type Bitbucket = {
    username: string;
    password: string;
  };

  export async function main(
    bitbucket: Bitbucket,
    workspace: string,
    repo: string,
    branch: string
  ) {
    const lastChecked: number = (await getState()) || 0;

    const response = await fetch(
      "https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/commits?pagelen=100&include={branch}",
    {
      headers: {
        Authorization:
        "Basic " +
          Buffer.from(bitbucket.username + ":" + bitbucket.password).toString(
            "base64"
          ),
        },
      }
    );
const data = await response.json();
if (!response.ok) {
  throw new Error(data.error.message);
}
const newCommits = [];
for (const commit of data?.values || []) {
  if (new Date(commit.date).getTime() > lastChecked) {
    newCommits.push(commit);
  } else {
    break;
  }
}

if (newCommits.length > 0) {
  await setState(new Date(newCommits[0].date).getTime());
}

return newCommits;
  }
`;
