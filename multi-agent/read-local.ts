import * as fs from "fs";
import * as path from "path";

export function getEnvVariableNames(): string[] {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const envContent = fs.readFileSync(envPath, "utf8");
    const lines = envContent.split("\n");
    const variableNames = lines
      .filter((line) => line.trim() !== "" && !line.startsWith("#"))
      .map((line) => {
        const [name] = line.split("=");
        return name.trim();
      });
    return variableNames;
  } catch (error) {
    console.error("Error reading .env file:", error);
    return [];
  }
}

export function getDependencies(): { [key: string]: string } {
  try {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContent);

    // Combine both dependencies and devDependencies
    return {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
  } catch (error) {
    console.error("Error reading package.json file:", error);
    return {};
  }
}

// Usage
// refactor this to be in a main function
// const envVariables = getEnvVariableNames();
// console.log('Environment variables:', envVariables);

// const dependencies = getDependencies();
// console.log('Dependencies:', dependencies);
