import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, END } from "@langchain/langgraph";
import { Runnable } from "@langchain/core/runnables";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

// Dummy functions for external services
const ActivePieces = {
  getRelevantScripts: (integration: string) => {
    return `Relevant script for ${integration}: console.log("Hello from ${integration}");`;
  }
};

const Tavily = {
  search: (query: string) => {
    return `Additional information for ${query}: Some relevant API endpoints and usage examples.`;
  }
};

const Windmill = {
  submitToHub: (code: string, tests: string) => {
    console.log("Submitting to Windmill Hub:");
    console.log("Code:", code);
    console.log("Tests:", tests);
    return "Successfully submitted to Windmill Hub";
  }
};

// Agent creation helper
async function createAgent(name: string, systemMessage: string): Promise<Runnable> {
  const llm = new ChatOpenAI({ modelName: "gpt-4o" });
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemMessage],
    ["human", "{input}"],
  ]);
  return prompt.pipe(llm);
}

// Create agents
const reviewer = await createAgent("Reviewer", "You are a code reviewer. Your job is to analyze code, tests, and test results. You do not write code. You decide if the code meets the requirements and is ready for submission, or if it needs more work.");
const codeGenerator = await createAgent("CodeGenerator", "You are a code generator. You create code based on requirements.");
const testGenerator = await createAgent("TestGenerator", "You are a test generator. You create and run tests for given code.");

// Define state
interface AgentState {
  messages: BaseMessage[];
  sender: string;
  code?: string;
  tests?: string;
  testResults?: string;
  task?: string;
  integration?: string;
  additionalInfo?: string;
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
  }
});

// Add nodes
workflow.addNode("Reviewer", async (state) => {
  console.log("\n--- Reviewer Agent Start ---");
  
  let input: string;
  let newState: Partial<AgentState> = { sender: "Reviewer" };

  if (state.code && state.tests && state.testResults) {
    input = `Review the following for task: ${state.task}\nCode: ${state.code}\nTests: ${state.tests}\nTest Results: ${state.testResults}\nDecide if this is ready to submit or needs more work. Respond with VALIDATED if it's ready to submit, or NEEDS_WORK if it needs improvements.`;

    console.log("Reviewer Input:", input);

    const result = await reviewer.invoke({
      input: input,
    });

    console.log("Reviewer Output:", result.content);

    if (result.content.includes("VALIDATED")) {
      const windmillResult = Windmill.submitToHub(state.code, state.tests);
      console.log("Windmill Submission Result:", windmillResult);
      newState.submitted = true;  // Add this line to indicate submission
      return;
    } else if (result.content.includes("NEEDS_WORK")) {
      const tavilyResult = Tavily.search(state.task ?? "");
      console.log("Tavily Search Result:", tavilyResult);
      newState.additionalInfo = tavilyResult;
    }
  } else {
    // Initial task from user, just pass it on to CodeGenerator
    newState.task = state.task;
    newState.integration = state.task.split(" ")[0];
    console.log("New Task:", newState.task);
    console.log("Integration:", newState.integration);
  }
  
  console.log("--- Reviewer Agent End ---\n");
  return newState;
});

workflow.addNode("CodeGenerator", async (state) => {
  console.log("\n--- CodeGenerator Agent Start ---");
  const relevantScripts = ActivePieces.getRelevantScripts(state.integration ?? "");
  console.log("Relevant Scripts:", relevantScripts);

  const input = `Task: ${state.task}\nRelevant scripts: ${relevantScripts}\nAdditional info: ${state.additionalInfo ?? ""}`;
  console.log("CodeGenerator Input:", input);

  const result = await codeGenerator.invoke({
    input: input,
  });

  console.log("Generated Code:", result.content);
  console.log("--- CodeGenerator Agent End ---\n");

  return { sender: "CodeGenerator", code: result.content };
});

workflow.addNode("TestGenerator", async (state) => {
  console.log("\n--- TestGenerator Agent Start ---");
  const input = `Generate tests for the following code:\n${state.code}`;
  console.log("TestGenerator Input:", input);

  const result = await testGenerator.invoke({
    input: input,
  });

  console.log("Generated Tests:", result.content);
  console.log("Test Results: All tests passed successfully."); // Simulated test results
  console.log("--- TestGenerator Agent End ---\n");

  return { 
    sender: "TestGenerator", 
    tests: result.content,
    testResults: "All tests passed successfully." // Simulated test results
  };
});

// Define edges
workflow.addEdge("Reviewer", "CodeGenerator");
workflow.addEdge("CodeGenerator", "TestGenerator");
workflow.addEdge("TestGenerator", "Reviewer");

workflow.addConditionalEdges(
  "Reviewer",
  (state) => {
    if (state.submitted) {
      return "end";
    } else if (state.code && state.tests && state.testResults) {
      return "Reviewer";
    } else {
      return "CodeGenerator";
    }
  },
  {
    end: END,
    Reviewer: "Reviewer",
    CodeGenerator: "CodeGenerator",
  }
);
workflow.setEntryPoint("Reviewer");

// Compile the graph
const graph = workflow.compile();

// Run the graph
async function runWorkflow(task: string) {
  const result = await graph.invoke({
    task: task,
    messages: [new HumanMessage(task)]
  });

  console.log("Final Result:");
  console.log(JSON.stringify(result, null, 2));
}

// Example usage
runWorkflow("Create a script to integrate with Twitter API for posting tweets");
