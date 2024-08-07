import { StateGraph, START, END } from "@langchain/langgraph";
import { staticTests } from "./staticTests";
import type { AgentState } from "./agents/Agent";
import { reviewerFunc } from "./agents/Reviewer";
import { codeGenFunc } from "./agents/CodeGenerator";
import { testGenFunc } from "./agents/TestGenerator";
import { initializeSupervisor } from "./agents/Supervisor";
import type { Script } from "./agents/Supervisor";
import { getAllAvailableScripts } from "./octokit";
import { existsSync } from "fs";
import { join } from "path";

// Recursion Limit
const NUM_CYCLES = 3;

// Create the graph
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: { value: (x, y) => (x ?? []).concat(y ?? []) },
    sender: { value: (x, y) => y ?? x ?? "user" },
    code: { value: (x, y) => y ?? x },
    schema: { value: (x, y) => y ?? x },
    tests: { value: (x, y) => y ?? x },
    staticTestResults: { value: (x, y) => y ?? x },
    genTestResults: { value: (x, y) => y ?? x },
    testResults: { value: (x, y) => y ?? x },
    task: { value: (x, y) => y ?? x },
    integration: { value: (x, y) => y ?? x },
    additionalInfo: { value: (x, y) => y ?? x },
    submitted: { value: (x, y) => y ?? x ?? false },
    reviewed: { value: (x, y) => y ?? x ?? false },
    taskType: { value: (x, y) => y ?? x },
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
      // If no sender is set (initial state) or unknown sender, start with Supervisor
      return "CodeGenerator";
  }
}

// Define edges with the router
workflow.addConditionalEdges("Reviewer", router, {
  // Supervisor: "Supervisor",
  CodeGenerator: "CodeGenerator",
  TestGenerator: "TestGenerator",
  Reviewer: "Reviewer",
  end: END,
});

workflow.addConditionalEdges("CodeGenerator", router, {
  // Supervisor: "Supervisor",
  CodeGenerator: "CodeGenerator",
  TestGenerator: "TestGenerator",
  Reviewer: "Reviewer",
  end: END,
});

workflow.addConditionalEdges("TestGenerator", router, {
  // Supervisor: "Supervisor",
  CodeGenerator: "CodeGenerator",
  TestGenerator: "TestGenerator",
  Reviewer: "Reviewer",
  end: END,
});

// NOT SURE IF WE NEED THIS
// workflow.addConditionalEdges(
//   "Supervisor",
//   (state) => (state.complete ? "end" : "CodeGenerator"),
//   {
//     end: END,
//     CodeGenerator: "CodeGenerator",
//   },
// );

workflow.addEdge(START, "CodeGenerator");

// DO WE NEED THIS????
// // Update the edges
// workflow.addEdge("Supervisor", "CodeGenerator");
// workflow.addEdge("Reviewer", "Supervisor");

// Compile the graph
const graph = workflow.compile();

// Run the graph
async function runWorkflow(integration: string, script: Script) {
  const result = await graph.invoke(
    {
      integration: integration,
      task: script.name,
      taskType: script.type,
    },
    // {
    //   recursionLimit: 10 * NUM_CYCLES + 1,
    // },
  );
}
// async function runWorkflow(integration: string) {
//   const result = await graph.invoke(
//     {
//       integration: integration,
//     },
//     {
//       recursionLimit: 3 * NUM_CYCLES + 1,
//     },
//   );

//   // console.log("Final Result:");
//   // console.log(JSON.stringify(result, null, 2));
// }
// async function runWorkflow(integration: string, task: string) {
//   const result = await graph.invoke(
//     {
//       integration: integration,
//       task: task,
//     },
//     {
//       recursionLimit: 3 * NUM_CYCLES + 1,
//     },
//   );

// console.log("Final Result:");
// console.log(JSON.stringify(result, null, 2));
// }

// async function integrationAndTask() {
//   // Get command line arguments
//   const args = process.argv.slice(2); // Remove the first two elements (node and script name)

//   // Check if we have the correct number of arguments
//   if (args.length !== 2) {
//     console.error("Usage: bun run index.ts <integration> <task>");
//     process.exit(1);
//   }

//   // Extract integration and task from arguments
//   const [integration, task] = args;

//   // Log the input
//   console.log(
//     `Running workflow for integration: ${integration}, task: ${task}`,
//   );

//   try {
//     // Run the workflow
//     runWorkflow(integration, task);
//   } catch (error) {
//     console.error("Error running workflow:", error);
//     process.exit(1);
//   }
// }

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

  // List of script names to skip
  const skippedScripts = [
    "create-invite-link",
    "get-chat-member",
    "send-media.action",
    "send-text-message.action",
    // "play",
    // "pause",
    // "set-volume",
    // "update-playlist",
    // "index",
  ]; // Add your skipped script names here

  try {
    const classifiedScripts = await initializeSupervisor(integration);

    console.log(classifiedScripts);
    let userResponse = prompt();
    // Process each script
    for (const script of classifiedScripts) {
      console.log(`Checking script: ${script.name}`);

      // Check if the script is in the skipped list
      if (skippedScripts.includes(script.name)) {
        console.log(`Skipping script: ${script.name}`);
        continue;
      }

      // Check if the script already exists in the local Windmill hub
      const scriptPath = join(
        "hub",
        integration,
        "scripts",
        "action",
        script.name,
      );
      if (existsSync(scriptPath)) {
        console.log(`Skipping existing script: ${script.name}`);
        continue;
      }

      // If we've made it here, process the script
      console.log(`Processing script: ${script.name}`);
      await runWorkflow(integration, script);
    }

    console.log(`Finished processing all scripts for ${integration}`);
  } catch (error) {
    console.error("Error processing scripts:", error);
    process.exit(1);
  }
}

// async function main() {
//   // Get command line arguments
//   const args = process.argv.slice(2); // Remove the first two elements (node and script name)

//   // Check if we have the correct number of arguments
//   if (args.length !== 1) {
//     console.error("Usage: bun run index.ts <integration>");
//     process.exit(1);
//   }

//   // Extract integration from arguments
//   const [integration] = args;

//   // Log the input
//   console.log(`Processing scripts for integration: ${integration}`);

//   try {
//     const classifiedScripts = await initializeSupervisor(integration);
//     // Process each script
//     for (const script of classifiedScripts) {
//       console.log(`Processing script: ${script.name}`);
//       await runWorkflow(integration, script);
//     }

//     console.log(`Finished processing all scripts for ${integration}`);
//   } catch (error) {
//     console.error("Error processing scripts:", error);
//     process.exit(1);
//   }
// }

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
