import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { Runnable } from "@langchain/core/runnables";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
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
import { TavilySearchAPIRetriever } from "@langchain/community/retrievers/tavily_search_api";
import { searchAndGetLinks } from "../tavily-request";
import { crawlAndExtractApiEndpoints } from "../api-web-crawler";

// Model type
const modelType = "gpt-4o";

// Recursion Limit
const NUM_CYCLES = 3;

// Dummy functions for external services
const Tavily = {
  search: async function (query: string) {
    console.log(`Tavily search called with query: ${query}`);
    try {
      const links = await searchAndGetLinks(query);
      console.log("Crawling links for API endpoints...");
      const endpointMap = await crawlAndExtractApiEndpoints(links);

      let result = `Search results for query: ${query}\n\n`;

      for (const [link, endpoints] of endpointMap) {
        result += `Endpoints found in ${link}:\n`;
        endpoints.forEach((endpoint) => {
          result += `  ${endpoint.method} ${endpoint.path}\n`;
        });
        result += "\n";
      }

      return result;
    } catch (error) {
      console.error("Error in Tavily search:", error);
      return `Error occurred during search: ${error.message}`;
    }
  },
};

// const Tavily = {
//   search: async function(query: string) {
//     return null;
//   }
// };
// const Tavily = {
//   retriever: new TavilySearchAPIRetriever({ k: 3 }),
//
//   search: async function(query: string) {
//     console.log("TAVILY CALLED");
//     try {
//       const retrievedDocs = await this.retriever.invoke(query);
//       console.log({ retrievedDocs });
//
//       // Process the retrieved documents to extract relevant information
//       const relevantInfo = retrievedDocs.map(doc => doc.pageContent).join("\n");
//
//       return `Additional information for ${query}: ${relevantInfo}`;
//     } catch (error) {
//       console.error("Error calling Tavily:", error);
//       return `Error retrieving additional information for ${query}: ${error.message}`;
//     }
//   }
// };
//

const Windmill = {
  submitToHub: (code: string, tests: string) => {
    console.log("SUBMITTED TO WINDMILL");
    // console.log("Here is the code")
    // console.log(code)
    // console.log("Here are the tests")
    // console.log(tests)
    return "Successfully submitted to Windmill Hub";
  },
};

// Agent creation helper
async function createAgent(
  name: string,
  systemMessage: string,
  modelType: string,
): Promise<Runnable> {
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
const reviewer = await createAgent(
  "Reviewer",
  "You are a code reviewer. Your job is to analyze code, tests, and test results. You do not write code. You decide if the code meets the requirements and is ready for submission, or if it needs more work.",
  modelType,
);
// const codeGenerator = await createAgent("CodeGenerator", "You are a code generator. You create code based on requirements.", "groq");
const codeGenerator = await createAgent(
  "CodeGenerator",
  codeGeneratorSystemPrompt,
  modelType,
);
const testGenerator = await createAgent(
  "TestGenerator",
  testGeneratorSystemPrompt
    .replace("{envVariables}", getEnvVariableNames().toString())
    .replace("{dependencies}", getDependencies().toString()),
  modelType,
);

// Define state
interface AgentState {
  messages: BaseMessage[];
  sender: string;
  code?: string;
  tests?: string;
  testResults?: string;
  staticTestResults?: string;
  genTestResults?: string;
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
workflow.addNode("Reviewer", async (state) => {
  console.log("Reviewer Agent called");

  let newState: Partial<AgentState> = {
    ...state,
    sender: "Reviewer",
    reviewed: true,
  };

  if (state.code && state.tests && state.testResults) {
    const input = `
      Review the following for integration: ${state.integration}, task: ${state.task}\n
      Code: ${state.code}\n
      Tests: ${state.tests}\n
      Test Results: ${state.testResults}\n
      Static Test Results: ${state.staticTestResults}\n
      Generated Test Results: ${state.genTestResults}\n
      Decide if this is ready to submit or needs more work.
      Respond with VALIDATED if it's ready to submit, or NEEDS_WORK if it needs improvements.`;

    const result = await reviewer.invoke({
      input: input,
    });

    // console.log(result.content);

    if (result.content.includes("VALIDATED")) {
      const windmillResult = Windmill.submitToHub(state.code, state.tests);
      newState.submitted = true;
    } else if (result.content.includes("NEEDS_WORK")) {
      const tavilyResult = await Tavily.search(
        `${state.integration} ${state.task} API endpoints`,
      );

      console.log("HERE IS WHAT I HAVE FOUND");
      console.log(tavilyResult);
      newState.additionalInfo = tavilyResult;

      // Reset the state values
      newState.code = undefined;
      newState.tests = undefined;
      newState.staticTestResults = undefined;
      newState.genTestResults = undefined;
      newState.testResults = undefined;
      newState.submitted = false;
      newState.reviewed = true;
    }
  }

  return newState;
});

workflow.addNode("CodeGenerator", async (state) => {
  console.log("CodeGenerator Agent called");

  let input = codeGeneratorUserPrompt
    .replace("{integration}", state.integration)
    .replace("{task}", state.task)
    .replace("{example}", exampleWindmillScript)
    .replace(
      "{activePiecesPrompt}",
      await getActivePiecesScripts(state.integration, state.task),
    );

  if (state.additionalInfo) {
    input += `\n\nAdditional info obtained from Tavily: ${state.additionalInfo}`;
  }

  const result = await codeGenerator.invoke({
    input: input,
  });
  const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
  const code = match?.[1] || "";

  // Write the code to a local file
  try {
    const filePath = path.join(process.cwd(), "generated-code.ts");
    await fs.writeFile(filePath, code, "utf8");
    console.log(`Generated code has been written to ${filePath}`);
  } catch (error) {
    console.error("Error writing generated code to file:", error);
  }

  return { ...state, sender: "CodeGenerator", code: code };
});

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
         If it's self-sufficient, say FINAL and provide the final code in a typescript code block.
         If it's not, say NEEDS WORK and explain in detail what has to be changed so that the code becomes self-sufficient.

      Test:
      ${tests}

      - END OF TEST -

      If it's self-sufficient, say FINAL and provide the final code in a typescript code block.
      If it can be run using these env variables, say FINAL and provide the final code in a typescript code block:
      ${getEnvVariableNames()}
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
    } else {
      feedback = checkResult.content.replace("NEEDS WORK", "").trim();
      console.log(`Test code not self-sufficient. Feedback: ${feedback}`);
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

      console.log("Test execution output:", executionResult.stdout);
      console.error("Test execution errors:", executionResult.stderr);

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

// function router(state: AgentState) {
//   if (state.submitted) {
//     console.log("WE ARE DONE");
//     return "end";
//   }
//
//   if (!state.code) {
//     return "CodeGenerator";
//   }
//
//   if (!state.tests || !state.testResults || !state.staticTestResults || !state.genTestResults) {
//     return "TestGenerator";
//   }
//
//   if (!state.reviewed) {
//     return "Reviewer";
//   }
//
//   return "CodeGenerator";
// }

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

  console.log("Final Result:");
  console.log(JSON.stringify(result, null, 2));
}

// Example usage
// runWorkflow("claude", "send-prompt");
runWorkflow("github", "create-comment-on-an-issue");
//
// runWorkflow("clarifai", "ask-llm");
// runWorkflow("binance", "fetch-pair-price");
// runWorkflow("deepl", "translate-text");
// runWorkflow("hackernews", "top-stories-in-hackernews");
// runWorkflow("straico", "prompt-completion");
