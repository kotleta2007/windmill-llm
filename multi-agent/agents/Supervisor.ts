import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getAllAvailableScripts } from "../octokit";

const supervisorAgent = await createAgent(
  "Supervisor",
  `
  You are a supervisor agent coordinating the code generation process.
  Your task is to classify scripts into CRUD categories and identify triggers.
  Triggers are scripts that respond to external events rather than being explicitly called.
  `,
  modelType,
);

export interface Script {
  name: string;
  type: "Create" | "Read" | "Update" | "Delete" | "Trigger";
}

export async function initializeSupervisor(
  integration: string,
): Promise<Script[]> {
  console.log("Initializing Supervisor");
  const scripts = await getAllAvailableScripts(integration);
  console.log("Scripts found:", scripts);
  return classifyScripts(scripts);
}

async function classifyScripts(scripts: string[]): Promise<Script[]> {
  const classificationPrompt = `
    Classify the following scripts into CRUD categories or as triggers:
    ${scripts.join(", ")}

    Respond with a JSON array of objects, each containing 'name' and 'type' properties.
    The 'type' should be one of: 'Create', 'Read', 'Update', 'Delete', or 'Trigger'.

    Consider a script as a trigger if its name suggests it responds to external events,
    such as 'on_new_email', 'when_file_uploaded', 'webhook_handler', etc.

    For each script classified as a trigger, add a 'triggerEvent' property describing the event it responds to.

    Ensure your response is valid JSON and is wrapped in triple backticks like this:
    \`\`\`json
    [{"name": "example", "type": "Read"}]
    \`\`\`
  `;

  const result = await supervisorAgent.invoke({ input: classificationPrompt });

  console.log("Supervisor classification result:\n\n", result.content);

  try {
    const matchJSON = result.content.match(/```json\n([\s\S]*?)\n```/);
    const json = matchJSON?.[1] || "";

    if (!json.trim()) {
      throw new Error("Empty JSON response");
    }

    const classifiedScripts: Script[] = JSON.parse(json);

    if (!Array.isArray(classifiedScripts) || classifiedScripts.length === 0) {
      throw new Error("Invalid or empty array in JSON response");
    }

    return classifiedScripts;
  } catch (error) {
    console.error("Error parsing classified scripts:", error);
    // Fallback: classify all scripts as 'Read' type
    return scripts.map((name) => ({
      name,
      type: "Read" as const,
      category: "Action" as const, // Assuming all are actions in fallback
    }));
  }
}
