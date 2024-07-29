import { BaseMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Runnable } from "@langchain/core/runnables";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

// Model type
export const modelType = "gpt-4o";
// export const modelType = "claude-3-5-sonnet-20240620";
// export const modelType = "llama-3.1-405b-reasoning";
// export const modelType = "llama-3.1-70b-versatile";

// Agent creation helper
export async function createAgent(
  name: string,
  systemMessage: string,
  modelType: string,
): Promise<Runnable> {
  let llm: BaseChatModel;

  switch (modelType) {
    case "claude-3-5-sonnet-20240620":
      llm = new ChatAnthropic({
        modelName: modelType,
        temperature: 0,
      });
      break;
    case "gpt-3.5-turbo":
    case "gpt-3.5-turbo-16k":
    case "gpt-4":
    case "gpt-4-turbo":
    case "gpt-4-turbo-2024-04-09":
    case "gpt-4o":
    case "gpt-4o-2024-05-13":
      llm = new ChatOpenAI({
        modelName: modelType,
        temperature: 0,
      });
      break;
    case "llama3-8b-8192":
    case "llama3-70b-8192":
    case "llama-3.1-405b-reasoning":
    case "llama-3.1-70b-versatile":
    case "mixtral-8x7b-32768":
    case "gemma-7b-it":
    case "gemma2-9b-it":
      llm = new ChatGroq({
        modelName: modelType,
        temperature: 0,
      });
      break;
    default:
      llm = new ChatGroq({
        modelName: "llama3-70b-8192",
        temperature: 0,
      });
      break;
  }

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemMessage],
    ["human", "{input}"],
  ]);

  return prompt.pipe(llm);
}

// Define state
export interface AgentState {
  messages: BaseMessage[];
  sender: string;
  code?: string;
  tests?: string;
  schema?: string;
  testResults?: string;
  staticTestResults?: string;
  genTestResults?: string;
  task: string;
  integration: string;
  additionalInfo?: string;
  submitted?: boolean;
  reviewed?: boolean;
  // New parameters for Supervisor
  supervisorState?: {
    scripts: Array<{
      name: string;
      type: "Create" | "Read" | "Update" | "Delete";
    }>;
    currentIndex: number;
  };
  complete?: boolean;
  taskType?: "Create" | "Read" | "Update" | "Delete";
}
