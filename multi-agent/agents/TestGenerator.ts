import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getEnvVariableNames, getDependencies } from "../read-local";
import { getActivePiecesScripts } from "../octokit";
import * as fs from "fs/promises";
import * as path from "path";
import { spawnSync } from "child_process";

const testGenerator = await createAgent(
  "TestGenerator",
  `
  You are a test generator for TypeScript code running on the Bun runtime.
  Your task is to create a single, self-sufficient script that tests the given input code.

  Key requirements:
  1. The test must verify that the code accomplishes the specified task.
  2. Use only the available environment variables and dependencies listed below.
  3. Ensure all parameters are valid and the code is runnable.
  4. The test should not contain any placeholder variables or mock values that have to be replaced manually.
  5. If resources are needed, use the API to create them within the test.
  6. The test must be runnable without human intervention.

  Available environment variables:
  ${getEnvVariableNames().toString()}

  Available dependencies:
  ${getDependencies().toString()}

  The code to be tested is in 'generated-code.ts' in the current working directory.
  `,
  modelType,
);

const userPrompt = `
  Generate a test for a script that does {task} in {integration}.

  The script type is: {scriptType}.

  Here is the code we will be testing:
  {generatedCode}

  You can find the necessary endpoints/logic in here:
  {activePiecesPrompt}

  Don't use any external libraries that you don't really need.
  The libraries you have are already listed in the system prompt for you.
  Make sure the code is runnable.
  Don't use placeholder variables: no one will replace them.
  If you need to find some value, make sure the code retrieves it using the API.
  Make sure that all the key requirements are met.
  `;

export async function testGenFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("TestGenerator Agent called");

  const maxAttempts = 5; // Maximum number of attempts to generate self-sufficient tests
  let attempt = 0;
  let tests = "";
  let isSelfSufficient = false;
  let executionSuccessful = false;
  let feedback = "";
  let executionResult: any;

  while (attempt < maxAttempts && (!isSelfSufficient || !executionSuccessful)) {
    attempt++;
    console.log(`Test generation attempt ${attempt}`);

    let input = userPrompt
      .replace("{task}", state.task)
      .replace("{scriptType}", state.taskType!.toString())
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
      input += `
      Previous attempt was not self-sufficient or failed to execute.
      Please address the following feedback and ensure the test code is completely self-sufficient,
      without any placeholders or mock values that require human intervention:\n${feedback}`;
    }

    const result = await testGenerator.invoke({
      input: input,
    });

    const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
    tests = match?.[1] || "";

    // Check if it's self-sufficient
    const checkResult = await testGenerator.invoke({
      input:
        userPrompt
          .replace("{task}", state.task)
          .replace("{integration}", state.integration)
          .replace("{generatedCode}", state.code!)
          .replace(
            "{activePiecesPrompt}",
            await getActivePiecesScripts(state.integration, state.task),
          ) +
        `
        Is the following test code self-sufficient?
        Is it free from variables that have to be replaced by a human so that the tests can be run?
        Does it have all the resources it needs (it acquired them, created them or found the necessary credentials in these env variables)?
        You only have these variables at your disposal:
        ${getEnvVariableNames().toString()}

        Does it remove the resources it created?
        If you said YES to all these questions, say FINAL and provide the final code in a typescript code block.
        If not, say NEEDS WORK and explain in detail what has to be changed so that the code becomes self-sufficient.

        Test:
        ${tests}

        - END OF TEST -

        If it's self-sufficient, say FINAL and provide the final code in a typescript code block.
        If it can be run using these env variables, say FINAL and provide the final code in a typescript code block:
        ${getEnvVariableNames().toString()}
        Else, say NEEDS WORK.
        Your response must end with either FINAL or NEEDS WORK.
    `,
    });

    console.log(checkResult.content);

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
      try {
        executionResult = spawnSync("bun", ["run", "generated-tests.ts"], {
          encoding: "utf8",
          stdio: "pipe",
          env: process.env, // Pass through the current environment variables
        });

        console.log("Test execution output:", executionResult.stdout);
        console.error("Test execution errors:", executionResult.stderr);

        // Check if anything was printed to STDERR
        if (executionResult.stderr && executionResult.stderr.trim() !== "") {
          throw new Error("Execution produced output to STDERR");
        }

        // If we reach here, execution was successful
        executionSuccessful = true;
      } catch (error) {
        console.error(`Error executing tests: ${error}`);
        feedback = `Test execution failed. Error: ${error}\nStdout: ${executionResult?.stdout}\nStderr: ${executionResult?.stderr}`;
        isSelfSufficient = false;
        executionSuccessful = false;
      }
    } else {
      feedback = checkResult.content.replace("NEEDS WORK", "").trim();
      continue;
    }
  }

  return {
    ...state,
    sender: "TestGenerator",
    tests: tests,
    testResults:
      isSelfSufficient && executionSuccessful
        ? "Self-sufficient tests generated and executed successfully without STDERR output."
        : "Could not generate self-sufficient and executable tests without STDERR output after maximum attempts.",
    isSelfSufficient: isSelfSufficient && executionSuccessful,
    testGenerationFeedback: feedback,
    stdout: executionSuccessful ? executionResult?.stdout : undefined,
    stderr: executionSuccessful ? executionResult?.stderr : undefined,
  };
}
