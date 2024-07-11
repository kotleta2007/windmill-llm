import { Octokit } from "@octokit/core";

type APIEntry = {
  category: string;
  [key: string]: string;
};

function parseMarkdownLink(linkText: string): { name: string; url: string } {
  const match = linkText.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (match) {
    return { name: match[1], url: match[2] };
  }
  return { name: linkText, url: '' };
}

function parseMarkdownTables(content: string): APIEntry[][] {
  const tables: APIEntry[][] = [];
  const headerTableRegex = /###\s+([^#\n]+)\s*\n+(\|?\s*API\s*\|\s*Description\s*\|\s*Auth\s*\|\s*HTTPS\s*\|\s*CORS\s*(?:\|\s*(?:Call this API|Postman|Run in Postman)\s*)?\|?)\s*\n\|?[-:\s|]+\n((?:\|?.+\|.+\|.+\|.+\|.+(?:\|.+)?\|?\n)+)/g;

  let match;
  while ((match = headerTableRegex.exec(content)) !== null) {
    const category = match[1].trim();
    const headerRow = match[2].trim().split('|').map(h => h.trim()).filter(Boolean);
    const rows = match[3].trim().split('\n');

    const parsedTable: APIEntry[] = rows.map(row => {
      const cells = row.split('|').map(cell => cell.trim()).filter(Boolean);
      if (cells.length < 5) return null; // Skip rows with insufficient columns

      const entry: APIEntry = { category };

      headerRow.forEach((header, index) => {
        if (index === 0) {
          const { name, url } = parseMarkdownLink(cells[index]);
          entry[`${header}Name`] = name;
          entry[`${header}URL`] = url;
        } else {
          entry[header] = cells[index] || '';
        }
      });

      return entry;
    }).filter((entry): entry is APIEntry => entry !== null);

    if (parsedTable.length > 0) {
      tables.push(parsedTable);
    }
  }

  return tables;
}

async function getReadmeContent(): Promise<string> {
  const octokit = new Octokit();

  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/readme', {
      owner: 'public-apis',
      repo: 'public-apis',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    const decodedContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return decodedContent;
  } catch (error) {
    console.error('Error fetching README:', error);
    throw error;
  }
}

async function getAPITables(): Promise<APIEntry[][]> {
  try {
    const readmeContent = await getReadmeContent();
    return parseMarkdownTables(readmeContent);
  } catch (error) {
    console.error('Error getting API tables:', error);
    throw error;
  }
}

// Main execution
getAPITables().then(tables => {
  console.log('Number of tables found:', tables.length);

  for (let i = 0; i < tables.length; i++) {
    console.log(`\nTable ${i + 1} (${tables[i][0].category}):`);
    const table = tables[i];
    const entriesToShow = Math.min(3, table.length);

    for (let j = 0; j < entriesToShow; j++) {
      console.log(`Entry ${j + 1}:`, table[j]);
    }

    if (table.length > 3) {
      console.log(`... and ${table.length - 3} more entries`);
    }
  }
}).catch(error => {
  console.error('Error:', error);
});
