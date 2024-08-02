export const actionExample = `
import { Octokit } from "https://cdn.skypack.dev/@octokit/rest";

/**
 * @param owner The account owner of the repository. The name is not case sensitive.
 *
 * @param repo The name of the repository. The name is not case sensitive.
 */
type Github = {
  token: string;
};
export async function main(gh_auth: Github, owner: string, repo: string) {
  const octokit = new Octokit({ auth: gh_auth.token });

  return await octokit.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
    },
  });
}
`;

export const triggerExample = `
import { getState, setState } from "windmill-client@1";

type Bitbucket = {
  username: string;
  password: string;
};

export async function main(
  bitbucket: Bitbucket,
  workspace: string,
  repo: string,
  branch: string
) {
  const lastChecked: number = (await getState()) || 0;

  const response = await fetch(
    \`https://api.bitbucket.org/2.0/repositories/\${workspace}/\${repo}/commits?pagelen=100&include=\${branch}\`,
    {
      headers: {
        Authorization:
        "Basic " +
          Buffer.from(bitbucket.username + ":" + bitbucket.password).toString(
            "base64"
          ),
      },
    }
  );
const data = await response.json();
if (!response.ok) {
  throw new Error(data.error.message);
}
const newCommits = [];
for (const commit of data?.values || []) {
  if (new Date(commit.date).getTime() > lastChecked) {
    newCommits.push(commit);
  } else {
    break;
  }
}

if (newCommits.length > 0) {
  await setState(new Date(newCommits[0].date).getTime());
}

return newCommits;
}
`;
