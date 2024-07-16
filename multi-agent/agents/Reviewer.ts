import type { AgentState } from "./Agent";
import { createAgent, modelType } from "./Agent";
import { Windmill } from "../tools/Windmill";
import { Tavily } from "../tools/Tavily";

const reviewer = await createAgent(
  "Reviewer",
  `
  You are a code reviewer.
  Your job is to analyze code, tests, and test results.
  You do not write code.
  You decide if the code meets the requirements and is ready for submission, or if it needs more work.
  `,
  modelType,
);

export async function reviewerFunc(
  state: AgentState,
): Promise<Partial<AgentState>> {
  console.log("Reviewer Agent called");

  let newState: Partial<AgentState> = {
    ...state,
    sender: "Reviewer",
    reviewed: true,
  };

  if (state.code && state.tests && state.testResults) {
    const input = `
      Review the following for integration: ${state.integration}, task: ${state.task}\n
      Code: ${state.code}\n
      Tests: ${state.tests}\n
      Test Results: ${state.testResults}\n
      Static Test Results: ${state.staticTestResults}\n
      Generated Test Results: ${state.genTestResults}\n
      Decide if this is ready to submit or needs more work.
      The code should be functional and the test should validate its functionality.
      Don't bother with comments, best developer practices and documentation.
      Just make sure it does what it says on the tin.
      Make sure the test is executable.
      Respond with VALIDATED if it's ready to submit, or NEEDS_WORK if it needs improvements.`;

    const result = await reviewer.invoke({
      input: input,
    });

    // console.log(result.content);
    // console.log(input);

    // console.log(result.content);

    if (result.content.includes("VALIDATED")) {
      const windmillResult = Windmill.submitToHub(state.code, state.tests);
      newState.submitted = true;
    } else if (result.content.includes("NEEDS_WORK")) {
      const tavilyResult = await Tavily.search(
        `${state.integration} ${state.task} API endpoints`,
      );

      // console.log("HERE IS WHAT I HAVE FOUND");
      // console.log(tavilyResult);
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
}
