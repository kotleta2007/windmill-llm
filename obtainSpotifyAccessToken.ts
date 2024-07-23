import { serve } from "bun";
import { stringify } from "querystring";
import { readFileSync, writeFileSync } from "fs";

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = "http://localhost:3000/callback";

function generateRandomString(length: number): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () =>
    possible.charAt(Math.floor(Math.random() * possible.length)),
  ).join("");
}

function updateEnvFile(newToken: string) {
  const envPath = ".env";
  let envContent = readFileSync(envPath, "utf-8");
  const lines = envContent.split("\n");
  let tokenUpdated = false;

  const updatedLines = lines.map((line) => {
    if (line.startsWith("SPOTIFY_ACCESS_TOKEN=")) {
      tokenUpdated = true;
      return `# ${line}\nSPOTIFY_ACCESS_TOKEN=${newToken}`;
    }
    return line;
  });

  if (!tokenUpdated) {
    updatedLines.push(`SPOTIFY_ACCESS_TOKEN=${newToken}`);
  }

  writeFileSync(envPath, updatedLines.join("\n"));
}

const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/login") {
      const state = generateRandomString(16);
      const scope = `user-read-playback-state user-modify-playback-state user-read-currently-playing app-remote-control streaming playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-read-private user-read-email`;
      // const scope = `ugc-image-upload user-read-playback-state user-modify-playback-state user-read-currently-playing app-remote-control streaming playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-follow-modify user-follow-read user-read-playback-position user-top-read user-read-recently-played user-library-modify user-library-read user-read-email user-read-private user-soa-link user-soa-unlink soa-manage-entitlements soa-manage-partner soa-create-partner`;
      // const scope = "user-read-private user-read-email";

      const authorizationUrl =
        "https://accounts.spotify.com/authorize?" +
        stringify({
          response_type: "code",
          client_id: client_id,
          scope: scope,
          redirect_uri: redirect_uri,
          state: state,
        });

      return new Response(null, {
        status: 302,
        headers: { Location: authorizationUrl },
      });
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code") || null;
      const state = url.searchParams.get("state") || null;

      if (state === null) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/#" + stringify({ error: "state_mismatch" }) },
        });
      } else {
        const authOptions = {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            Authorization:
              "Basic " +
              Buffer.from(client_id + ":" + client_secret).toString("base64"),
          },
          body: new URLSearchParams({
            code: code || "",
            redirect_uri: redirect_uri,
            grant_type: "authorization_code",
          }),
        };

        try {
          const response = await fetch(
            "https://accounts.spotify.com/api/token",
            authOptions,
          );
          const data = await response.json();

          if (data.access_token) {
            updateEnvFile(data.access_token);
            return new Response("Access token updated in .env file", {
              status: 200,
            });
          } else {
            return new Response("No access token received", { status: 400 });
          }
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch token" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Listening on http://localhost:${server.port}`);
console.log(`Navigate your browser to http://localhost:${server.port}/login`);
