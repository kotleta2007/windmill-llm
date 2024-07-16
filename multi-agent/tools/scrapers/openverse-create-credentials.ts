interface RegisterResponse {
  name: string;
  client_id: string;
  client_secret: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function registerForApiKey(
  name: string,
  description: string,
  email: string,
): Promise<RegisterResponse> {
  const response = await fetch(
    "https://api.openverse.org/v1/auth_tokens/register/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        email,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return (await response.json()) as RegisterResponse;
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  const response = await fetch(
    "https://api.openverse.org/v1/auth_tokens/token/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return (await response.json()) as TokenResponse;
}

// Usage example
async function main() {
  try {
    // Register for API key
    console.log("Registering for API key...");
    const registerResponse = await registerForApiKey(
      "Windmill LLM",
      "Try out the Openverse API for generating scripts",
      "mark.tropin@epfl.ch",
    );
    console.log("Registration successful:", registerResponse);

    // Get access token
    console.log("Getting access token...");
    const tokenResponse = await getAccessToken(
      registerResponse.client_id,
      registerResponse.client_secret,
    );
    console.log("Access token received:", tokenResponse);

    // You can now use tokenResponse.access_token for authenticated requests
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
