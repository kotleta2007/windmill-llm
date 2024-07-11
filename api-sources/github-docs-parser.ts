import { load } from 'cheerio';
import axios from 'axios';

async function getEndpointInfo(url: string): Promise<{
  description: string;
  baseUrl: string;
  requestType: string;
  endpoint: string;
  examples: string[];
}> {
  try {
    const response = await axios.get(url);
    const $ = load(response.data);

    // Extract the endpoint description
    const description = $('article p').first().text().trim();

    // Extract the base URL
    const baseUrl = url.split('?')[0];

    // Extract the request type
    const requestType = url.split('?')[1].split('=')[1];

    // Extract the endpoint
    const endpoint = url.split('/').slice(-1)[0].split('?')[0];

    // Extract the usage examples
    const examples = $('pre.highlight').map((_, el) => $(el).text().trim()).get();

    return {
      description,
      baseUrl,
      requestType,
      endpoint,
      examples,
    };
  } catch (error) {
    console.error('Error fetching endpoint information:', error);
    throw error;
  }
}

const url = 'https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28';
getEndpointInfo(url)
  .then((endpointInfo) => {
    console.log(endpointInfo);
  })
  .catch((error) => {
    console.error(error);
  });
