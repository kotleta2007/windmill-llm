import { glob } from "glob";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/index.mjs";
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

const send_post_request_question: string = "Send POST Request";

const send_post_request_code: string = `
export async function main(url: string, body: object = {}) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return {
    ok: resp.ok,
    status: resp.status,
    text: await resp.text(),
  };
}
`;

function setCodeExample(question: string, codeExample: string): string {
  return fetchSystemPrompt
    .replace("{sample_question}", question)
    .replace("{code}", codeExample)
}

const messages: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: setCodeExample(send_post_request_question, send_post_request_code),
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

