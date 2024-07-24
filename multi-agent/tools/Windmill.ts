import * as fs from "fs";
import * as path from "path";
import { getActivePiecesScripts } from "../octokit";

export const Windmill = {
  submitToHub: async (
    integration: string,
    task: string,
    code: string,
    tests: string,
    schema: string,
  ) => {
    const hubDir = "hub";
    const integrationDir = path.join(hubDir, integration);
    const scriptsDir = path.join(integrationDir, "scripts", "action", task);
    const codeFilePath = path.join(scriptsDir, "script.fetch.ts");
    const testsFilePath = path.join(scriptsDir, "script.test.ts");
    const schemaFilePath = path.join(integrationDir, "schema.json");
    const metadataFilePath = path.join(scriptsDir, "script.json");

    // Create directories if they don't exist
    [
      hubDir,
      integrationDir,
      path.join(integrationDir, "scripts"),
      path.join(integrationDir, "scripts", "action"),
      scriptsDir,
    ].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Write the code to the file
    fs.writeFileSync(codeFilePath, code);

    // Write the tests to the file
    fs.writeFileSync(testsFilePath, tests);

    // Write the schema to the file in the integration directory
    fs.writeFileSync(schemaFilePath, schema);

    // Fetch and write metadata
    const scriptContent = await getActivePiecesScripts(integration, task);
    const displayNameMatch = scriptContent.match(/displayName:\s*['"](.+)['"]/);
    const descriptionMatch = scriptContent.match(/description:\s*['"](.+)['"]/);

    const metadata = {
      summary: displayNameMatch ? displayNameMatch[1] : "",
      description: descriptionMatch ? descriptionMatch[1] : "",
    };

    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));

    console.log(`SUBMITTED TO WINDMILL:`);
    console.log(`Code: ${codeFilePath}`);
    console.log(`Tests: ${testsFilePath}`);
    console.log(`Schema: ${schemaFilePath}`);
    console.log(`Metadata: ${metadataFilePath}`);

    return "Successfully submitted code, tests, schema, and metadata to Windmill Hub";
  },
};
