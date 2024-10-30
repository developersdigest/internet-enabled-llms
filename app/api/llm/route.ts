// 1. Import necessary modules and dependencies
import { NextResponse } from 'next/server';
import FirecrawlApp from '@mendable/firecrawl-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { NotDiamond } from 'notdiamond';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import dotenv from 'dotenv';

dotenv.config();

// 2. Initialize environment variables
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const NOTDIAMOND_API_KEY = process.env.NOTDIAMOND_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// 3. Validate environment variables
if (!FIRECRAWL_API_KEY || !NOTDIAMOND_API_KEY || !OPENAI_API_KEY || !ANTHROPIC_API_KEY || !GOOGLE_API_KEY || !SERPER_API_KEY) {
    throw new Error('One or more environment variables are not defined');
}

// 4. Initialize service clients
const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });
const notDiamond = new NotDiamond({
    apiKey: NOTDIAMOND_API_KEY,
    llmKeys: {
        openai: OPENAI_API_KEY,
        anthropic: ANTHROPIC_API_KEY,
        google: GOOGLE_API_KEY,
    },
});
const embeddings = new OpenAIEmbeddings({ apiKey: OPENAI_API_KEY });

// 5. Define TypeScript interfaces
interface RequestBody {
    message: string;
    pagesToCrawl?: number;
    skipEmbeddings?: boolean;
}

interface ScrapedPage {
    url: string;
    title: string;
    content: string;
}

interface FirecrawlDocument {
    markdown?: string;
    metadata?: {
        sourceURL?: string;
        statusCode?: number;
    };
}

interface SearchResult {
    title: string;
    link: string;
    favicon: string;
}

interface LLMResponse {
    content: string;
    providers: {
        provider: string;
        model: string;
    }[];
}

// 6. Implement search functionality
async function serperSearch(
    message: string,
    numberOfPagesToScan = 3
): Promise<SearchResult[]> {
    const url = 'https://google.serper.dev/search';
    const data = JSON.stringify({ q: message });

    try {
        // 7. Make API request to Serper
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'X-API-KEY': SERPER_API_KEY || '',
                'Content-Type': 'application/json',
            },
            body: data,
        });

        if (!response.ok) {
            console.error(`Serper API error: ${response.status} ${response.statusText}`);
            throw new Error(`Serper API error: ${response.status}`);
        }

        const responseData = (await response.json()) as { organic: any[] };

        // 8. Process and return search results
        return responseData.organic
            .slice(0, numberOfPagesToScan)
            .map((result: any): SearchResult => ({
                title: result.title || 'No Title',
                link: result.link,
                favicon: result.favicons?.[0] || '',
            }));
    } catch (error) {
        console.error('Serper search error:', error);
        throw error;
    }
}

// 9. Implement URL scraping functionality
async function mapAndScrapeUrls(
    message: string,
    pagesToCrawl: number
): Promise<ScrapedPage[]> {
    try {
        console.log('Starting search for:', message);
        const searchResults = await serperSearch(message, pagesToCrawl);
        console.log('Search results:', searchResults);

        const urls = searchResults.map((result) => result.link);
        console.log('URLs to scrape:', urls);

        // 10. Define and filter unsupported domains
        const unsupportedDomains = [
            'twitter.com',
            'x.com',
            'facebook.com',
            'fb.com',
            'instagram.com',
            'linkedin.com',
            'tiktok.com',
            'youtube.com',
            'reddit.com',
            'threads.net',
            'pinterest.com',
            'tumblr.com',
            'snapchat.com',
        ];

        const filteredUrls = urls.filter((url) => {
            const lowerUrl = url.toLowerCase();
            return !unsupportedDomains.some((domain) => lowerUrl.includes(domain));
        });

        if (filteredUrls.length === 0) {
            console.log('No valid URLs after filtering');
            return [
                {
                    url: 'No valid URLs',
                    title: 'No Results',
                    content: 'Unable to find non-social media content for this query.',
                },
            ];
        }

        // 11. Scrape filtered URLs
        console.log('Starting Firecrawl scrape for URLs:', filteredUrls);
        const scrapedData = await firecrawl.batchScrapeUrls(filteredUrls, {
            formats: ['markdown'],
        });
        console.log('Firecrawl response:', scrapedData);

        if (!scrapedData.success || !scrapedData.data) {
            console.error('Firecrawl scraping failed:', scrapedData);
            return [
                {
                    url: 'Scraping failed',
                    title: 'Error',
                    content: 'Failed to scrape content from the provided URLs.',
                },
            ];
        }

        // 12. Process and return scraped data
        return scrapedData.data
            .filter((doc) => doc.metadata?.sourceURL && doc.markdown)
            .map((doc: FirecrawlDocument) => ({
                url: doc.metadata?.sourceURL || 'URL not available',
                title: doc.metadata?.sourceURL?.split('/').pop() || 'Title not available',
                content: doc.markdown || 'Content not available',
            }));
    } catch (error) {
        console.error('Error in mapAndScrapeUrls:', error);
        throw error;
    }
}

