import * as fs from "fs";
import * as path from "path";

export const Windmill = {
  submitToHub: (integration: string, task: string, code: string) => {
    const hubDir = "hub";
    const integrationDir = path.join(hubDir, integration);
    const filePath = path.join(integrationDir, `${task}.ts`);

    // Create the hub directory if it doesn't exist
    if (!fs.existsSync(hubDir)) {
      fs.mkdirSync(hubDir);
    }

    // Create the integration subdirectory if it doesn't exist
    if (!fs.existsSync(integrationDir)) {
      fs.mkdirSync(integrationDir);
    }

    // Write the code to the file
    fs.writeFileSync(filePath, code);

    console.log(`SUBMITTED TO WINDMILL: ${filePath}`);

    return "Successfully submitted to Windmill Hub";
  },
};
