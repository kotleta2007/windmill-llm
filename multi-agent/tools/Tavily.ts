import { searchAndGetLinks } from "../../tavily-request";
import { crawlAndExtractApiEndpoints } from "../../api-web-crawler";

export const Tavily = {
  search: async function (query: string) {
    console.log(`Tavily search called with query: ${query}`);
    try {
      const links = await searchAndGetLinks(query);
      console.log("Crawling links for API endpoints...");
      const endpointMap = await crawlAndExtractApiEndpoints(links);

      let result = `Search results for query: ${query}\n\n`;

      for (const [link, endpoints] of endpointMap) {
        result += `Endpoints found in ${link}:\n`;
        endpoints.forEach((endpoint) => {
          result += `  ${endpoint.method} ${endpoint.path}\n`;
        });
        result += "\n";
      }

      return result;
    } catch (error) {
      console.error("Error in Tavily search:", error);
      return `Error occurred during search: ${error.message}`;
    }
  },
};
