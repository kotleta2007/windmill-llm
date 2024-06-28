import { glob } from "glob";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/index.mjs";
import { getScripts } from "./scripts.ts"
import { getAllClarifaiOutput } from "./generate-from-activepieces.ts"

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
You have to create a single script which performs just the asked action in typescript in one main function which you export like this: "export async function main(...)". Take as parameter any information you need.
Return the action result.
You should use fetch and are not allowed to import any libraries.
Define a type which contains the authentication information and only that.
Handle errors.

Here's how interactions have to look like:
user: {sample_question}
assistant: \`\`\`typescript
{code}
\`\`\``;

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

// console.log(exampleWindmillScript);

const userPrompt = `
Generate a standalone script that does {task} in {integration}.
Your code should look like this: 
{example}.
You can find the necessary endpoints/logic in here: 
{activePiecesPrompt}.
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
        .replace("{example}", exampleWindmillScript)
        .replace("{activePiecesPrompt}", await getAllClarifaiOutput())
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
    // It would be nice if we had a JSON that contained:
    // The script that was generated (the response of the model)
    //
    // The type of model that was used
    // The number of Prompt + Completion tokens
    //
    // We use these last two parameters to estimate the cost of generation
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

