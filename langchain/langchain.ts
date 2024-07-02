// 1. LangChain with OpenAI

// bun add → install and update dependencies
// bun install → install without updating dependencies

// The difference between OpenAI and ChatOpenAI
// They use different API endpoints and the endpoint of OpenAI has received its final update in July 2023.

import { ChatOpenAI } from "@langchain/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { integrationScriptsTool } from "./octokit-activepieces-tool"

const llm = new ChatOpenAI({
  model: "gpt-4o-2024-05-13",
  maxTokens: 1024,
  temperature: 0
});

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

async function main() {
  const agent = await setupAgent();
  
  const queries = [
    "Generate a script that uses Clarifai and asks an LLM something",
  ];

  for (const query of queries) {
    console.log(`Query: ${query}`);
    const result = await agent.invoke({ input: query });
    console.log(`Response: ${result.output}`);
    console.log('---');
  }
}

main().catch(console.error);
