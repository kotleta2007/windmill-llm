// 1. LangChain with OpenAI

// bun add → install and update dependencies
// bun install → install without updating dependencies

// The difference between OpenAI and ChatOpenAI
// They use different API endpoints and the endpoint of OpenAI has received its final update in July 2023.

import { ChatOpenAI } from "@langchain/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { DynamicTool } from "@langchain/core/tools";

const llm = new ChatOpenAI({
  model: "gpt-4o-2024-05-13",
  temperature: 0
});

// Create a simple addition tool
const additionTool = new DynamicTool({
  name: "addition",
  description: "Adds two numbers together",
  func: async (input: string) => {
    const [a, b] = input.split(',').map(num => parseFloat(num.trim()));
    if (isNaN(a) || isNaN(b)) {
      return "Please provide two valid numbers.";
    }
    return (a + b).toString();
  },
});

async function setupAgent() {
  const executor = await initializeAgentExecutorWithOptions(
    [additionTool],
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
    "What's 123 plus 456?",
    "Can you add 78 and 22 for me?",
    "What's the capital of France?",
    "If I have 5 apples and get 3 more, how many do I have?",
  ];

  for (const query of queries) {
    console.log(`Query: ${query}`);
    const result = await agent.invoke({ input: query });
    console.log(`Response: ${result.output}`);
    console.log('---');
  }
}

main().catch(console.error);
