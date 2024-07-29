import { BaseMessage } from "@langchain/core/messages";
import { initChatModel } from "langchain/chat_models/universal";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Runnable } from "@langchain/core/runnables";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

// Model type
// export const modelType = "gpt-4o";
export const modelType = "claude-3-5-sonnet-20240620";

// Function to initialize LLM based on model name
export async function initializeLLM(modelName: string): Promise<BaseChatModel> {
  const modelProvider = getModelProvider(modelName);
  return await initChatModel(modelName, {
    modelProvider,
    temperature: 0,
  });
}

// Helper function to determine the model provider
function getModelProvider(modelName: string): string {
  if (modelName.startsWith("gpt")) return "openai";
  if (modelName.startsWith("claude")) return "anthropic";
  if (modelName.startsWith("gemini")) return "google-vertexai";
  if (
    modelName.startsWith("llama") ||
    modelName.startsWith("mixtral") ||
    modelName.startsWith("gemma")
  )
    return "groq";
  throw new Error(`Unknown model provider for model: ${modelName}`);
}

// Agent creation helper
export async function createAgent(
  name: string,
  modelType: string,
  systemPrompt?: string,
): Promise<Runnable> {
  const llm = await initializeLLM(modelType);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt ? systemPrompt : "{system}"],
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
      type: "Create" | "Read" | "Update" | "Delete" | "Trigger";
    }>;
    currentIndex: number;
  };
  complete?: boolean;
  taskType?: "Create" | "Read" | "Update" | "Delete" | "Trigger";
}
