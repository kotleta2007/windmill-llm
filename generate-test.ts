const path = "./example-from-llm.ts";
const file = Bun.file(path);

const text = await file.text();
console.log(text)
// string
