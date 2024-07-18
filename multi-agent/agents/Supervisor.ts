import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { getAllAvailableScripts } from "../octokit";

const supervisorAgent = await createAgent(
  "Supervisor",
  `
  You are a supervisor agent coordinating the code generation process.
  Your task is to classify scripts into CRUD categories and manage the generation of each script.
  `,
  modelType,
);

interface Script {
  name: string;
  type: "Create" | "Read" | "Update" | "Delete";
}

export async function supervisorFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("Supervisor Agent called");

  if (!state.supervisorState) {
    // Initial state, start the process
    const scripts = await getAllAvailableScripts(state.integration);
    const classifiedScripts = await classifyScripts(scripts);
    return {
      ...state,
      supervisorState: {
        scripts: classifiedScripts,
        currentIndex: 0,
      },
    };
  }

  if (
    state.supervisorState.currentIndex >= state.supervisorState.scripts.length
  ) {
    // All scripts have been processed
    console.log("All scripts have been generated");
    return { ...state, complete: true };
  }

  const currentScript =
    state.supervisorState.scripts[state.supervisorState.currentIndex];

  if (state.sender === "Reviewer" && state.reviewed) {
    // Move to the next script
    console.log(`Script ${currentScript.name} has been generated and reviewed`);
    return {
      ...state,
      supervisorState: {
        ...state.supervisorState,
        currentIndex: state.supervisorState.currentIndex + 1,
      },
    };
  }

  // Trigger code generation for the current script
  console.log(`Triggering code generation for ${currentScript.name}`);
  return {
    ...state,
    task: currentScript.name,
    taskType: currentScript.type,
    sender: "Supervisor",
  };
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
