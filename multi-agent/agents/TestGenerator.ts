import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getEnvVariableNames, getDependencies } from "../read-local";
import { getActivePiecesScripts } from "../octokit";
import * as fs from "fs/promises";
import * as path from "path";
import { spawnSync } from "child_process";
import { ChatOpenAI } from "@langchain/openai";

const testGenerator = await createAgent("TestGenerator", modelType);

export async function testGenFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("TestGenerator Agent called");

  let systemPrompt = `
    You are a test generator for TypeScript code running on the Bun runtime.
    Do not use "bun test", the tests have to be runnable with "bun run".
    Your task is to create a single, self-sufficient script that tests the given input code.

    Key requirements:
    1. The test must verify that the code accomplishes the specified task.
    2. Use only the available environment variables and dependencies listed below.
    3. Ensure all parameters are valid and the code is runnable.
    4. The test should not contain any placeholder variables or mock values that have to be replaced manually.
    5. If resources are needed, use the API to create them within the test.
    6. The test must be runnable without human intervention.
    7. The test must not produce any output on STDERR when run successfully.

    For action scripts (Create, Read, Update, Delete):
    - The script has a single main function exported as "export async function main(...)".
    - Create a test that calls this main function with appropriate parameters.
    - Verify that the result of the action is correct.

    For trigger scripts:
    - The script has a single main function exported as "export async function main(...)".
    - Create a test that calls this main function with appropriate parameters.
    - Verify that the result of the trigger is correct.

    For trigger scripts, make sure the test:
        - runs the trigger by calling the main trigger function (to set the initial state, don't set the initial state manually)
        - creates the external action that triggers the trigger, so that the trigger's state changes.
        - checks the state after the trigger (by calling the main function of the trigger script, not manually)
        - the trigger states should be different

    Use fetch for HTTP requests and do not import any external libraries.
    Handle errors appropriately.

    Available environment variables:
    ${getEnvVariableNames().toString()}

    Available dependencies:
    ${getDependencies().toString()}

    The code to be tested is in 'generated-code.ts' in the current working directory.
    You can assume this file exists and contains the code to be tested.
    Do not check for its existence.

    Here's how interactions have to look like:
    user: [sample_question]
    assistant: \`\`\`typescript
    [test code]
    \`\`\`

    Check that the returned code adheres to this format.
    `;
  let userPrompt = "";

  if (["Create", "Read", "Update", "Delete"].includes(state.taskType!)) {
    userPrompt = `
    Generate a test for a script that performs the action of ${state.task} in ${state.integration}.

    Integration name: ${state.integration}.
    The script type is: ${state.taskType}

    Here is the code we will be testing:
    ${state.code}

    You can find the necessary endpoints/logic in here:
    ${await getActivePiecesScripts(state.integration, state.task)}

    Don't use any external libraries that you don't really need.
    The libraries you have are already listed in the system prompt for you.
    Make sure the code is runnable.
    Don't use placeholder variables: no one will replace them.
    If you need to find some value, make sure the code retrieves it using the API.
    Make sure that all the key requirements are met.

    Make sure that the correct execution of the tests yields nothing on STDERR.
    None of the tests should be negative. Every test should model a successful execution.
    If there is an error, the test should write the error message to STDERR.
    `;
  } else if (state.taskType === "Trigger") {
    userPrompt = `
    Generate a test for a script that implements a trigger for ${state.task} in ${state.integration}.

    Integration name: ${state.integration}.
    The script type is: ${state.taskType}

    Here is the code we will be testing:
    ${state.code}

    You can find the necessary endpoints/logic in here:
    ${await getActivePiecesScripts(state.integration, state.task)}

    Don't use any external libraries that you don't really need.
    The libraries you have are already listed in the system prompt for you.
    Make sure the code is runnable.
    Don't use placeholder variables: no one will replace them.
    If you need to find some value, make sure the code retrieves it using the API.
    Make sure that all the key requirements are met.

    Make sure that the correct execution of the tests yields nothing on STDERR.
    None of the tests should be negative. Every test should model a successful execution.
    If there is an error, the test should write the error message to STDERR.

    Remember to test the main function of the trigger script and use getState() and setState() if needed.

    Make sure the test:
    - starts the trigger
    - creates the external action that triggers the trigger
    - checks the state after the trigger
    - the trigger states should be different
    `;
  }

  if (state.additionalInfo) {
    userPrompt += `\n\nAdditional info obtained from Tavily: ${state.additionalInfo}`;
  }

  const maxAttempts = 5;
  let attempt = 0;
  let tests = "";
  let isSelfSufficient = false;
  let executionSuccessful = false;
  let feedback = "";
  let executionResult: any;

  while (attempt < maxAttempts && (!isSelfSufficient || !executionSuccessful)) {
    attempt++;
    console.log(`Test generation attempt ${attempt}`);

    if (attempt > 1) {
      userPrompt += `
      Previous attempt was not self-sufficient or failed to execute.
      Please address the following feedback and ensure the test code is completely self-sufficient,
      without any placeholders or mock values that require human intervention:\n${feedback}`;
    }

    const result = await testGenerator.invoke({
      system: systemPrompt,
      input: userPrompt,
    });

    const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
    tests = match?.[1] || "";

    // Check if it's self-sufficient
    const checkResult = await testGenerator.invoke({
      system: systemPrompt,
      input: `
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
      const finalCodeMatch = checkResult.content.match(
        /```typescript\n([\s\S]*?)\n```/,
      );
      if (finalCodeMatch) {
        tests = finalCodeMatch[1];
      } else {
        console.error("No final code block found in checkResult");
        isSelfSufficient = false;
        continue;
      }

      try {
        const filePath = path.join(process.cwd(), "generated-tests.ts");
        await fs.writeFile(filePath, tests, "utf8");
        console.log(`Generated tests have been written to ${filePath}`);
      } catch (error) {
        console.error("Error writing generated tests to file:", error);
        isSelfSufficient = false;
        continue;
      }

      try {
        executionResult = spawnSync("bun", ["run", "generated-tests.ts"], {
          encoding: "utf8",
          stdio: "pipe",
          env: process.env,
        });

        console.log("Test execution output:", executionResult.stdout);
        console.error("Test execution errors:", executionResult.stderr);

        if (executionResult.stderr && executionResult.stderr.trim() !== "") {
          throw new Error("Execution produced output to STDERR");
        }

        executionSuccessful = true;
      } catch (error) {
        console.error(`Error executing tests: ${error}`);

        await logError(executionResult.stderr, state.integration, state.task);

        const errorAnalysis = await analyzeError(executionResult.stderr);

        if (errorAnalysis.isHttpError) {
          switch (errorAnalysis.httpErrorCode) {
            case 401:
            case 403:
              console.error(
                `Error: Bad Credentials or Forbidden Access - Halting generation process for ${state.integration}`,
              );
              return {
                ...state,
                sender: "TestGenerator",
                testResults: `Generation halted due to authentication error.`,
                isSelfSufficient: false,
                testGenerationFeedback: `Error: ${errorAnalysis.fullErrorMessage}. Please check your credentials for ${state.integration}.`,
              };

            case 429:
              console.log(
                "Rate limit reached. Waiting for 60 seconds before retrying...",
              );
              await new Promise((resolve) => setTimeout(resolve, 60000));
              continue;

            case 404:
              console.log(
                "Endpoint not found. Searching for alternative endpoints...",
              );
              feedback =
                "Endpoint not found. Attempting to find alternative endpoints.";
              isSelfSufficient = false;
              continue;

            case 500:
            case 502:
            case 503:
            case 504:
              console.error(
                `Server-side error encountered: ${errorAnalysis.fullErrorMessage}`,
              );
              return {
                ...state,
                sender: "TestGenerator",
                testResults: "Generation failed due to server-side error.",
                isSelfSufficient: false,
                testGenerationFeedback: `Server Error: ${errorAnalysis.fullErrorMessage}. Please try again later.`,
              };

            default:
              feedback = `Test execution failed. Error: ${errorAnalysis.fullErrorMessage}`;
              isSelfSufficient = false;
              executionSuccessful = false;
          }
        } else {
          feedback = `Test execution failed. Error: ${errorAnalysis.fullErrorMessage}`;
          isSelfSufficient = false;
          executionSuccessful = false;
        }
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

/// ----

async function logError(stderr: string, integration: string, task: string) {
  // Initialize the Anthropic model
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
  });

  const result = await model.invoke(
    `
    Analyze the following error message:
    ${stderr}

    Provide the following information:
    1. Is it an HTTP error? (true/false)
    2. If it's an HTTP error, what is the error code?
    3. The full text of the error message.

    Format your response as a JSON object with keys: isHttpError, httpErrorCode, fullErrorMessage
    Do not include any other text or formatting outside of the JSON object.
  `,
  );

  let jsonString = result.content;

  // Remove any potential code block formatting
  jsonString = jsonString.replace(/```json\n?|\n?```/g, "");

  // Trim whitespace
  jsonString = jsonString.trim();

  // Attempt to parse the JSON
  let errorAnalysis;
  try {
    errorAnalysis = JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse JSON:", error);
    console.error("Raw response:", result.content);
    // Fallback to a default object if parsing fails
    errorAnalysis = {
      isHttpError: false,
      httpErrorCode: "N/A",
      fullErrorMessage: "Failed to parse error analysis",
    };
  }

  const logEntry = `
DateTime: ${new Date().toISOString()}
Integration: ${integration}
Task: ${task}
Is HTTP Error: ${errorAnalysis.isHttpError}
HTTP Error Code: ${errorAnalysis.httpErrorCode || "N/A"}
Full Error Message: ${errorAnalysis.fullErrorMessage}
Raw STDERR: ${stderr}
---
`;

  await fs.appendFile("errors.log", logEntry);
}

async function analyzeError(stderr: string): Promise<any> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
  });

  const result = await model.invoke(
    `
    Analyze the following error message:
    ${stderr}

    Provide the following information:
    1. Is it an HTTP error? (true/false)
    2. If it's an HTTP error, what is the error code?
    3. The full text of the error message.

    Format your response as a JSON object with keys: isHttpError, httpErrorCode, fullErrorMessage
    Do not include any other text or formatting outside of the JSON object.
  `,
  );

  let jsonString = result.content;
  jsonString = jsonString.replace(/```json\n?|\n?```/g, "").trim();

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse JSON:", error);
    console.error("Raw response:", result.content);
    return {
      isHttpError: false,
      httpErrorCode: null,
      fullErrorMessage: "Failed to parse error analysis",
    };
  }
}
