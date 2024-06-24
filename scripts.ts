import { glob } from "glob";
import { Octokit } from "@octokit/rest";

const owner = "activepieces";
const repo = "activepieces";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export async function getNewIntegrations(number: number) {
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path: "packages/pieces/community",
  });

  if (!Array.isArray(data)) {
    throw new Error("Invalid integration folder structure");
  }

  const existingIntegrations = await glob("hub/*");
  const integrations = data
    .filter(
      (d) =>
        d.type === "dir" &&
        d.name !== "common" &&
        !existingIntegrations.includes("hub/" + d.name)
    )
    .map((d) => d.name);

  const randomIntegrations = integrations
    .sort(() => Math.random() - Math.random())
    .slice(0, number);

  return randomIntegrations;
}

getNewIntegrations(10).then(integrations => console.log(integrations));

// const octokit = new Octokit({ auth: process.env.GITHUB_API_KEY });
//
// async function getFetchTsFiles(owner, repo) {
//   try {
//     // This gets up to 100 top-level entries from the root of the repo.
//     // If the repository is large and has more than 100 files/folders, pagination will be needed.
//     const response = await octokit.repos.getContent({
//       owner: owner,
//       repo: repo,
//     });
//
//     const files = response.data;
//     
//     if (Array.isArray(files)) {
//       const fetchTsFiles = files.filter(file => file.name.endsWith('.fetch.ts'));
//       
//       // If you only want the paths:
//       const filePaths = fetchTsFiles.map(file => file.path);
//
//       console.log(filePaths);
//       return filePaths;
//     }
//   } catch (error) {
//     console.error(error);
//   }
// }
//
// getFetchTsFiles('windmill-labs', 'windmill-integrations');
