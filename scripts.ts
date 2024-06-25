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
  // Check if the integration has any dependencies
  if (!obj.dependencies) {
    return [];
  }  
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
  // console.log(packages);
  // console.log(dependencies);

  // actions
  const { data: data2 } = await octokit.repos.getContent({
    owner,
    repo,
    path: `packages/pieces/community/${integration}/src/lib/actions`,
  });

  if (!Array.isArray(data2)) {
    throw new Error("Invalid integration folder structure");
  }

  // console.log("data2: ", data2)

  const actionIds = data2
    .filter((d) => d.name !== "helpers.ts")
    .map((d) => d.name);

  // console.log("actionIds: ", actionIds)

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

    // console.log(code);

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

  // console.log(actions);
 
  // triggers
  let data3;

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: `packages/pieces/community/${integration}/src/lib/triggers`,
    });
    data3 = response.data;
  } catch (error) {
    console.log("No triggers found.")
    // console.error("Error fetching repository content:", error.message);
    return { actions, triggers: [], dependencies };
  }

  if (!Array.isArray(data3)) {
    throw new Error("Invalid integration folder structure");
  }

  // console.log("data3: ", data3)

  const triggerIds = data3
    .filter((d) => d.name !== "helpers.ts")
    .map((d) => d.name);

  // console.log("triggerIds: ", triggerIds)

  const triggers: {
    id: string;
    name: string | undefined;
    description: string | undefined;
  }[] = [];

  for (const triggerId of triggerIds) {
    let data;
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: `packages/pieces/community/${integration}/src/lib/triggers/${triggerId}`,
    });
      data = response.data;
    if (Array.isArray(data) || data.type !== "file") {
      continue;
    }

    const { content } = data;
    const code = Buffer.from(content, "base64").toString("utf8");

    const match = code.match(/displayName: '(.+)'/);
    const name = match?.[1];
    const match2 = code.match(/description: '(.+)'/);
    const description = match2?.[1];

    triggers.push({
      name: name,
      description: description,
      id: triggerId,
    });
  }

  return { actions, triggers, dependencies }
}

// getNewIntegrations(10).then(integrations => console.log(integrations));
// getScripts("claude").then(packages => packages);
// getScripts("google-sheets");
// console.log(await getScripts("google-sheets"));
// console.log(await getScripts("claude"));
// console.log(await getScripts("beamer"));
console.log(await getScripts("binance"));


// export async function writePrompts(
//   integration: string,
//   ignoreActions: boolean,
//   existingPrompts: Prompts | undefined
// ) {
//   console.log("Generating prompts for " + integration);
//   try {
//     const { actions, triggers, dependencies } = await getScripts(integration);
//     await mkdir("hub/" + integration + "/scripts", { recursive: true });
//     await Bun.write(
//       "hub/" + integration + "/scripts/prompts.json",
//       JSON.stringify(
//         {
//           actions: actions.map((a) => ({
//             ...a,
//             ignore: ignoreActions,
//             ...existingPrompts?.actions?.find((a2) => a.id === a2.id),
//           })),
//           triggers: triggers.map((t) => ({
//             ...t,
//             ignore: false,
//             ...existingPrompts?.triggers?.find((t2) => t.id === t2.id),
//           })),
//           dependencies: existingPrompts?.dependencies ?? dependencies,
//           useFetch: existingPrompts?.useFetch ?? false,
//         },
//         null,
//         2
//       )
//     );
//     return true;
//   } catch (err) {
//     console.error(
//       "Could not get actions instructions for " +
//         integration +
//         "\nYou will have to create scripts manually " +
//         err
//     );
//     return false;
//   }
// }
