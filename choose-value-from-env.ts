import { readFileSync } from 'fs';
import { resolve } from 'path';
import inquirer from 'inquirer';
// import { readEnv } from 'openai/core.mjs';

/**
 * Reads a .env file from the current directory and parses it.
 * @returns A Record<string, string> of the environment variables contained in the .env file.
 */
export function readEnvFile(): Record<string, string> {
    const envPath = resolve('.env'); // Adjust this path as needed.
    const envFileContent = readFileSync(envPath, 'utf8');
    
    return envFileContent
        .split('\n')
        .filter(line => line && !line.startsWith('#')) // Filter out empty lines and comments
        .reduce((acc: Record<string, string>, line: string) => {
            let [key, ...values] = line.split('='); // In case environment variables contain '=' in their values
            key = key.trim();
            acc[key] = values.join('=').trim(); // Rejoin the split values
            return acc;
        }, {});
}

export async function chooseEnvVariable(envVars: Record<string, string>): Promise<string> {
  // Convert the envVars Record into a list of choices for inquirer
  const choices = Object.keys(envVars).map((key) => ({
    name: key, // Display format: key
    value: key // The actual selection value will be the key
  }));

  // Prompt the user to choose an environment variable
  const questions: inquirer.QuestionCollection = [
    {
      type: 'list',
      name: 'selectedEnvVar',
      message: 'Choose an environment variable:',
      choices: choices
    }
  ];

  const answer = await inquirer.prompt(questions);
  // Return the value associated with the chosen environment variable
  return envVars[answer.selectedEnvVar];
}

// chooseEnvVariable(readEnvFile())
//   .then((value) => {
//     console.log(`You have chosen the value: ${value}`);
//   })
//   .catch((error) => {
//     console.error('An error occurred:', error);
//   });
