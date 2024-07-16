// Function to get access token
async function getAccessToken(): Promise<string> {
  const clientId = process.env.OPENVERSE_CLIENT_ID;
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "OPENVERSE_CLIENT_ID or OPENVERSE_CLIENT_SECRET is not set in environment variables",
    );
  }

  const response = await fetch(
    "https://api.openverse.org/v1/auth_tokens/token/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to get access token. HTTP error! status: ${response.status}`,
    );
  }

  const data = await response.json();
  return data.access_token;
}

// Function to search for images
async function searchImages(
  query: string,
  page: number = 1,
  pageSize: number = 20,
) {
  try {
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.append("q", query);
    url.searchParams.append("page", page.toString());
    url.searchParams.append("page_size", pageSize.toString());

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error("Error searching images:", error);
    return [];
  }
}

// Function to get image details (this was already using fetch, so no changes needed)
async function getImageDetails(identifier: string) {
  try {
    const response = await fetch(
      `https://api.openverse.org/v1/images/${identifier}/`,
      {
        headers: {
          Authorization: `Bearer ${await getAccessToken()}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching image details:", error);
    return null;
  }
}

// Function to search for images with additional filters
async function searchImagesWithFilters(
  query: string,
  options: {
    page?: number;
    pageSize?: number;
    license?: string;
    category?: string;
    size?: string;
    source?: string[];
  },
) {
  try {
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.append("q", query);
    url.searchParams.append("page", (options.page || 1).toString());
    url.searchParams.append("page_size", (options.pageSize || 20).toString());
    if (options.license) url.searchParams.append("license", options.license);
    if (options.category) url.searchParams.append("category", options.category);
    if (options.size) url.searchParams.append("size", options.size);
    if (options.source)
      url.searchParams.append("source", options.source.join(","));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error("Error searching images with filters:", error);
    return [];
  }
}

// Function to get related images
async function getRelatedImages(identifier: string) {
  try {
    const response = await fetch(
      `https://api.openverse.org/v1/images/${identifier}/related/`,
      {
        headers: {
          Authorization: `Bearer ${await getAccessToken()}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error("Error fetching related images:", error);
    return [];
  }
}

async function main() {
  const query = "nature";
  const images = await searchImages(query);
  console.log(`Found ${images.length} images for query: ${query}`);

  for (const image of images) {
    console.log(`Fetching details for image: ${image.id}`);
    const imageDetails = await getImageDetails(image.id);
    console.log("Image details:", imageDetails);
  }

  // if (images.length > 0) {
  //   const firstImage = images[0];
  //   console.log(`Fetching details for image: ${firstImage.id}`);
  //   const imageDetails = await getImageDetails(firstImage.id);
  //   console.log("Image details:", imageDetails);

  //   console.log(`Fetching related images for image: ${firstImage.id}`);
  //   const relatedImages = await getRelatedImages(firstImage.id);
  //   console.log(`Found ${relatedImages.length} related images`);
  // }
}

main();
