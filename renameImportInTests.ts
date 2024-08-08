import { readdir, readFile, writeFile } from "fs/promises";
import { join, relative, dirname } from "path";

async function updateTestImports(hubPath: string) {
  try {
    const integrations = await readdir(hubPath);

    for (const integration of integrations) {
      const actionsPath = join(hubPath, integration, "scripts", "action");

      try {
        const actionFolders = await readdir(actionsPath);

        for (const actionFolder of actionFolders) {
          await processActionFolder(join(actionsPath, actionFolder));
        }
      } catch (error) {
        console.error(
          `Error processing actions for integration ${integration}:`,
          error,
        );
      }
    }
  } catch (error) {
    console.error("Error reading hub directory:", error);
  }
}

async function processActionFolder(folderPath: string) {
  const testFilePath = join(folderPath, "script.test.ts");
  const fetchFilePath = join(folderPath, "script.fetch.ts");

  try {
    // Check if both files exist
    await Promise.all([
      readFile(testFilePath, "utf-8"),
      readFile(fetchFilePath, "utf-8"),
    ]);

    // Read the content of the test file
    let testFileContent = await readFile(testFilePath, "utf-8");

    // Calculate the relative path from test file to fetch file
    const relativePath = relative(dirname(testFilePath), fetchFilePath).replace(
      /\.ts$/,
      "",
    );

    // Update the import statement
    const updatedContent = testFileContent.replace(
      /import\s*{\s*main\s*}\s*from\s*['"]\.\/generated-code['"];?/,
      `import { main } from './${relativePath}';`,
    );

    // Write the updated content back to the test file
    await writeFile(testFilePath, updatedContent, "utf-8");

    console.log(`Updated import in ${testFilePath}`);
  } catch (error) {
    console.error(`Error processing action folder ${folderPath}:`, error);
  }
}

async function main() {
  const hubPath = "./hub"; // Adjust this path as needed
  await updateTestImports(hubPath);
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
