import { Octokit } from "@octokit/rest";

const token = process.env.GITHUB_TOKEN;
const owner = "activepieces";
const repo = "activepieces";

if (!token) {
  throw new Error("GITHUB_TOKEN is not set in the environment variables");
}

const octokit = new Octokit({ auth: token });

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

export async function getIntegrationOutput(integration: string, task: string): Promise<string> {
  let output = "";

  // Find the specific task script
  const taskScript = await findScriptInRepoRecursive(
    `packages/pieces/community/${integration}`,
    `${task}.ts`
  );
  
  if (taskScript) {
    output += `${integration} ${task}.ts script:\n\n${taskScript}`;
  } else {
    output += `${integration} ${task}.ts script not found`;
  }
  
  output += "\n\n--- Separator between task script and other scripts ---\n\n";

  // Find other scripts
  const scripts = await findMultipleScripts(integration);
  
  for (const [filepath, content] of scripts.entries()) {
    output += `File: ${filepath}\n\n`;
    output += content;
    output += "\n\n--- End of file ---\n\n";
  }

  return output;
}

// Usage example:
async function main() {
  const output = await getIntegrationOutput("clarifai", "ask-llm");
  console.log(output);
}

// main().catch(console.error);
