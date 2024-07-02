import { fetch } from 'bun';

interface SearchParams {
  api_key: string;
  query: string;
  search_depth: 'basic' | 'advanced';
  include_answer: boolean;
  include_images: boolean;
  include_raw_content: boolean;
  max_results: number;
  include_domains: string[];
  exclude_domains: string[];
}

interface SearchResult {
  title: string;
  url: string;
  content: string;
  raw_content: string;
  score: number;
}

interface SearchResponse {
  answer: string;
  query: string;
  response_time: string;
  follow_up_questions: string[];
  images: string[];
  results: SearchResult[];
}

async function tavifySearch(params: SearchParams): Promise<SearchResponse> {
  const url = 'https://api.tavily.com/search';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: SearchResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error during Tavily search:', error);
    throw error;
  }
}

export async function searchAndGetLinks(query: string): Promise<string[]> {
  try {
    const result = await tavifySearch({
      api_key: process.env.TAVILY_API_KEY ?? '',
      query: query,
      search_depth: 'basic',
      include_answer: false,
      include_images: false,
      include_raw_content: false,
      max_results: 10,
      include_domains: [],
      exclude_domains: []
    });

    // Extract only the links
    return result.results.map(item => item.url);
  } catch (error) {
    console.error('Error in searchAndGetLinks:', error);
    throw error;
  }
}

// New main function that calls searchAndGetLinks
async function main() {
  try {
    const query = 'Clarifai API endpoints';
    const links = await searchAndGetLinks(query);
    console.log('Relevant article links:');
    links.forEach((link, index) => {
      console.log(`${index + 1}. ${link}`);
    });
  } catch (error) {
    console.error('Error in main:', error);
  }
}

// Run the main function
main();
