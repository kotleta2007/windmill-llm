import { fetch } from 'bun';
import * as cheerio from 'cheerio';
import { searchAndGetLinks } from './tavily-request';

interface ApiEndpoint {
  method: string;
  path: string;
  description?: string;
}

async function fetchContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return '';
  }
}

function extractApiEndpoints(content: string): ApiEndpoint[] {
  const $ = cheerio.load(content);
  const endpoints: ApiEndpoint[] = [];

  // Look for common patterns in API documentation
  $('pre, code, table').each((_, element) => {
    const text = $(element).text();
    
    // Simple regex to match potential API endpoints
    // This regex looks for HTTP methods followed by a path
    const matches = text.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[\w\/\-{}]+)/g);
    
    if (matches) {
      matches.forEach(match => {
        const [method, path] = match.split(/\s+/);
        endpoints.push({ method, path });
      });
    }
  });

  return endpoints;
}

export async function crawlAndExtractApiEndpoints(links: string[]): Promise<Map<string, ApiEndpoint[]>> {
  const endpointMap = new Map<string, ApiEndpoint[]>();

  for (const link of links) {
    console.log(`Crawling: ${link}`);
    const content = await fetchContent(link);
    if (content) {
      const endpoints = extractApiEndpoints(content);
      if (endpoints.length > 0) {
        endpointMap.set(link, endpoints);
      }
    }
  }

  return endpointMap;
}

// Example usage in main function
async function main() {
  try {
    const query = 'Clarifai API endpoints';
    const links = await searchAndGetLinks(query);
    console.log('Crawling links for API endpoints...');
    const endpointMap = await crawlAndExtractApiEndpoints(links);

    for (const [link, endpoints] of endpointMap) {
      console.log(`\nEndpoints found in ${link}:`);
      endpoints.forEach(endpoint => {
        console.log(`  ${endpoint.method} ${endpoint.path}`);
      });
    }
  } catch (error) {
    console.error('Error in main:', error);
  }
}

// Run the main function
main();
