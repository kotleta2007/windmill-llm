import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { Runnable } from "@langchain/core/runnables";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { codeGeneratorSystemPrompt, codeGeneratorUserPrompt, exampleWindmillScript } from "./prompts";
import { getIntegrationOutput } from "./octokit";

// Model type
const modelType = "gpt-4o";

// Dummy functions for external services
const ActivePieces = {
  getRelevantScripts: (integration: string) => {
    console.log("ACTIVE PIECES CALLED")
    return `Relevant script for ${integration}: console.log("Hello from ${integration}");`;
  }
};

const Tavily = {
  search: (query: string) => {
    console.log("TAVILY CALLED")
    return `Additional information for ${query}: Some relevant API endpoints and usage examples.`;
  }
};

const Windmill = {
  submitToHub: (code: string, tests: string) => {
    console.log("SUBMITTED TO WINDMILL");
    // console.log("Here is the code")
    // console.log(code)
    // console.log("Here are the tests")
    // console.log(tests)
    return "Successfully submitted to Windmill Hub";
  }
};

// Agent creation helper
async function createAgent(name: string, systemMessage: string, modelType: string): Promise<Runnable> {
  let llm: BaseChatModel;

  switch (modelType) {
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

// Create agents
const reviewer = await createAgent("Reviewer", "You are a code reviewer. Your job is to analyze code, tests, and test results. You do not write code. You decide if the code meets the requirements and is ready for submission, or if it needs more work.", modelType);
// const codeGenerator = await createAgent("CodeGenerator", "You are a code generator. You create code based on requirements.", "groq");
const codeGenerator = await createAgent("CodeGenerator", codeGeneratorSystemPrompt, modelType);
const testGenerator = await createAgent("TestGenerator", "You are a test generator. You create and run tests for given code.", modelType);

// Define state
interface AgentState {
  messages: BaseMessage[];
  sender: string;
  code?: string;
  tests?: string;
  testResults?: string;
  task: string;
  integration: string;
  additionalInfo?: string;
  submitted?: boolean;
  reviewed?: boolean;
}

// Create the graph
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: { value: (x, y) => (x ?? []).concat(y ?? []) },
    sender: { value: (x, y) => y ?? x ?? "user" },
    code: { value: (x, y) => y ?? x },
    tests: { value: (x, y) => y ?? x },
    testResults: { value: (x, y) => y ?? x },
    task: { value: (x, y) => y ?? x },
    integration: { value: (x, y) => y ?? x },
    additionalInfo: { value: (x, y) => y ?? x },
    submitted: { value: (x, y) => y ?? x ?? false },
    reviewed: { value: (x, y) => y ?? x ?? false },
  }
});

// Add nodes
workflow.addNode("Reviewer", async (state) => {
  console.log("Reviewer Agent called");
  
  let newState: Partial<AgentState> = { ...state, sender: "Reviewer", reviewed: true };

  if (state.code && state.tests && state.testResults) {
    const input = `Review the following for integration: ${state.integration}, task: ${state.task}\nCode: ${state.code}\nTests: ${state.tests}\nTest Results: ${state.testResults}\nDecide if this is ready to submit or needs more work. Respond with VALIDATED if it's ready to submit, or NEEDS_WORK if it needs improvements.`;

    const result = await reviewer.invoke({
      input: input,
    });

    if (result.content.includes("VALIDATED")) {
      const windmillResult = Windmill.submitToHub(state.code, state.tests);
      newState.submitted = true;
    } else if (result.content.includes("NEEDS_WORK")) {
      const tavilyResult = Tavily.search(`${state.integration} ${state.task}`);
      newState.additionalInfo = tavilyResult;
    }
  }
  
  return newState;
});

workflow.addNode("CodeGenerator", async (state) => {
  console.log("CodeGenerator Agent called");
  
  // const relevantScripts = ActivePieces.getRelevantScripts(state.integration);
  // const input = `Integration: ${state.integration}\nTask: ${state.task}\nRelevant scripts: ${relevantScripts}\nAdditional info: ${state.additionalInfo ?? ""}`;
  const input = 
    codeGeneratorUserPrompt
    .replace("{integration}", state.integration)
    .replace("{task}", state.task)
    .replace("{example}", exampleWindmillScript)
    .replace("{activePiecesPrompt}", await getIntegrationOutput(state.integration, state.task))

  const result = await codeGenerator.invoke({
    input: input,
  });
  // const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
  // const code = match?.[1];

  return { ...state, sender: "CodeGenerator", code: result.content };
});

workflow.addNode("TestGenerator", async (state) => {
  console.log("TestGenerator Agent called");
  
  const input = `Generate tests for the following code:\nIntegration: ${state.integration}\nTask: ${state.task}\nCode:\n${state.code}`;

  const result = await testGenerator.invoke({
    input: input,
  });

  return { 
    ...state,
    sender: "TestGenerator", 
    tests: result.content,
    testResults: "All tests passed successfully." // Simulated test results
  };
});

// Router function
function router(state: AgentState) {
  if (state.submitted) {
    console.log("WE ARE DONE");
    return "end";
  }
  
  if (!state.code) {
    return "CodeGenerator";
  }
  
  if (!state.tests || !state.testResults) {
    return "TestGenerator";
  }
  
  if (!state.reviewed) {
    return "Reviewer";
  }
  
  return "CodeGenerator";
}

// Define edges with the router
workflow.addConditionalEdges("Reviewer", router, {
  CodeGenerator: "CodeGenerator",
  TestGenerator: "TestGenerator",
  Reviewer: "Reviewer",
  end: END,
});

workflow.addConditionalEdges("CodeGenerator", router, {
  CodeGenerator: "CodeGenerator",
  TestGenerator: "TestGenerator",
  Reviewer: "Reviewer",
  end: END,
});

workflow.addConditionalEdges("TestGenerator", router, {
  CodeGenerator: "CodeGenerator",
  TestGenerator: "TestGenerator",
  Reviewer: "Reviewer",
  end: END,
});

workflow.addEdge(START, "CodeGenerator");

// Compile the graph
const graph = workflow.compile();

// Run the graph
async function runWorkflow(integration: string, task: string) {
  const result = await graph.invoke({
    integration: integration,
    task: task,
  });

  console.log("Final Result:");
  console.log(JSON.stringify(result, null, 2));
}

// Example usage
runWorkflow("clarifai", "ask-llm");
