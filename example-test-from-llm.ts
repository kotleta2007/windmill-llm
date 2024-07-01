import { main, ClarifaiAuth } from './example-from-llm.ts'; // Adjust the import path as necessary

// Test 1: Check if the code contains valid TypeScript
function testValidTypeScript() {
  try {
    // This will throw an error if the TypeScript is invalid
    const ts = require('typescript');
    const fs = require('fs');
    const fileName = './example-from-llm.ts'; // Adjust the path as necessary
    const sourceCode = fs.readFileSync(fileName, 'utf8');
    const result = ts.transpileModule(sourceCode, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    if (result.diagnostics && result.diagnostics.length > 0) {
      throw new Error('TypeScript compilation errors');
    }
    console.log('Test 1 Passed: Valid TypeScript');
  } catch (error) {
    console.error('Test 1 Failed:', error);
  }
}

// Test 2: Check if all endpoints listed in the code are valid
async function testValidEndpoints() {
  try {
    const auth: ClarifaiAuth = { token: process.env.CLARIFAI_TOKEN };
    const modelId = 'codellama-13b-instruct';
    const prompt = 'Generate a simple Python script that computes the Nth Fibonacci number';

    const findModelResponse = await fetch(`https://api.clarifai.com/v2/models?name=${modelId}&use_cases=llm`, {
      method: 'GET',
      headers: {
        Authorization: `Key ${auth.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!findModelResponse.ok) {
      throw new Error(`Couldn't find model ${modelId}: ${findModelResponse.statusText}`);
    }

    const findModelData = await findModelResponse.json();
    const model = findModelData.models[0];

    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const sendPromptResponse = await fetch(`https://api.clarifai.com/v2/users/${model.model_version.user_id}/apps/${model.model_version.app_id}/models/${model.id}/versions/${model.model_version.id}/outputs`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [
          {
            data: {
              text: {
                raw: prompt,
              },
            },
          },
        ],
      }),
    });

    if (!sendPromptResponse.ok) {
      throw new Error(`Couldn't send prompt to model ${modelId}: ${sendPromptResponse.statusText}`);
    }

    console.log('Test 2 Passed: All endpoints are valid');
  } catch (error) {
    console.error('Test 2 Failed:', error);
  }
}

// Test 3: Check if the code accomplishes the task that is specified
async function testAccomplishesTask() {
  try {
    const auth: ClarifaiAuth = { token: process.env.CLARIFAI_TOKEN };
    const modelId = 'codellama-13b-instruct';
    const prompt = 'Generate a simple Python script that computes the Nth Fibonacci number';

    const result = await main(auth, modelId, prompt);

    if (result.error) {
      throw result.error;
    }

    if (!result.result || typeof result.result !== 'string') {
      throw new Error('The result is not a valid string');
    }

    console.log('Test 3 Passed: The code accomplishes the task');
  } catch (error) {
    console.error('Test 3 Failed:', error);
  }
}

// Run all tests
testValidTypeScript();
testValidEndpoints();
testAccomplishesTask();

