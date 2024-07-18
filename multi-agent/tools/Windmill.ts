import * as fs from "fs";
import * as path from "path";

export const Windmill = {
  submitToHub: (
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
    const schemaFilePath = path.join(scriptsDir, "schema.json");

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

    // Write the schema to the file
    fs.writeFileSync(schemaFilePath, schema);

    console.log(`SUBMITTED TO WINDMILL:`);
    console.log(`Code: ${codeFilePath}`);
    console.log(`Tests: ${testsFilePath}`);
    console.log(`Schema: ${schemaFilePath}`);

    return "Successfully submitted code, tests, and schema to Windmill Hub";
  },
};
