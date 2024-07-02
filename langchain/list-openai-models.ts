import OpenAI from "openai";

type OpenAIModel = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  // get models; sort by 'created' attribute in reverse order (most recent at the end)
  const sortedModels: OpenAIModel[] = await Array.fromAsync(client.models.list());
  sortedModels.sort((a, b) => a.created - b.created);

  // Pretty-print each model's JSON
  for (const model of sortedModels) {
    const modelWithReadableDate = {
      ...model,
      created: new Date(model.created * 1000).toUTCString()
    };
    console.log(JSON.stringify(modelWithReadableDate, null, 2));
    console.log('---');
  }
}

main();
