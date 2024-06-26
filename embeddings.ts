import OpenAI from "openai";
import { similarity } from "./tensors.ts"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI();

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

const send_put_request_code: string = `
export async function main(url: string, body: object = {}) {
  const resp = await fetch(url, {
    method: "PUT",
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

const telegram_send_code: string = `
import { Telegram } from "npm:telegraf@4.11";

type Telegram = {
  token: string;
};
export async function main(
  auth: Telegram,
  chat_id: string | number,
  text: string,
  reply_to_message_id?: number,
) {
  const client = new Telegram(auth.token)
  return await client.sendMessage(chat_id, text, {
    reply_to_message_id,
  });
}
`;

// const model_type = "text-embedding-3-small";
// const model_type = "text-embedding-3-large";
const model_type = "text-embedding-3-large";

async function main() {
  const embedding1 = await openai.embeddings.create({
    model: model_type,
    input: send_post_request_code,
    encoding_format: "float",
  });

  const embedding2 = await openai.embeddings.create({
      model: model_type,
      input: send_put_request_code,
      encoding_format: "float",
    });

  const embedding3 = await openai.embeddings.create({
      model: model_type,
      input: telegram_send_code,
      encoding_format: "float",
    });

  const embeddings = [embedding1, embedding2, embedding3];

  for (let idx1 = 0; idx1 < embeddings.length; idx1++) {
    const emb1 = embeddings[idx1];
    for (let idx2 = 0; idx2 < embeddings.length; idx2++) {
      const emb2 = embeddings[idx2];
      const e1 = emb1.data[0].embedding;
      const e2 = emb2.data[0].embedding;
      const res = await similarity(e1, e2);

      console.log("The similarity between ", idx1, " and ", idx2, " is ", res);
    }
  }
}

main();
