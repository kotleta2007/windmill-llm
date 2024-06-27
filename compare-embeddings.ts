import { glob } from "glob";
import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/index.mjs";
import { getScripts } from "./scripts.ts"
import { similarity } from "./tensors";
import { result, userPrompt } from "./getContext";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const model_type = "text-embedding-3-large";

const integration = "asana";
const description = "Create a task";

// setCodeExample(send_post_request_question, send_post_request_code)

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

const prompt = `
Create a script which should: {description} in {integration}
The type name for the authentication information should be exactly {capitalizedIntegration}
`;

export function capitalizeFirstLetter(str: string): string {
  return str[0].toUpperCase() + str.slice(1);
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
        .replace("{description}", description)
        .replace("{integration}", integration)
        .replace(
          "{capitalizedIntegration}",
          capitalizeFirstLetter(integration)
        )
  },
];

// ground truth: existing Windmill script
const groundTruthPath = "/home/mark/git/windmill-integrations/hub/asana/scripts/action/Create_a_task/script.native.ts";
const groundTruthFile = Bun.file(groundTruthPath);
const groundTruth: string = await groundTruthFile.text();

// generate without context (zero-shot learning)

console.log("Generating without context")

const messages_zero_shot: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: setCodeExample(send_post_request_question, send_post_request_code),
  },
  {
    role: "user",
    content:
      prompt
        .replace("{description}", description)
        .replace("{integration}", integration)
        .replace(
          "{capitalizedIntegration}",
          capitalizeFirstLetter(integration)
        )
  },
];

const response = await openai.chat.completions.create({
    messages,
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
  });
const content: string = response.choices[0].message.content;
const match = content.match(/```typescript\n([\s\S]*?)\n```/);
const code = match?.[1];

const groundTruthEmbedding = await openai.embeddings.create({
  model: model_type,
  input: groundTruth,
  encoding_format: "float",
});

const codeEmbedding = await openai.embeddings.create({
  model: model_type,
  input: code,
  encoding_format: "float",
});

const sim = await similarity(codeEmbedding.data[0].embedding, groundTruthEmbedding.data[0].embedding);

console.log("Similarity between generated code and ground truth: ", sim)

// generate using other Windmill scripts from the same integration

console.log("\nGenerating using other Windmill scripts from the same integration")

const windmillPath = "/home/mark/git/windmill-integrations/hub/asana/scripts/action/Create_a_team/script.native.ts";
const windmillFile = Bun.file(windmillPath);
const windmillExample: string = await windmillFile.text();

const messages_windmill: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: setCodeExample(send_post_request_question, send_post_request_code),
  },
  {
    role: "user",
    content:
      prompt
        .replace("{description}", description)
        .replace("{integration}", integration)
        .replace(
          "{capitalizedIntegration}",
          capitalizeFirstLetter(integration)
        ) + "Use this as an example code: {example}".replace("{example}", windmillExample)
  },
];


const response_windmill = await openai.chat.completions.create({
    messages: messages_windmill,
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
  });
const content_windmill: string = response_windmill.choices[0].message.content;
const match_windmill = content_windmill.match(/```typescript\n([\s\S]*?)\n```/);
const code_windmill = match_windmill?.[1];

const codeEmbedding_windmill = await openai.embeddings.create({
  model: model_type,
  input: code_windmill,
  encoding_format: "float",
});

const sim_windmill = await similarity(codeEmbedding_windmill.data[0].embedding, groundTruthEmbedding.data[0].embedding);

console.log("Similarity between generated code and ground truth: ", sim_windmill)

// generate using other ActivePieces scripts
console.log("\nGenerating using other ActivePieces scripts")

// /home/mark/git/activepieces/packages/pieces/community/asana/src/lib/actions/create-task.ts
// /home/mark/git/activepieces/packages/pieces/community/asana/src/lib/common/index.ts

const activePiecesPath = "/home/mark/git/activepieces/packages/pieces/community/asana/src/lib/actions/create-task.ts";
const activePiecesFile = Bun.file(activePiecesPath);
const activePiecesExample: string = await activePiecesFile.text();

const activePiecesCommon: string = "/home/mark/git/activepieces/packages/pieces/community/asana/src/index.ts";

const messages_activepieces: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: setCodeExample(send_post_request_question, send_post_request_code),
  },
  {
    role: "user",
    content:
      prompt
        .replace("{description}", description)
        .replace("{integration}", integration)
        .replace(
          "{capitalizedIntegration}",
          capitalizeFirstLetter(integration)
        ) + "Use this as an example code: {example}".replace("{example}", activePiecesExample)
  },
];


const response_activepieces = await openai.chat.completions.create({
    messages: messages_activepieces,
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
  });
const content_activepieces: string = response_activepieces.choices[0].message.content;
const match_activepieces = content_activepieces.match(/```typescript\n([\s\S]*?)\n```/);
const code_activepieces = match_activepieces?.[1];

// console.log("Code from active pieces")

// console.log(code_activepieces)

const codeEmbedding_activepieces = await openai.embeddings.create({
  model: model_type,
  input: code_activepieces,
  encoding_format: "float",
});

const sim_activepieces = await similarity(codeEmbedding_activepieces.data[0].embedding, groundTruthEmbedding.data[0].embedding);

console.log("Similarity between generated code and ground truth: ", sim_activepieces)




// generate using both
console.log("\nGenerating using both")

const messages_both: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: setCodeExample(send_post_request_question, send_post_request_code),
  },
  {
    role: "user",
    content:
      prompt
        .replace("{description}", description)
        .replace("{integration}", integration)
        .replace(
          "{capitalizedIntegration}",
          capitalizeFirstLetter(integration)
        ) + "\n\nUse this as an example code: {example}".replace("{example}", activePiecesExample)
          + "\n\nUse this as an example code: {example}".replace("{example}", windmillExample)


  },
];


const response_both = await openai.chat.completions.create({
    messages: messages_both,
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
  });
const content_both: string = response_both.choices[0].message.content;
const match_both = content_both.match(/```typescript\n([\s\S]*?)\n```/);
const code_both = match_both?.[1];

const codeEmbedding_both = await openai.embeddings.create({
  model: model_type,
  input: code_both,
  encoding_format: "float",
});

const sim_both = await similarity(codeEmbedding_both.data[0].embedding, groundTruthEmbedding.data[0].embedding);

console.log("Similarity between generated code and ground truth: ", sim_both)

// generate using ActivePieces (using multiple scripts)
console.log("\nGenerating using multiple scripts from ActivePieces")

const messages_bis: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: setCodeExample(send_post_request_question, send_post_request_code),
  },
  {
    role: "user",
    content:
      userPrompt,

  },
];


const response_bis = await openai.chat.completions.create({
    messages: messages_bis,
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
  });
const content_bis: string = response_bis.choices[0].message.content;
const match_bis = content_bis.match(/```typescript\n([\s\S]*?)\n```/);
const code_bis = match_bis?.[1];

const codeEmbedding_bis = await openai.embeddings.create({
  model: model_type,
  input: code_bis,
  encoding_format: "float",
});

const sim_bis = await similarity(codeEmbedding_bis.data[0].embedding, groundTruthEmbedding.data[0].embedding);

console.log("Similarity between generated code and ground truth: ", sim_bis)

