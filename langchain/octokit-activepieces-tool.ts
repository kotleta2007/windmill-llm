import { Octokit } from "@octokit/rest";
import { DynamicTool } from "@langchain/core/tools";

const token = process.env.GITHUB_TOKEN;
const owner = "activepieces";
const repo = "activepieces";

if (!token) {
  throw new Error("GITHUB_TOKEN is not set in the environment variables");
}

const octokit = new Octokit({ auth: token });

//
// Octokit utility functions called by the Octokit Tool
//

async function findScriptInRepoRecursive(
  directoryPath: string,
  scriptFilename: string
): Promise<string | null> {
  try {
    const { data: contents } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: directoryPath,
    });

    if (!Array.isArray(contents)) {
      throw new Error("Contents are not an array");
    }

    for (const item of contents) {
      if (item.type === "file" && item.name === scriptFilename) {
        // Found the file, get its content
        const { data: fileContent } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: item.path,
        });

        if ("content" in fileContent) {
          return Buffer.from(fileContent.content, "base64").toString("utf-8");
        } else {
          throw new Error("File content not available");
        }
      } else if (item.type === "dir") {
        // Recursively search in subdirectory
        const result = await findScriptInRepoRecursive(item.path, scriptFilename);
        if (result) return result;
      }
    }

    return null; // Script not found in this directory or its subdirectories
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

async function findMultipleScripts(integration: string): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const basePathPrefix = `packages/pieces/community/${integration}/`;

  // Get index.ts from ${integration}/src
  const indexContent = await findScriptInRepoRecursive(
    `packages/pieces/community/${integration}/src`,
    "index.ts"
  );
  if (indexContent) {
    results.set("src/index.ts", indexContent);
  }

  // Get all .ts files from src/lib/common
  try {
    const { data: contents } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: `packages/pieces/community/${integration}/src/lib/common`,
    });

    if (Array.isArray(contents)) {
      for (const item of contents) {
        if (item.type === "file" && item.name.endsWith(".ts")) {
          const { data: fileContent } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: item.path,
          });

          if ("content" in fileContent) {
            const content = Buffer.from(fileContent.content, "base64").toString("utf-8");
            const relativePath = item.path.replace(basePathPrefix, "");
            results.set(relativePath, content);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching files from src/lib/common:", error);
  }

  return results;
}

async function getIntegrationScripts(integration: string, task?: string): Promise<string> {
  let output = "";

  // Find the specific task script if provided
  if (task) {
    const taskScript = await findScriptInRepoRecursive(
      `packages/pieces/community/${integration}`,
      `${task}.ts`
    );
    
    if (taskScript) {
      output += `${integration} ${task}.ts script:\n\n${taskScript}\n`;
      output += `\n--- End of ${task}.ts ---\n\n`;
    } else {
      output += `${integration} ${task}.ts script not found\n\n`;
    }
  }

  // Find all other scripts for the integration
  const allScripts = await findMultipleScripts(integration);
  
  if (allScripts.size > 0) {
    output += `Other ${integration} scripts:\n\n`;
    for (const [filepath, content] of allScripts.entries()) {
      // Skip the task script if it was already included
      if (task && filepath.endsWith(`${task}.ts`)) continue;
      
      output += `File: ${filepath}\n\n`;
      output += content;
      output += "\n\n--- End of file ---\n\n";
    }
  } else {
    output += `No additional ${integration} scripts found\n`;
  }

  return output.trim();
}

// Usage example:
export async function getIntegrationOutput(integration: string, task?: string): Promise<string> {
  return await getIntegrationScripts(integration, task);
}

// Create a tool for retrieving integration scripts
export const integrationScriptsTool = new DynamicTool({
  name: "integrationScripts",
  description: "Retrieves scripts for a specified integration and optional task. Input should be in the format 'integration,task' or just 'integration'.",
  func: async (input: string) => {
    const [integration, task] = input.split(',').map(item => item.trim());
    
    if (!integration) {
      return "Please provide at least an integration name.";
    }

    try {
      const output = await getIntegrationOutput(integration, task);
      return output || `No scripts found for integration: ${integration}${task ? `, task: ${task}` : ''}`;
    } catch (error) {
      // Proper error handling
      if (error instanceof Error) {
        return `An error occurred while retrieving scripts: ${error.message}`;
      } else {
        return "An unknown error occurred while retrieving scripts.";
      }
    }
  },
});

// console.log(await getIntegrationOutput("clarifai", "ask-llm"))
// console.log(await getIntegrationOutput("gitlab", "create-issue-action"))
// console.log(await getIntegrationOutput("gitlab", "issue-event"))
// console.log(await getIntegrationOutput("gitlab"))
