import { file } from "bun";

async function readContentsOfFile(filepath: string): Promise<string> {
  const file = Bun.file(filepath);
  return await file.text();
}

function trimIntegration(integration: string, filepath: string): string {
  return filepath.substring(filepath.indexOf(integration));
}

async function activePiecesCommonFiles(integration: string, filepaths: string[]): Promise<string> {
  const fileContents = await Promise.all(
    filepaths.map(async (x) => {
      const content = await readContentsOfFile(x);
      return `filename: ${trimIntegration(integration, x)}\ncontent: \n${content}\n\n`;
    })
  );

  return fileContents.reduce(
    (acc, str) => acc + str,
    ""
  );
}

export function capitalizeFirstLetter(str: string): string {
  return str[0].toUpperCase() + str.slice(1);
}

// USER PROMPT

async function genUserPrompt(description: string, 
                       integration: string, 
                       scriptFilepath: string, 
                       additionalScripts: string[]
                      ): Promise<string> {
  const promptTemplate = `
Create a script which should: {description} in {integration}
The type name for the authentication information should be exactly {capitalizedIntegration}
Here is the ActivePieces original script: \n{script}
Here are some additional scripts used by the ActivePieces original script: \n{scripts}
  `;

  const scriptSourceCode = await readContentsOfFile(scriptFilepath);
  const scriptsSourceCode = await activePiecesCommonFiles(integration, additionalScripts);

  return promptTemplate
    .replace("{description}", description)
    .replace("{integration}", integration)
    .replace("{capitalizedIntegration}", capitalizeFirstLetter(integration))
    .replace("{script}", scriptSourceCode)
    .replace("{scripts}", scriptsSourceCode)
}

// FILES GO HERE
const scriptFilepath = "/home/mark/git/activepieces/packages/pieces/community/asana/src/lib/actions/create-task.ts";

const additionalScriptsFilepaths = [
  "/home/mark/git/activepieces/packages/pieces/community/asana/src/index.ts",
  "/home/mark/git/activepieces/packages/pieces/community/asana/src/lib/common/index.ts",
];

const integration = "asana";
const description = "Create a task";

const userPrompt = await genUserPrompt(description, integration, scriptFilepath, additionalScriptsFilepaths);
export { userPrompt };
 
async function main() {
 
  try {
    const result = await genUserPrompt(description, integration, scriptFilepath, additionalScriptsFilepaths);
    // console.log(result);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
