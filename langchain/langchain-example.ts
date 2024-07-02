import { ChatOpenAI } from "@langchain/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { integrationScriptsTool } from "./octokit-activepieces-tool";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";

const llm = new ChatOpenAI({
  model: "gpt-4o-2024-05-13",
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

async function setupAgent() {
  const executor = await initializeAgentExecutorWithOptions(
    [integrationScriptsTool],
    llm,
    {
      agentType: "openai-functions",
      verbose: false,
    }
  );
  
  return executor;
}

const chain = RunnableSequence.from([
  async () => {
    const agent = await setupAgent();
    const activePiecesPrompt = await agent.invoke({ 
      input: "Retrieve the scripts for the clarifai integration, specifically the ask-llm task." 
    });

    console.log("IN RUNNABLE SEQUENCE rn")
    console.log(activePiecesPrompt.output)
    console.log("DONE")

    const fullPrompt = await chatPrompt.formatMessages({
      sample_question: "Generate a script that uses Clarifai and asks an LLM something",
      task: "ask-llm",
      integration: "clarifai",
      example: exampleWindmillScript,
      activePiecesPrompt: activePiecesPrompt.output,
    });

    return { fullPrompt, agent };
  },
  async ({ fullPrompt, agent }) => {
    const result = await agent.invoke({ 
      input: fullPrompt 
    });
    return result.output;
  },
  new StringOutputParser(),
]);

async function main() {
  const result = await chain.invoke({});

  console.log("Got result:");
  console.log(result);

  const codeMatch = result.match(/```typescript\n([\s\S]*?)\n```/);
  const code = codeMatch ? codeMatch[1] : "No code found";

  console.log("Extracted code:");
  console.log(code);
}

main().catch(console.error);
