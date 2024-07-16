import type { AgentState } from "./agent";
import { createAgent, modelType } from "./agent";
import { testGeneratorUserPrompt, testGeneratorSystemPrompt } from "../prompts";
import { getEnvVariableNames, getDependencies } from "../read-local";
import { getActivePiecesScripts } from "../octokit";
import * as fs from "fs/promises";
import * as path from "path";
import { spawnSync } from "child_process";

const testGenerator = await createAgent(
  "TestGenerator",
  testGeneratorSystemPrompt
    .replace("{envVariables}", getEnvVariableNames().toString())
    .replace("{dependencies}", getDependencies().toString()),
  modelType,
);

export async function testGenFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
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
}