// 13. Process content with embeddings
async function processWithEmbeddings(
    scrapedPages: ScrapedPage[],
    textChunkSize: number,
    textChunkOverlap: number
): Promise<MemoryVectorStore> {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: textChunkSize,
        chunkOverlap: textChunkOverlap,
    });

    // 14. Process each page and create embeddings
    const processedContent = await Promise.all(
        scrapedPages.map(async (page) => {
            const splitText = await splitter.splitText(page.content);
            return await MemoryVectorStore.fromTexts(
                splitText,
                { url: page.url, title: page.title },
                embeddings
            );
        })
    );

    // 15. Combine vector stores
    const vectorStore = processedContent[0];
    for (let i = 1; i < processedContent.length; i++) {
        const currentStore = processedContent[i] as MemoryVectorStore;
        const vectors = (currentStore as any).memoryVectors as number[][];
        const metadatas = (currentStore as any).metadatas as any[];

        if (Array.isArray(vectors) && vectors.every((v) => Array.isArray(v))) {
            await vectorStore.addVectors(vectors, metadatas);
        }
    }

    return vectorStore;
}

// 16. Process direct context without embeddings
function processDirectContext(scrapedPages: ScrapedPage[]): string {
    return scrapedPages.map(page => `Page: ${page.title}\nURL: ${page.url}\nContent:\n${page.content}\n-------------------`.trim()).join('\n\n');
}

// 17. Generate LLM response
async function generateLLMResponse(
    context: string | any[],
    message: string
): Promise<LLMResponse> {
    const systemMessage =
        typeof context === 'string'
            ? `Answer based on the following pages of content: ${context}`
            : `Answer based on the following relevant excerpts: ${JSON.stringify(context)}`;

    const result = await notDiamond.create({
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: message },
        ],
        llmProviders: [
            { provider: 'openai', model: 'gpt-4o-mini' },
            { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' },
            { provider: 'google', model: 'gemini-1.5-pro-latest' },
        ],
        tradeoff: 'cost',
    });

    if (!result) {
        throw new Error('Failed to generate LLM response');
    }
    console.log('Results from Not Diamond', result)
    return {
        content: result.content,
        providers: result.providers
    };
}

// 18. Main API route handler
export async function POST(request: Request) {
    try {
        console.log('Received request');

        // 19. Parse and validate request body
        const {
            message,
            pagesToCrawl = 3,
            skipEmbeddings = false,
        }: RequestBody = await request.json();

        // 20. Validate required fields
        if (!message) {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        // 21. Log request parameters
        console.log('Processing request with params:', {
            message,
            pagesToCrawl,
            skipEmbeddings,
        });

        const validatedPagesToCrawl = Math.min(Math.max(1, pagesToCrawl), 10);

        let context: string | any[] = [];
        let sources: any[] = [];

        // 22. Scrape and process pages
        const scrapedPages: ScrapedPage[] = await mapAndScrapeUrls(
            message,
            validatedPagesToCrawl
        );
        console.log('Scraped pages:', scrapedPages);

        sources = scrapedPages.map((page) => ({
            title: page.title,
            url: page.url,
        }));

        // 23. Process context based on embedding preference
        if (skipEmbeddings) {
            context = processDirectContext(scrapedPages);
        } else {
            const vectorStore = await processWithEmbeddings(
                scrapedPages,
                800, // textChunkSize
                200  // textChunkOverlap
            );
            context = await vectorStore.similaritySearch(
                message,
                2 // numberOfSimilarityResults
            );
        }

        console.log('Generated context:', context);

        // 24. Generate and validate LLM response
        const result = await generateLLMResponse(context, message);
        console.log('LLM response:', result);

        if (!result || 'detail' in result) {
            const errorDetail =
                result && typeof result.detail === 'string'
                    ? result.detail
                    : 'Unknown error occurred';
            throw new Error(errorDetail);
        }

        // 25. Prepare response
        const response: any = {
            answer: result.content,
            selectedModel: result.providers[0],
            crawlInfo: {
                requestedPages: pagesToCrawl,
                actualPagesCrawled: sources.length,
                embeddingsUsed: !skipEmbeddings,
            },
        };

        // 26. Optionally include sources
        response.sources = sources;

        console.log('Sending response:', response);
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error processing request:', error);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}
