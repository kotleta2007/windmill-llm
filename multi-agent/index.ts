import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { Runnable } from "@langchain/core/runnables";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { codeGeneratorSystemPrompt, codeGeneratorUserPrompt, exampleWindmillScript, testGeneratorSystemPrompt, testGeneratorUserPrompt } from "./prompts";
import { getActivePiecesScripts} from "./octokit";
import { getEnvVariableNames, getDependencies } from "./read-local";
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { staticTests } from './staticTests';
import { TavilySearchAPIRetriever } from "@langchain/community/retrievers/tavily_search_api";

// Model type
const modelType = "gpt-4o";

// Dummy functions for external services
const Tavily = {
  retriever: new TavilySearchAPIRetriever({ k: 3 }),

  search: async function(query: string) {
    console.log("TAVILY CALLED");
    try {
      const retrievedDocs = await this.retriever.invoke(query);
      console.log({ retrievedDocs });
      
      // Process the retrieved documents to extract relevant information
      const relevantInfo = retrievedDocs.map(doc => doc.pageContent).join("\n");
      
      return `Additional information for ${query}: ${relevantInfo}`;
    } catch (error) {
      console.error("Error calling Tavily:", error);
      return `Error retrieving additional information for ${query}: ${error.message}`;
    }
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
const testGenerator = await createAgent("TestGenerator", 
                                        testGeneratorSystemPrompt
                                          .replace("{envVariables}", getEnvVariableNames())
                                          .replace("{dependencies}", getDependencies()),
                                        modelType);

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
  }
});

// Add nodes
workflow.addNode("Reviewer", async (state) => {
  console.log("Reviewer Agent called");
  
  let newState: Partial<AgentState> = { ...state, sender: "Reviewer", reviewed: true };

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
      const tavilyResult = Tavily.search(`${state.integration} ${state.task}`);
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
  
  // // Iterate over the properties of the state object
  // console.log("State Before:");
  // for (const [key, value] of Object.entries(state)) {
  //   // For simple values, print directly
  //   if (typeof value !== 'object' || value === null) {
  //     console.log(`${key}: ${value}`);
  //   } else if (Array.isArray(value)) {
  //     // For arrays, print the length and the first few elements
  //     console.log(`${key}: Array of length ${value.length}`);
  //     console.log(`First few elements: ${JSON.stringify(value.slice(0, 3))}`);
  //   } else {
  //     // For objects, print a stringified version (limited to 100 characters)
  //     const stringValue = JSON.stringify(value).slice(0, 100);
  //     console.log(`${key}: ${stringValue}${stringValue.length >= 100 ? '...' : ''}`);
  //   }
  // }
  
  const input = 
    codeGeneratorUserPrompt
    .replace("{integration}", state.integration)
    .replace("{task}", state.task)
    .replace("{example}", exampleWindmillScript)
    .replace("{activePiecesPrompt}", await getActivePiecesScripts(state.integration, state.task))

  const result = await codeGenerator.invoke({
    input: input,
  });
  const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
  const code = match?.[1] || '';

  // Write the code to a local file
  try {
    const filePath = path.join(process.cwd(), 'generated-code.ts');
    await fs.writeFile(filePath, code, 'utf8');
    console.log(`Generated code has been written to ${filePath}`);
  } catch (error) {
    console.error('Error writing generated code to file:', error);
  }

  // // Iterate over the properties of the state object
  // console.log("State After:");
  // for (const [key, value] of Object.entries(state)) {
  //   // For simple values, print directly
  //   if (typeof value !== 'object' || value === null) {
  //     console.log(`${key}: ${value}`);
  //   } else if (Array.isArray(value)) {
  //     // For arrays, print the length and the first few elements
  //     console.log(`${key}: Array of length ${value.length}`);
  //     console.log(`First few elements: ${JSON.stringify(value.slice(0, 3))}`);
  //   } else {
  //     // For objects, print a stringified version (limited to 100 characters)
  //     const stringValue = JSON.stringify(value).slice(0, 100);
  //     console.log(`${key}: ${stringValue}${stringValue.length >= 100 ? '...' : ''}`);
  //   }
  // }
 

  return { ...state, sender: "CodeGenerator", code: code };
});

workflow.addNode("TestGenerator", async (state) => {
  console.log("TestGenerator Agent called");
  
  const input = 
    testGeneratorUserPrompt
    .replace("{task}", state.task)
    .replace("{integration}", state.integration)
    .replace("{generatedCode}", state.code!)
    .replace("{activePiecesPrompt}", await getActivePiecesScripts(state.integration, state.task))

  const result = await testGenerator.invoke({
    input: input,
  });

  const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
  const tests = match?.[1] || '';

  // console.log(input)
  // console.log(result.content)

  // Write the tests to a local file
  try {
    const filePath = path.join(process.cwd(), 'generated-tests.ts');
    await fs.writeFile(filePath, tests, 'utf8');
    console.log(`Generated tests have been written to ${filePath}`);
  } catch (error) {
    console.error('Error writing generated tests to file:', error);
  }

  await new Promise(f => setTimeout(f, 1000));

  // Execute static tests
  let staticTestResults: string;
  try {
    staticTestResults = await staticTests('generated-code.ts');
  } catch (error) {
    staticTestResults = `Error running static tests: ${error}`;
  }

  // Execute generated tests
  let genTestResults: string;
  try {
    const result = spawnSync('bun', ['run', 'generated-tests.ts'], {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    genTestResults = `stdout: ${result.stdout}\nstderr: ${result.stderr}`;

    if (result.status !== 0) {
      genTestResults += `\nProcess exited with status ${result.status}`;
    }
  } catch (error) {
    genTestResults = `Error running generated tests: ${error}\nstdout: \nstderr: ${error.message || ''}`;
  }

  // console.log("Static test results")
  // console.log(staticTestResults)
  // console.log("Generated test results")
  // console.log(genTestResults)

  return { 
    ...state,
    sender: "TestGenerator", 
    tests: tests,
    staticTestResults: staticTestResults,
    genTestResults: genTestResults,
    testResults: "All tests executed. Check staticTestResults and genTestResults for details."
  };
});
// workflow.addNode("TestGenerator", async (state) => {
//   console.log("TestGenerator Agent called");
//   
//   const input = 
//     testGeneratorUserPrompt
//     .replace("{task}", state.task)
//     .replace("{integration}", state.integration)
//     .replace("{generatedCode}", state.code!)
//
//   const result = await testGenerator.invoke({
//     input: input,
//   });
//
//   const match = result.content.match(/```typescript\n([\s\S]*?)\n```/);
//   const tests = match?.[1] || '';
//
//   console.log(input)
//   console.log(result.content)
//
//   // Write the tests to a local file
//   try {
//     const filePath = path.join(process.cwd(), 'generated-tests.ts');
//     await fs.writeFile(filePath, tests, 'utf8');
//     console.log(`Generated tests have been written to ${filePath}`);
//   } catch (error) {
//     console.error('Error writing generated tests to file:', error);
//   }
//
//   await new Promise(f => setTimeout(f, 1000));
//
//   return { 
//     ...state,
//     sender: "TestGenerator", 
//     tests: tests,
//     testResults: "All tests passed successfully." // Simulated test results
//   };
// });

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
  const result = await graph.invoke({
    integration: integration,
    task: task,
  });

  console.log("Final Result:");
  console.log(JSON.stringify(result, null, 2));
}

// Example usage
runWorkflow("clarifai", "ask-llm");
// runWorkflow("github", "create-comment");
// runWorkflow("binance", "fetch-pair-price");
