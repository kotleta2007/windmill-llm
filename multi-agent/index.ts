import { StateGraph, START, END } from "@langchain/langgraph";
import {
  codeGeneratorSystemPrompt,
  codeGeneratorUserPrompt,
  exampleWindmillScript,
  testGeneratorSystemPrompt,
  testGeneratorUserPrompt,
} from "./prompts";
import { getActivePiecesScripts } from "./octokit";
import { getEnvVariableNames, getDependencies } from "./read-local";
import * as fs from "fs/promises";
import * as path from "path";
import { spawnSync } from "child_process";
import { staticTests } from "./staticTests";
import { createAgent, modelType } from "./agents/agent";
import type { AgentState } from "./agents/agent";
import { reviewerFunc } from "./agents/reviewer";
import { codeGenFunc } from "./agents/CodeGenerator";

// Recursion Limit
const NUM_CYCLES = 3;

// Create agents
const testGenerator = await createAgent(
  "TestGenerator",
  testGeneratorSystemPrompt
    .replace("{envVariables}", getEnvVariableNames().toString())
    .replace("{dependencies}", getDependencies().toString()),
  modelType,
);

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

workflow.addNode("TestGenerator", async (state) => {
  console.log("TestGenerator Agent called");

  const maxAttempts = 5; // Maximum number of attempts to generate self-sufficient tests
  let attempt = 0;
  let tests = "";
  let isSelfSufficient = false;
  let feedback = "";

  while (attempt < maxAttempts && !isSelfSufficient) {
    attempt++;
    console.log(`Test generation attempt ${attempt}`);

    let input = testGeneratorUserPrompt
      .replace("{task}", state.task)
      .replace("{integration}", state.integration)
      .replace("{generatedCode}", state.code!)
      .replace(
        "{activePiecesPrompt}",
        await getActivePiecesScripts(state.integration, state.task),
      );

    if (state.additionalInfo) {
      input += `\n\nAdditional info obtained from Tavily: ${state.additionalInfo}`;
    }

    if (attempt > 1) {
      input += `\n\nPrevious attempt was not self-sufficient or failed to execute. Please address the following feedback and ensure the test code is completely self-sufficient, without any placeholders or mock values that require human intervention:\n${feedback}`;
    }

    const result = await testGenerator.invoke({
      input: input,
    });

    const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
    tests = match?.[1] || "";

    // Check if it's self-sufficient
    const checkResult = await testGenerator.invoke({
      input:
        testGeneratorUserPrompt
          .replace("{task}", state.task)
          .replace("{integration}", state.integration)
          .replace("{generatedCode}", state.code!)
          .replace(
            "{activePiecesPrompt}",
            await getActivePiecesScripts(state.integration, state.task),
          ) +
        `Is the following test code self-sufficient?
         Is it free from variables that have to be replaced by a human so that the tests can be run?
         Does it have all the resources it needs (it acquired them, created them or found the necessary credentials in these env variables)?
         ${getDependencies()}
         Does it remove the resources it created?
         If you said YES to all these questions, say FINAL and provide the final code in a typescript code block.
         If not, say NEEDS WORK and explain in detail what has to be changed so that the code becomes self-sufficient.

      Test:
      ${tests}

      - END OF TEST -

      If it's self-sufficient, say FINAL and provide the final code in a typescript code block.
      If it can be run using these env variables, say FINAL and provide the final code in a typescript code block:
      ${getEnvVariableNames()}
    `,
    });

    // console.log(checkResult.content);

    isSelfSufficient = checkResult.content.includes("FINAL");

    if (isSelfSufficient) {
      // Extract the final code from checkResult
      const finalCodeMatch = checkResult.content.match(
        /```typescript\n([\s\S]*?)\n```/,
      );
      if (finalCodeMatch) {
        tests = finalCodeMatch[1]; // Update tests with the final code
      } else {
        console.error("No final code block found in checkResult");
        isSelfSufficient = false;
        continue;
      }
    } else {
      feedback = checkResult.content.replace("NEEDS WORK", "").trim();
      // console.log(`Test code not self-sufficient. Feedback: ${feedback}`);
      continue;
    }

    // Write the tests to a local file
    try {
      const filePath = path.join(process.cwd(), "generated-tests.ts");
      await fs.writeFile(filePath, tests, "utf8");
      console.log(`Generated tests have been written to ${filePath}`);
    } catch (error) {
      console.error("Error writing generated tests to file:", error);
      isSelfSufficient = false;
      continue;
    }

    // Try to execute the tests
    let executionResult;
    try {
      executionResult = spawnSync("bun", ["run", "generated-tests.ts"], {
        encoding: "utf8",
        stdio: "pipe",
        env: process.env, // Pass through the current environment variables
      });

      // console.log("Test execution output:", executionResult.stdout);
      // console.error("Test execution errors:", executionResult.stderr);

      if (executionResult.status !== 0) {
        throw new Error(
          `Execution failed with status ${executionResult.status}`,
        );
      }
    } catch (error) {
      console.error(`Error executing tests: ${error}`);
      feedback = `Test execution failed. Error: ${error}\nStdout: ${executionResult?.stdout}\nStderr: ${executionResult?.stderr}`;
      isSelfSufficient = false;
    }
  }

  return {
    ...state,
    sender: "TestGenerator",
    tests: tests,
    testResults: isSelfSufficient
      ? "Self-sufficient tests generated and executed successfully."
      : "Could not generate self-sufficient and executable tests after maximum attempts.",
    isSelfSufficient: isSelfSufficient,
    testGenerationFeedback: feedback,
  };
});

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
