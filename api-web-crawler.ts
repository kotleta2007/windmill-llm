import { Browser, Page, firefox } from "playwright";
import * as cheerio from "cheerio";
import { searchAndGetLinks } from "./tavily-request";

interface ApiEndpoint {
  method: string;
  path: string;
  description?: string;
}

async function fetchContent(page: Page, url: string): Promise<string> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    return await page.content();
  } catch (error) {
    console.error(`Error in fetchContent for ${url}:`, error);
    return "";
  }
}

function extractApiEndpoints(content: string): ApiEndpoint[] {
  const $ = cheerio.load(content);
  const endpoints: ApiEndpoint[] = [];

  $(
    'span.IssueLabel:contains("get"), span.IssueLabel:contains("post"), span.IssueLabel:contains("put"), span.IssueLabel:contains("delete"), span.IssueLabel:contains("patch")',
  ).each((_, element) => {
    const methodElement = $(element);
    const pathElement = methodElement.next("span");

    if (pathElement.length) {
      const method = methodElement.text().trim().toUpperCase();
      const path = pathElement.text().trim();

      if (method && path) {
        endpoints.push({ method, path });
      }
    }
  });

  $("pre, code, table").each((_, element) => {
    const text = $(element).text();
    const matches = text.match(
      /\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[\w\/\-{}]+)/g,
    );

    if (matches) {
      matches.forEach((match) => {
        const [method, path] = match.split(/\s+/);
        endpoints.push({ method, path });
      });
    }
  });

  return Array.from(new Set(endpoints.map(JSON.stringify))).map(JSON.parse);
}

export async function crawlAndExtractApiEndpoints(
  links: string[],
): Promise<Map<string, ApiEndpoint[]>> {
  const endpointMap = new Map<string, ApiEndpoint[]>();
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await firefox.launch({ timeout: 30000 });
    page = await browser.newPage();

    for (const link of links) {
      const content = await fetchContent(page, link);
      if (content) {
        const endpoints = extractApiEndpoints(content);
        if (endpoints.length > 0) {
          endpointMap.set(link, endpoints);
        }
      }
    }
  } catch (error) {
    console.error("Error in crawlAndExtractApiEndpoints:", error);
  } finally {
    if (page) await page.close().catch(console.error);
    if (browser) await browser.close().catch(console.error);
  }

  return endpointMap;
}

async function main() {
  try {
    const query = "Github API endpoints";
    const links = await searchAndGetLinks(query);
    const endpointMap = await crawlAndExtractApiEndpoints(links);

    for (const [link, endpoints] of endpointMap) {
      console.log(`\nEndpoints found in ${link}:`);
      endpoints.forEach((endpoint) => {
        console.log(`  ${endpoint.method} ${endpoint.path}`);
      });
    }
  } catch (error) {
    console.error("Error in main:", error);
  }
}

// main();
