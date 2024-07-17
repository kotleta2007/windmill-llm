import { StateGraph, START, END } from "@langchain/langgraph";
import { staticTests } from "./staticTests";
import type { AgentState } from "./agents/Agent";
import { reviewerFunc } from "./agents/Reviewer";
import { codeGenFunc } from "./agents/CodeGenerator";
import { testGenFunc } from "./agents/TestGenerator";
import { main } from "bun";
import { getAllAvailableScripts } from "./octokit";

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

async function integrationAndTask() {
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

// integrationAndTask().catch((error) => {
//   console.error("Unhandled error:", error);
//   process.exit(1);
// });

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2); // Remove the first two elements (node and script name)

  // Check if we have the correct number of arguments
  if (args.length !== 1) {
    console.error("Usage: bun run index.ts <integration>");
    process.exit(1);
  }

  // Extract integration from arguments
  const [integration] = args;

  // Log the input
  console.log(`Processing scripts for integration: ${integration}`);

  try {
    // Get all available scripts for the integration
    const availableScripts = await getAllAvailableScripts(integration);

    // Process each script
    for (const script of availableScripts) {
      console.log(`Processing script: ${script}`);
      runWorkflow(integration, script);
    }

    console.log(`Finished processing all scripts for ${integration}`);
  } catch (error) {
    console.error("Error processing scripts:", error);
    process.exit(1);
  }
}

// Call the main function
main();

// Example usage:
// claude send-prompt

// bun run multi-agent/index.ts clarifai ask-llm
// bun run multi-agent/index.ts binance fetch-pair-price
// bun run multi-agent/index.ts deepl translate-text
// bun run multi-agent/index.ts hackernews top-stories-in-hackernews
// bun run multi-agent/index.ts straico prompt-completion
// bun run multi-agent/index.ts github create-comment-on-issue
// bun run multi-agent/index.ts github create-issue
// bun run multi-agent/index.ts github get-issue-information
// bun run multi-agent/index.ts github lock-issue
// bun run multi-agent/index.ts github unlock-issue
