import { chooseEnvVariable, readEnvFile } from "./choose-value-from-env.ts"
import { extractScriptInfo } from "./scriptParser.ts";
import type { ScriptInfo } from "./scriptParser.ts";
import { existsSync } from 'fs';
import inquirer from 'inquirer';

function prettyPrintJSON(obj: any): void {
  console.log(JSON.stringify(obj, null, 2));
}

function prompt(question: string): Promise<string> {
  console.log("in prompt rn")
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

async function chooseScript(): Promise<string> {
  while (true) {
    let input = await prompt("Choose a script name:")
    if (!existsSync(input)) {
      console.log("The file doesn't exist.")
      continue;
    } else if (!input.endsWith(".ts")) {
      console.log("The file is not a valid TypeScript file.")
      continue;
    } else {
      return input;
    }
  }
}

async function fillArguments(args: Record<string, string>, types: Record<string, Record<string, string>>): Promise<Record<string, any>> {
  const filledArgs: Record<string, any> = {};
  const envVars = readEnvFile();

  for (const [name, type] of Object.entries(args)) {
    let value: any;
    let isValid = false;

    while (!isValid) {
      switch (type) {
        case 'string':
        case 'number':
        case 'boolean':
          const answer = await inquirer.prompt([{
            type: 'input',
            name: 'value',
            message: `Enter value for ${name} (${type}):`,
            validate: (input) => {
              if (type === 'number') {
                return !isNaN(Number(input)) || 'Please enter a valid number';
              }
              if (type === 'boolean') {
                return ['true', 'false'].includes(input.toLowerCase()) || 'Please enter true or false';
              }
              return true;
            }
          }]);
          
          value = answer.value;
          if (type === 'number') value = Number(value);
          if (type === 'boolean') value = value.toLowerCase() === 'true';
          
          isValid = true;
          break;
        default:
          // Handle custom types
          if (types[type]) {
            value = {};
            console.log(`Setting values for ${name} (${type}):`);
            for (const [key, keyType] of Object.entries(types[type])) {
              const subValue = await chooseEnvVariable(envVars);
              value[key] = subValue;
            }
            isValid = true;
          } else {
            console.log(`Unknown type: ${type}. Treating as string.`);
            const answer = await inquirer.prompt([{
              type: 'input',
              name: 'value',
              message: `Enter value for ${name}:`
            }]);
            value = answer.value;
            isValid = true;
          }
          break;
      }
    }
    
    filledArgs[name] = value;
  }
  return filledArgs;
}

async function main() {
  const scriptPath = await chooseScript();
  console.log("You chose the script: ", scriptPath)
  
  const scriptInfo: ScriptInfo = extractScriptInfo(scriptPath);
  console.log("The integration requires the following input: ")
  prettyPrintJSON(scriptInfo.mainFunctionArgs);
  
  const filledArgs = await fillArguments(scriptInfo.mainFunctionArgs, scriptInfo.typeDefinitions);
  console.log('Filled arguments:', filledArgs);

  // Import the user script dynamically
  const userScript = await import(scriptPath);

  // Check if the main function exists in the imported script
  if (typeof userScript.main !== 'function') {
    console.error('Error: The imported script does not have a main function.');
    process.exit(1);
  }

  try {
    // Prepare the arguments in the correct order
    const argValues = Object.keys(scriptInfo.mainFunctionArgs).map(argName => {
      return filledArgs[argName];
    });

    // Call the main function of the user script with the individual arguments
    const result = await userScript.main(...argValues);
    
    // Print the result to the screen
    console.log('Result of the script execution:');
    prettyPrintJSON(result);
  } catch (error) {
    console.error('Error executing the script:', error);
  }

  process.exit(0);
}

main();
