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

function removeDependencies(obj: any, substring:string): any {
  const dependencies = obj.dependencies;
  return Object.keys(dependencies).reduce((acc, key) => {
    if (!key.includes(substring)) {
      acc[key] = dependencies[key];
    }
    return acc;
  }, {} as { [key: string]: string });
}

export async function getScripts(integration: string) {
  const { data: data1 } = await octokit.repos.getContent({
    owner,
    repo,
    path: `packages/pieces/community/${integration}/package.json`,
  });

  if (Array.isArray(data1) || data1.type !== "file") {
    throw new Error("Invalid integration folder structure");
  }

  const { content } = data1;

  const packages = JSON.parse(Buffer.from(content, "base64").toString("utf8"));
  const dependencies = removeDependencies(packages, "activepieces");
  console.log(packages);
  console.log(dependencies);

  // actions
  const { data: data2 } = await octokit.repos.getContent({
    owner,
    repo,
    path: `packages/pieces/community/${integration}/src/lib/actions`,
  });

  if (!Array.isArray(data2)) {
    throw new Error("Invalid integration folder structure");
  }

  console.log("data2: ", data2)

  const actionIds = data2
    .map((d) => d.name);

  console.log("actionIds: ", actionIds)

  const actions: {
    id: string;
    name: string | undefined;
    description: string | undefined;
  }[] = [];

  for (const actionId of actionIds) {
    let data;
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: `packages/pieces/community/${integration}/src/lib/actions/${actionId}`,
    });
      data = response.data;
    if (Array.isArray(data) || data.type !== "file") {
      continue;
    }

    const { content } = data;
    const code = Buffer.from(content, "base64").toString("utf8");

    console.log(code);

    const match = code.match(/displayName: '(.+)'/);
    const name = match?.[1];
    const match2 = code.match(/description: '(.+)'/);
    const description = match2?.[1];

    actions.push({
      name: name,
      description: description,
      id: actionId,
    });
  }

  console.log(actions);
 

  // triggers
  

  return packages
}

// getNewIntegrations(10).then(integrations => console.log(integrations));
getScripts("claude").then(packages => packages);

// go into src/lib/
// find all the files that are *.ts
//
