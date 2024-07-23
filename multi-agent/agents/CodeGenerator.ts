import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getActivePiecesScripts } from "../octokit";
import * as fs from "fs/promises";
import * as path from "path";

export const codeGenerator = await createAgent(
  "CodeGenerator",
  `
  You have to create a single script which performs just the asked action in typescript in one main function which you export like this: "export async function main(...)". Take as parameter any information you need.
  Return the action result.
  You should use fetch and are not allowed to import any libraries.
  Define a type which contains the authentication information and only that.
  The name of the type should be the capitalized name of the integration.
  If you don't need any authentication, don't define a type!
  Return the type after the code encoded as a JSON schema.
  Handle errors.

  Here's how interactions have to look like:
  user: [sample_question]
  assistant: \`\`\`typescript
  [code]
  \`\`\`

  \`\`\`json
  [schema of resource type]
  \`\`\`

  Check that the returned code adheres to this format.
  `,
  modelType,
);

export async function codeGenFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("CodeGenerator Agent called");

  let input = `
    Generate a standalone script that does {task} in {integration}.

    Integration name: {integration}.

    The script type is: ${state.taskType}

    Your code should look like this:
    {example}.
    You can find the necessary endpoints/logic in here:
    {activePiecesPrompt}.
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
import { Octokit } from "https://cdn.skypack.dev/@octokit/rest";

/**
 * @param owner The account owner of the repository. The name is not case sensitive.
 *
 * @param repo The name of the repository. The name is not case sensitive.
 */
type Github = {
  token: string;
};
export async function main(gh_auth: Github, owner: string, repo: string) {
  const octokit = new Octokit({ auth: gh_auth.token });

  return await octokit.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
    },
  });
}
`;
