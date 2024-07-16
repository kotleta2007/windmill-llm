import { StateGraph, START, END } from "@langchain/langgraph";
import { staticTests } from "./staticTests";
import type { AgentState } from "./agents/agent";
import { reviewerFunc } from "./agents/reviewer";
import { codeGenFunc } from "./agents/CodeGenerator";
import { testGenFunc } from "./agents/TestGenerator";

// Recursion Limit
const NUM_CYCLES = 3;

// Create the graph
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: { value: (x, y) => (x ?? []).concat(y ?? []) },
    sender: { value: (x, y) => y ?? x ?? "user" },
    code: { value: (x, y) => y ?? x },
    tests: { value: (x, y) => y ?? x },
    staticTestResults: { value: (x, y) => y ?? x },
    genTestResults: { value: (x, y) => y ?? x },
    testResults: { value: (x, y) => y ?? x },
    task: { value: (x, y) => y ?? x },
    integration: { value: (x, y) => y ?? x },
    additionalInfo: { value: (x, y) => y ?? x },
    submitted: { value: (x, y) => y ?? x ?? false },
    reviewed: { value: (x, y) => y ?? x ?? false },
  },
});

// Add nodes
workflow.addNode("Reviewer", reviewerFunc);
workflow.addNode("CodeGenerator", codeGenFunc);
workflow.addNode("TestGenerator", testGenFunc);

// Router function
function router(state: AgentState) {
  if (state.submitted) {
    console.log("WE ARE DONE");
    return "end";
  }

  switch (state.sender) {
    case "CodeGenerator":
      return "TestGenerator";
    case "TestGenerator":
      return "Reviewer";
    case "Reviewer":
      return "CodeGenerator";
    default:
      // If no sender is set (initial state) or unknown sender, start with CodeGenerator
      return "CodeGenerator";
  }
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
  const result = await graph.invoke(
    {
      integration: integration,
      task: task,
    },
    {
      recursionLimit: 3 * NUM_CYCLES + 1,
    },
  );

  // console.log("Final Result:");
  // console.log(JSON.stringify(result, null, 2));
}

// Example usage
// runWorkflow("claude", "send-prompt");
// runWorkflow("github", "create-comment-on-an-issue");
//
// runWorkflow("clarifai", "ask-llm");
// runWorkflow("binance", "fetch-pair-price");
// runWorkflow("deepl", "translate-text");
// runWorkflow("hackernews", "top-stories-in-hackernews");
// runWorkflow("straico", "prompt-completion");

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2); // Remove the first two elements (node and script name)

  // Check if we have the correct number of arguments
  if (args.length !== 2) {
    console.error("Usage: bun run index.ts <integration> <task>");
    process.exit(1);
  }

  // Extract integration and task from arguments
  const [integration, task] = args;

  // Log the input
  console.log(
    `Running workflow for integration: ${integration}, task: ${task}`,
  );

  try {
    // Run the workflow
    runWorkflow(integration, task);
  } catch (error) {
    console.error("Error running workflow:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
