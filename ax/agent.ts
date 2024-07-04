import { AxAI, AxChainOfThought } from '@ax-llm/ax';

const textToSummarize = `
The technological singularity—or simply the singularity[1]—is a hypothetical future point in time at which technological growth becomes uncontrollable and irreversible, resulting in unforeseeable changes to human civilization.[2][3] ...`;

const ai = new AxAI({
  name: 'openai',
  apiKey: process.env.OPENAI_API_KEY as string
});

const gen = new AxChainOfThought(
  ai,
  `textToSummarize -> shortSummary "summarize in 5 to 10 words"`
);

const res = await gen.forward({ textToSummarize });

console.log('>', res);
