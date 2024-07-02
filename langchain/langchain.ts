// 1. LangChain with OpenAI

// bun add → install and update dependencies
// bun install → install without updating dependencies

// The difference between OpenAI and ChatOpenAI
// They use different API endpoints and the endpoint of OpenAI has received its final update in July 2023.

import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({
  model: "gpt-4o-2024-05-13",
  temperature: 0
});

const response = await llm.invoke("Salut")
console.log(response.content);
