import { Browser, Page, firefox } from "playwright";
import * as cheerio from "cheerio";
import { searchAndGetLinks } from "./tavily-request";
import { load } from "cheerio";
import { ChatAnthropic } from "@langchain/anthropic";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";

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

function extractTextContent(content: string): string {
  const $ = load(content);

  // Function to recursively extract text
  function getText(node: cheerio.Element): string {
    if (node.type === "text") {
      return $(node).text().trim();
    }

    if (node.type === "tag") {
      const children = $(node).contents().toArray();
      return children.map(getText).join("\n");
    }

    return "";
  }

  return $("body").contents().toArray().map(getText).join("\n").trim();
}

async function extractApiEndpoints(content: string): Promise<ApiEndpoint[]> {
  // Extract text content from HTML
  const textContent = extractTextContent(content);

  // Define the output schema
  const parser = StructuredOutputParser.fromZodSchema(
    z.array(
      z.object({
        method: z.string(),
        path: z.string(),
        description: z.string().optional(),
      }),
    ),
  );

  // Create a prompt template
  const prompt = new PromptTemplate({
    template: `Extract API endpoints from the following text. Identify the HTTP method, path, and optional description for each endpoint.

Text content:
{text}

{format_instructions}

API Endpoints:`,
    inputVariables: ["text"],
    partialVariables: { format_instructions: parser.getFormatInstructions() },
  });

  // Initialize the Anthropic model
  const model = new ChatAnthropic({
    modelName: "claude-3-5-sonnet-20240620",
    temperature: 0,
  });

  // Generate the structured output
  const input = await prompt.format({ text: textContent });
  const response = await model.invoke(input);

  // Parse the response
  const result = await parser.parse(response.content);

  return result;
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
        const endpoints = await extractApiEndpoints(content);
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

main();
