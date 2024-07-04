export class TavilyAPI {
  static async search(query: string): Promise<string> {
    console.log(`Searching Tavily for: ${query}`);
    return `
      ${query} - Additional Information:
      1. The API requires authentication using a bearer token.
      2. User data is paginated, with a default page size of 20.
      3. Available endpoints: /users, /users/{id}, /users/{id}/posts
    `;
  }
}
