import { glob } from "glob";
import { OpenAI } from "openai";
import { getScripts } from "./scripts.ts"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const fetchSystemPrompt = `
You have to create a single script which performs just the asked action in typescript in one main function which you export like this: "export async function main(...)". Take as parameter any information you need.
Return the action result.
You should use fetch and are not allowed to import any libraries.
Define a type which contains the authentication information and only that.
Do not handle errors.

Here's how interactions have to look like:
user: {sample_question}
assistant: \`\`\`typescript
{code}
\`\`\``;

// export async function codegenLLM(
//   integration: string,
//   action: {
//     name: string | undefined;
//     description: string | undefined;
//     id: string;
//   },
//   dependencies: string[] | undefined,
//   useFetch: boolean = true,
//   firstCode: string | undefined,
//   kind: "action" | "trigger" = "action"
// ) {
//   const messages: ChatCompletionMessageParam[] = [
//     {
//       role: "system",
//       content:
//         (kind === "trigger"
//           ? triggerSystemPrompt
//           : useFetch
//           ? fetchSystemPrompt
//           : systemPrompt) +
//         (firstCode
//           ? `\n\nHere's an example script for this integration:\n\`\`\`typescript\n${firstCode}\n\`\`\``
//           : ""),
//     },
//     {
//       role: "user",
//       content:
//         fetchSystemPrompt
//           .replace("{description}", action.description || "")
//           .replace("{integration}", integration)
//           +
//         ((kind === "trigger" || !useFetch) && dependencies?.length > 0
//           ? "\n\nThese libraries might be useful: {dependencies}".replace(
//               "{dependencies}",
//               dependencies.join(", ")
//             )
//           : ""),
//     },
//   ];
//
//   console.log("Before generation");
//
//   try {
//     const response = await openai.chat.completions.create({
//       messages,
//       model: "gpt-4",
//       max_tokens: 1024,
//       temperature: 0,
//     });
//     const content: string = response.choices[0].message.content;
//     const match = content.match(/```typescript\n([\s\S]*?)\n```/);
//     const code = match?.[1];
//     
//     console.log("Got result");
//     console.log(content);
//     return code;
//   } catch (err) {
//     console.error(err);
//   }
// }

const prompt = `
Create a script which should: {description} in {integration}
The type name for the authentication information should be exactly {capitalizedIntegration}
`;

export function capitalizeFirstLetter(str: string): string {
  return str[0].toUpperCase() + str.slice(1);
}


const integration = "binance";

const { actions, triggers, dependencies } = await getScripts(integration);

const action = actions[0];

const messages: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content:
      // (
      fetchSystemPrompt
      // ) +
      // (firstCode
      //   ? `\n\nHere's an example script for this integration:\n\`\`\`typescript\n${firstCode}\n\`\`\``
      //   : ""),
  },
  {
    role: "user",
    content:
      prompt
        .replace("{description}", action.description || "")
        .replace("{integration}", integration)
        .replace(
          "{capitalizedIntegration}",
          capitalizeFirstLetter(integration)
        )
      //   +
      // (dependencies?.length > 0
      //   ? "\n\nThese libraries might be useful: {dependencies}".replace(
      //       "{dependencies}",
      //       dependencies.join(", ")
      //     )
      //   : ""),
  },
];


try {
  const response = await openai.chat.completions.create({
    messages,
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
  });
  const content: string = response.choices[0].message.content;
  const match = content.match(/```typescript\n([\s\S]*?)\n```/);
  const code = match?.[1];
  
  console.log("Got result");
  console.log(content);
  console.log(code);
} catch (err) {
  console.error(err);
}


// console.log("Generating example code");
// const result = await (codegenLLM(
//   "Reddit",
//   {
//     name: "Top 10 posts in the given subreddit",
//     description: "Fetch data using the Reddit API and return it",
//     id: "1",
//   },
// ));
//
// console.log(result);
