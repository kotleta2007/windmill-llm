import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getAllAvailableScripts } from "../octokit";

const supervisorAgent = await createAgent(
  "Supervisor",
  `
  You are a supervisor agent coordinating the code generation process.
  Your task is to classify scripts into CRUD categories.
  `,
  modelType,
);

export interface Script {
  name: string;
  type: "Create" | "Read" | "Update" | "Delete";
}

export async function initializeSupervisor(
  integration: string,
): Promise<Script[]> {
  console.log("Initializing Supervisor");
  const scripts = await getAllAvailableScripts(integration);
  return classifyScripts(scripts);
}

async function classifyScripts(scripts: string[]): Promise<Script[]> {
  const classificationPrompt = `
    Classify the following scripts into CRUD categories:
    ${scripts.join(", ")}

    Respond with a JSON array of objects, each containing 'name' and 'type' properties.
    The 'type' should be one of: 'Create', 'Read', 'Update', or 'Delete'.
  `;

  const result = await supervisorAgent.invoke({ input: classificationPrompt });

  console.log("Supervisor classification result:\n\n", result.content);

  try {
    const matchJSON = result.content.match(/```json\n([\s\S]*?)\n```/);
    const json = matchJSON?.[1] || "";

    const classifiedScripts: Script[] = JSON.parse(json);
    return classifiedScripts;
  } catch (error) {
    console.error("Error parsing classified scripts:", error);
    // Fallback: assume all scripts are 'Read' type
    return scripts.map((name) => ({ name, type: "Read" as const }));
  }
}
