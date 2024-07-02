import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { integrationScriptsTool } from "./octokit-activepieces-tool";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-2024-05-13",
  maxTokens: 1024,
  temperature: 0
});

const systemPromptTemplate = SystemMessagePromptTemplate.fromTemplate(`
You have to create a single script which performs just the asked action in typescript in one main function which you export like this: "export async function main(...)". Take as parameter any information you need.
Return the action result.
You should use fetch and are not allowed to import any libraries.
Define a type which contains the authentication information and only that.
Handle errors.

Here's how interactions have to look like:
user: {sample_question}
assistant: \`\`\`typescript
...
\`\`\`
`);

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

const userPromptTemplate = HumanMessagePromptTemplate.fromTemplate(`
Generate a standalone script that does {task} in {integration}.
Your code should look like this: 
{example}
You can find the necessary endpoints/logic in here: 
{activePiecesPrompt}
`);

const chatPrompt = ChatPromptTemplate.fromMessages([
  systemPromptTemplate,
  userPromptTemplate
]);

async function main() {
  try {
    // Direct call to the integrationScriptsTool
    const activePiecesPrompt = await integrationScriptsTool.func("clarifai,ask-llm");

    const formattedPrompt = await chatPrompt.formatMessages({
      sample_question: "Generate a script that uses Clarifai and asks an LLM something",
      task: "Ask LLM a question",
      integration: "clarifai",
      example: exampleWindmillScript,
      activePiecesPrompt: activePiecesPrompt,
    });

    const response = await llm.invoke(formattedPrompt);
    
    console.log("Got result");
    console.log(response.content);

    const match = response.content.match(/```typescript\n([\s\S]*?)\n```/);
    const code = match?.[1];
    console.log("Extracted code:");
    console.log(code);

    // Note: LangChain's ChatOpenAI doesn't provide token usage information directly
    // If you need this, you might need to use the OpenAI API directly or implement a custom callback

  } catch (err) {
    console.error(err);
  }
}

main();
