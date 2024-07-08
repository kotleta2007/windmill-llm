export const exampleWindmillScript = `
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

export const codeGeneratorSystemPrompt = `
You have to create a single script which performs just the asked action in typescript in one main function which you export like this: "export async function main(...)". Take as parameter any information you need.
Return the action result.
You should use fetch and are not allowed to import any libraries.
Define a type which contains the authentication information and only that.
Handle errors.

Here's how interactions have to look like:
user: [sample_question]
assistant: \`\`\`typescript
[code]
\`\`\`
Check that the returned code adheres to this format. 
`;

export const codeGeneratorUserPrompt = `
Generate a standalone script that does {task} in {integration}.
Your code should look like this: 
{example}.
You can find the necessary endpoints/logic in here: 
{activePiecesPrompt}.
`;

export const testGeneratorSystemPrompt = `
You have to create a single script which tests the script you are given as input. Create a sequence of tests that verify that:
  1. The code contains valid TypeScript.    
  2. All endpoints listed in the code are valid.
  3. The code accomplishes the task that is specified.

You have access to the following environment variables, containing credentials for external services:
{envVariables}
You also have the following dependencies installed:
{dependencies}

No other libraries / testing frameworks are available from the ones listed above (you are free to call the TypeScript standard library / Bun facilities).

Complete the rest of the parameters of the code to your liking.
The parameters should closely resemble the parameters a potential Windmill user might use.

The generated code can be found in 'generated-code.ts' in the current working directory.
Don't set any placeholder name for the script to run.

Leave no placeholder variables. The script will be called immediately with environment variables or the parameters you specified.
Make sure you are using the Bun runtime.

If you are unable to return a standalone script that can be run in this environment,
or if your script contains placeholder variables that have to be replaced with real values,
the end of your output should be:
readyToTest: false
If the script can be run with the given environment variables and the given dependencies, the end of your output should be:
readyToTest: true

Here's how interactions have to look like:
user: [sample_question]
assistant: \`\`\`typescript
[code]
\`\`\`
readyToTest: [true/false]
`;

export const oldTestGeneratorSystemPrompt = `
You have to create a single script which tests the script you are given as input. Create a sequence of tests that verify that:
  1. The code contains valid TypeScript.
  2. All endpoints listed in the code are valid.
  3. The code accomplishes the task that is specified.

The first lines of your generated testing code should contain constant definitions
which list placeholder variables (one by line) that must be replaced for the execution of the testing script.
In particular, list the files that you are using (like the script of the code) and the authentication tokens.
Make sure that only replacing those variables with actual values will be sufficient for the scripts to run.
No placeholder variables should appear in the rest of the code or the imports.

Here's how interactions have to look like:
user: [sample_question]
assistant: \`\`\`typescript
[code]
\`\`\``;

export const testGeneratorUserPrompt = `
Generate a test for a script that does {task} in {integration}.
Here is the code we will be testing:
{generatedCode}
`;