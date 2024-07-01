import { glob } from "glob";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/index.mjs";
// import { getScripts } from "./scripts.ts"
// import { getAllClarifaiOutput } from "./generate-from-activepieces.ts"

// Loading the example code
const path = "./example-from-llm.ts";
const file = Bun.file(path);
const exampleCode = await file.text();
console.log(exampleCode)

type Stats = {
  modelType: string,
  totalTokens: number,
  promptTokens: number,
  completionTokens: number
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `
You have to create a single script which tests the script you are given as input. Create a sequence of tests that verify that:
  1. The code contains valid TypeScript.
  2. All endpoints listed in the code are valid.
  3. The code accomplishes the task that is specified.

Here's how interactions have to look like:
user: {sample_question}
assistant: \`\`\`typescript
{code}
\`\`\``;

// const exampleWindmillScript = `
// import { Octokit } from "https://cdn.skypack.dev/@octokit/rest";
//
// /**
//  * @param owner The account owner of the repository. The name is not case sensitive.
//  *
//  * @param repo The name of the repository. The name is not case sensitive.
//  */
// type Github = {
//   token: string;
// };
// export async function main(gh_auth: Github, owner: string, repo: string) {
//   const octokit = new Octokit({ auth: gh_auth.token });
//
//   return await octokit.request("GET /repos/{owner}/{repo}", {
//     owner,
//     repo,
//     headers: {
//       "X-GitHub-Api-Version": "2022-11-28",
//       Accept: "application/vnd.github+json",
//     },
//   });
// }
// `;

// console.log(exampleWindmillScript);

const userPrompt = `
Generate a test for a script that does {task} in {integration}.
Here is the code we will be testing:
{generatedCode}.
`;


const messages: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: systemPrompt,
  },
  {
    role: "user",
    content:
      userPrompt
        .replace("{task}", "Ask LLM a question")
        .replace("{integration}", "clarifai")
        .replace("{generatedCode}", exampleCode)
  },
];

try {
  const response = await openai.chat.completions.create({
    messages,
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
  });
  const content: string = response.choices[0].message.content;
  const match = content.match(/```typescript\n([\s\S]*?)\n```/);
  const code = match?.[1];
  
  console.log("Got result");
  console.log(content);
  console.log(code);

  const tokenUsage = response.usage

  if (tokenUsage !== undefined) {
    console.log("Model Type", response.model)
    console.log("Total tokens", tokenUsage.total_tokens)
    console.log("Prompt tokens", tokenUsage.prompt_tokens)
    console.log("Completion tokens", tokenUsage.completion_tokens)
  } else {
    console.log("No info about token usage.")
  }
} catch (err) {
  console.error(err);
}

