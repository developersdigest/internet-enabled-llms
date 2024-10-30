# LLM-Powered Web Scraping and Context API

This API provides a powerful and flexible solution for web data extraction and LLM-powered question answering. It uses multiple integrations, including Firecrawl, OpenAI, Not Diamond, and Serper, to collect, process, and provide relevant information from web pages, enhancing user queries with contextual data. 

## Getting Started

### Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/developersdigest/internet-enabled-llms.git
   cd internet-enabled-llms
   ```
2. Install dependencies:
   ```sh
   bun install
   ```
3. Create a `.env` file in the root directory and add your API keys:
   ```env
   FIRECRAWL_API_KEY=your_firecrawl_api_key
   NOTDIAMOND_API_KEY=your_notdiamond_api_key
   OPENAI_API_KEY=your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   GOOGLE_API_KEY=your_google_api_key
   SERPER_API_KEY=your_serper_api_key
   ```

### Running the Server
To start the server, run:
```sh
bun dev
```
This will start the server in development mode using Next.js.

## Environment Variables
The API requires the following environment variables:
- `FIRECRAWL_API_KEY` - Firecrawl API key for web scraping.
- `NOTDIAMOND_API_KEY` - NotDiamond API key for LLM handling.
- `OPENAI_API_KEY` - OpenAI API key for embeddings and LLMs.
- `ANTHROPIC_API_KEY` - Anthropic API key for LLMs.
- `GOOGLE_API_KEY` - Google API key for LLMs.
- `SERPER_API_KEY` - Serper API key for web search.

## Endpoints

### POST Request
- **URL**: `/api/llm/`
- **Method**: `POST`
- **Description**: Processes a user message, searches for relevant pages, scrapes the content, optionally uses embeddings, and then provides an LLM-powered response.

#### Request Body
The request body should be in JSON format with the following fields:
- `message` (string, required): The user query.
- `pagesToCrawl` (number, optional): Number of pages to crawl for context (default is 3, max is 10).
- `skipEmbeddings` (boolean, optional): If `true`, embeddings are skipped and raw content is processed instead.

Example:
```json
{
  "message": "When did chatgpt canvas come out?",
  "pagesToCrawl": 5,
  "skipEmbeddings": false
}
```

#### Response
The response is in JSON format and includes:
- `answer` (string): The generated response from the LLM.
- `selectedModel` (object): Details about the model used.
- `crawlInfo` (object): Information about the crawling and embedding process.
- `sources` (array): A list of sources that were used to generate the response.

Example Response:
```json
{
  "answer": "ChatGPT Canvas came out on October 3, 2024.",
  "selectedModel": {
    "provider": "openai",
    "model": "gpt-4o-mini"
  },
  "crawlInfo": {
    "requestedPages": 5,
    "actualPagesCrawled": 4,
    "embeddingsUsed": true
  },
  "sources": [
    {
      "title": "ChatGPT Canvas Release Date",
      "url": "https://example.com/chatgpt-canvas-release"
    }
  ]
}
```

## Detailed Flow
1. **Request Parsing**: Extract the user query and validate the request.
2. **Web Search & Filtering**: Search using Serper and filter out unsupported domains (e.g., social media).
3. **Scraping & Content Processing**: Scrape relevant content from filtered URLs and optionally create embeddings.
4. **LLM Query Handling**: Generate an answer using one of the LLMs (OpenAI, Anthropic, or Gemini).
5. **Return the Response**: Send the answer along with source and model information.

## License
This project is licensed under the MIT License.

