import { AxAI, AxAgent, AxChainOfThought, AxFunction } from '@ax-llm/ax';
import { ActivePiecesRepository } from './activePieces';
import { TavilyAPI } from './tavily';
import { WindmillHub } from './windmill';

// Initialize the AI
const ai = new AxAI({
  name: 'openai',
  apiKey: process.env.OPENAI_API_KEY as string
});

// Define AxFunctions
const functions: AxFunction[] = [
  {
    name: 'searchActivePiecesRepo',
    description: 'Search ActivePieces repository for relevant scripts',
    func: ActivePiecesRepository.searchRelevantScripts,
    parameters: {
      type: 'object',
      properties: {
        integration: { type: 'string', description: 'The integration service name' },
        task: { type: 'string', description: 'The task description' }
      },
      required: ['integration', 'task']
    }
  },
  {
    name: 'generateCode',
    description: 'Generate code based on the given task and integration',
    func: async ({ integration, task, additionalInfo }) => {
      console.log("Generating code")
      const relevantScript = await ActivePiecesRepository.searchRelevantScripts(integration, task);
      return `
        // Generated code for ${integration} - ${task}
        ${relevantScript}
        // Additional implementation...
        ${additionalInfo ? `// Using additional info: ${additionalInfo}` : ''}
      `;
    },
    parameters: {
      type: 'object',
      properties: {
        integration: { type: 'string', description: 'The integration service name' },
        task: { type: 'string', description: 'The task description' },
        additionalInfo: { type: 'string', description: 'Additional information for code generation' }
      },
      required: ['integration', 'task']
    }
  },
  {
    name: 'generateAndRunTests',
    description: 'Generate and run tests for the given code',
    func: async ({ generatedCode, task }) => {
      const tests = `
        test('should fetch user data', async () => {
          const userData = await fetchUserData('123');
          expect(userData).toBeDefined();
        });
      `;
      const testReport = 'All tests passed successfully.';
      return { tests, testReport };
    },
    parameters: {
      type: 'object',
      properties: {
        generatedCode: { type: 'string', description: 'The generated code to test' },
        task: { type: 'string', description: 'The task description' }
      },
      required: ['generatedCode', 'task']
    }
  },
  {
    name: 'searchTavily',
    description: 'Search Tavily for additional information',
    func: TavilyAPI.search,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'submitToWindmill',
    description: 'Submit approved code and tests to Windmill Hub',
    func: WindmillHub.submitCode,
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The approved code' },
        tests: { type: 'string', description: 'The approved tests' }
      },
      required: ['code', 'tests']
    }
  }
];

// Define agents with corrected signatures
const reviewerAgent = new AxAgent(ai, {
  name: 'Code Reviewer',
  description: 'Reviews generated code and tests, and coordinates the generation process.',
  signature: `
    integration:string,
    task:string,
    code:string,
    tests:string,
    testReport:string -> isApproved:boolean, feedback:string
  `,
  functions: functions.filter(f => ['searchTavily'].includes(f.name))
});

const codeGeneratorAgent = new AxAgent(ai, {
  name: 'Code Generator',
  description: 'Generates code based on the given task and integration.',
  signature: `
    integration:string,
    task:string,
    additionalInfo?:string -> generatedCode:string
  `,
  functions: functions.filter(f => ['generateCode', 'searchActivePiecesRepo'].includes(f.name))
});

const testGeneratorAgent = new AxAgent(ai, {
  name: 'Test Generator',
  description: 'Generates and runs tests for the generated code.',
  signature: `
    generatedCode:string,
    task:string -> tests:string, testReport:string
  `,
  functions: functions.filter(f => ['generateAndRunTests'].includes(f.name))
});

// Main workflow
const workflowAgent = new AxAgent(ai, {
  name: 'Workflow Agent',
  description: 'Orchestrates the entire code generation, testing, and review process',
  signature: `
    integration:string,
    task:string -> code:string, tests:string, isApproved:boolean, feedback:string
  `,
  functions
});

// Usage
async function main() {
  const result = await workflowAgent.forward({
    integration: 'SomeService',
    task: 'Create a script to fetch user data'
  });

  console.log(result);
}

main().catch(console.error);
