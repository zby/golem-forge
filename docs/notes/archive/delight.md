Write

Sign in
Building Delight: A Multi-Provider AI Chrome Extension with Vercel AI SDK
Andrews Kwesi Ankomahene
Andrews Kwesi Ankomahene
12 min read
·
Sep 7, 2025

Press enter or click to view image in full size

How I built an intelligent Chrome extension that brings 6 major AI providers and 25+ models directly to your browser
The Problem: AI Fragmentation in the Browser

Every idea starts with a pain point. For me, it wasn’t just about tinkering with large language models as a software engineer (though I love experimenting with cutting-edge models like GPT-4, Claude, and Gemini).

As AI tools proliferated, I found myself constantly switching between different AI platforms — ChatGPT for conversations, Claude for analysis, Gemini for quick tasks and refined Google searches. Each required separate tabs, logins, and context switching. What if I could bring all these powerful AI models into a single, seamless browser experience?

The real spark came from watching my fiancé. She’s an executive assistant — which means her day is a whirlwind of scheduling meetings, drafting emails, chasing down details, handling flight plans and keeping everything organized. It’s high-stakes, detail-heavy work.

And I thought: why can’t she have an assistant for her assistant work?

That’s how Delight started — an AI-powered Chrome extension that provides instant access to 6 major AI providers with 25+ premium models, right from your browser’s sidepanel. Delight transforms how you interact with AI while browsing. Instead of juggling multiple AI platforms, you get:

    Multi-Provider AI Support: OpenAI, Anthropic, Google Gemini, Grok (X.AI), Groq, and SambaNova
    25+ AI Models: From GPT-4o to Claude 3.5 Sonnet to Llama 3.1 405B
    Smart Page Integration: Attach any webpage content to your AI conversations
    AI Writing Tools: 10 specialized, out-of-the-box tools for explaining, rewriting, and tone changes
    Persistent Chat History: Conversations that survive browser sessions

The Technical Foundation: Why Vercel AI SDK?

When designing Delight’s multi-provider architecture, I faced a fundamental challenge that extends far beyond simple API integration. Each AI provider implements their service differently — not just in terms of API endpoints and authentication methods, but in their core philosophical approaches to model interaction, error handling, and response streaming.

Consider the complexity matrix I was dealing with. OpenAI uses a REST-based approach with JSON payloads, but their streaming implementation requires server-sent events parsing. Anthropic’s Claude API has different rate limiting strategies and implements content filtering at the API level rather than in post-processing. Google’s Gemini uses a different token counting methodology, which affects how I calculate context windows. Groq optimizes for speed with different timeout expectations, while SambaNova focuses on specialized model architectures that require different parameter tuning approaches.

The naive solution would have been to implement each provider individually with custom integration logic scattered throughout the application. This approach would have created what software architects call “vendor lock-in debt” — where each new provider addition requires modifications across multiple system components, making the codebase increasingly fragile and difficult to maintain.

When building Delight, I needed a robust foundation for handling multiple AI providers and models with streaming responses. After evaluating several options, I chose Vercel AI SDK for several compelling reasons:

1. Unified Provider Interface

The abstraction layer that the AI SDK provides is more than a structural tweak — it enforces consistency across providers that were never designed to play nicely with one another. Normally, I would have to juggle subtle differences in payload schemas, endpoint URLs, and even authentication quirks. By wrapping these providers in a clean, uniform interface, the SDK allowed me to write integration code once and reuse it everywhere.

This not only reduced boilerplate but also insulated the rest of Delight’s system from changes in any single provider’s API. If OpenAI updates its endpoint tomorrow, my changes remain localized, rather than rippling through the whole codebase. The AI SDK’s provider abstraction was perfect for Delight’s multi-provider architecture:

// Clean, consistent interface across all providers
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

const providers = {
  openai: openai('gpt-4o'),
  anthropic: anthropic('claude-3–5-sonnet-20241022'),
  gemini: google('gemini-2.5-pro')
};

2. Streaming by Default

Real-time responses are crucial for a smooth user experience. Streaming isn’t just a UX flourish — it’s foundational for how modern AI applications feel. Without streaming, users are left waiting for a full response, which makes conversations feel clunky and slow.

The SDK’s design ensures that streaming is the default, not an afterthought, which means I didn’t need to reinvent the wheel with custom event parsing or WebSocket bridges. It provided a reliable, standardized way to consume tokens as they arrive, regardless of which provider I was using.

That let me focus on building Delight’s chat interface and real-time interaction patterns, rather than debugging stream interruptions or inconsistent token chunking logic. The AI SDK makes streaming effortless:

import { streamText } from 'ai';

const result = await streamText({
  model: selectedModel,
  messages: conversationHistory,
  onChunk: (chunk) => {
    // Real-time UI updates as tokens arrive
    updateChatInterface(chunk.textDelta);
  }
});

3. Built-in Error Handling

Working with multiple providers introduces not just complexity, but unpredictability. Each vendor enforces different rate limits, has its own error codes, and may even throttle or reject requests for reasons unique to their infrastructure. Manually handling all of this would have meant writing brittle, provider-specific error logic.

The SDK’s error handling primitives gave me a consistent way to detect, classify, and respond to errors without deeply coupling Delight’s logic to any one provider. That allowed me to build fallback strategies — like gracefully switching to a backup provider when one fails — in a way that was both elegant and reliable.

In practice, this meant Delight could guarantee continuity of service even during outages or provider hiccups:

try {
  const response = await streamText({
    model: currentProvider,
    messages: messages
  });
} catch (error) {
  // Graceful fallback to alternative provider
  await handleProviderError(error, fallbackProvider);
}

Architecture Deep Dive

AI Service Layer

Delight’s architecture centers around a flexible AI service layer that orchestrates multiple providers.

This service layer acts as the central traffic controller for Delight. By routing all interactions through a single sendMessage method, it enforces consistency across providers while keeping higher-level features like message history, token limits, and temperature tuning centralized. This means adding new functionality — like logging, caching, or usage metering — can happen in one place rather than across multiple integration points:

class AIService {
  private providers: Map<string, AIProvider> = new Map();
  
  async sendMessage(
    message: string, 
    provider: string, 
    model: string
  ): Promise<ReadableStream> {
    const aiProvider = this.providers.get(provider);
    
    return streamText({
      model: aiProvider.getModel(model),
      messages: this.buildMessageHistory(message),
      temperature: 0.7,
      maxTokens: 4000
    });
  }
}

Provider Implementations

Each AI provider is implemented as a clean abstraction.

Abstracting providers into a common AIProvider interface keeps the system flexible and future-proof. Each provider class encapsulates its quirks — model IDs, client initialization, and context window differences — behind a uniform contract. That way, swapping in a new provider or upgrading models is just a matter of extending the interface rather than rewriting core logic. This also makes testing and debugging easier since each provider can be mocked or validated independently:

interface AIProvider {
  name: string;
  models: AIModel[];
  createClient(apiKey: string): any;
  getModel(modelName: string): any;
}

class OpenAIProvider implements AIProvider {
  name = 'OpenAI';
  models = [
    { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextLength: 128000 }
  ];
  
  createClient(apiKey: string) {
    return openai({ apiKey });
  }
}

Chrome Extension Integration

The extension leverages Chrome’s sidepanel API for a native browser experience.
Get Andrews Kwesi Ankomahene’s stories in your inbox

Join Medium for free to get updates from this writer.

Using the Chrome sidepanel API provides a natural entry point for Delight within the browser, giving users a seamless, always-available workspace. The React-based sidepanel ensures UI consistency with the web version, while the shared AIService enables the same multi-provider logic to power both environments. This design also sets the stage for portability — the same architecture could later be extended to Electron apps, VS Code extensions, or mobile without rethinking the core:

// Background script
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Sidepanel integration
const initializeSidepanel = async () => {
  const aiService = new AIService();
  const chatInterface = new ChatInterface(aiService);
  
  // Mount React app in sidepanel
  ReactDOM.render(<DelightApp />, document.getElementById('root'));
};

Press enter or click to view image in full size
Delight in fullscreen mode
Key Features of Delight Powered by AI SDK

1. Smart Page Attachment

One of Delight’s standout features is letting users bring live webpage context directly into the chat. Instead of manually copying and pasting, the system automatically extracts the title, URL, and main text, then enriches the user’s query with that context.

The enriched message pattern shown here creates a structured prompt that gives the AI model clear context about what the user is looking at and what they’re asking about. This contextual grounding dramatically improves response quality because the AI can reference specific parts of the webpage, understand the user’s question in relation to the content they’re viewing, and provide answers that are directly applicable to their current research or reading activity.

This is perfect for research, summarization, or fact-checking — and ensures the AI’s responses are directly tied to what the user is seeing or working on.

2. AI Writing Tools

Delight includes 10 specialized built-in toolset that acts like a lightweight “skills layer” for the AI, transforming prompts into specialized instructions without requiring users to engineer them manually. From simple explainers to academic rewriting, these tools encapsulate repeatable workflows into easy-to-use commands. Because they’re integrated with the AI SDK’s streaming, users get real-time results even for transformed prompts, making the tools feel native rather than bolted-on utilities.

This toolset addresses a common challenge in AI interactions where users often struggle to craft effective prompts for specific tasks. By providing pre-built prompt templates, Delight democratizes access to sophisticated AI interactions. Each tool function acts as a prompt factory that takes user content and wraps it in carefully crafted instructions that have been optimized for that particular type of task

3. Conversation Management

Delight’s persistent chat history uses intelligent context management to provide long-running conversations across browser sessions. It optimizes for storage efficiency and performance, particularly important given Chrome extension storage limits. The system employs sophisticated compression strategies, like removing redundant messages or summarizing old segments, to maximize stored conversations while maintaining quick access.

This allows for an “unlimited” conversation experience within technical constraints and enables features like search, export, and cross-device sync, making Delight a comprehensive AI assistant.
Performance Optimizations

Lazy Loading & Memory Management

With multiple providers and persistent chat history, performance is crucial. Instead of loading entire conversations into memory at once, messages are fetched on demand in small chunks. This keeps the app responsive even when conversations grow large, preventing memory bloat and long initial load times. It also enables efficient scrolling, where older messages appear only when needed, giving the interface the feel of a modern, high-performance chat app.

Streaming UI Updates

The incremental rendering of tokens ensures responses feel alive rather than static. By updating the UI as soon as chunks arrive, users experience the same immediacy as typing in real time. This reduces perceived latency, keeps engagement high, and works consistently across providers thanks to the SDK’s unified streaming support. The recursive chunk reader also ensures smooth playback without interruptions or jittery updates.
Challenges & Solutions

1. Provider Rate Limits

Different providers have varying rate limits that can significantly impact user experience when not handled properly. The challenge becomes particularly complex in a multi-provider system where each service has its own throttling policies, reset windows, and error response formats. I implemented an intelligent fallback:

const handleRateLimit = async (error: any, provider: string) => {
  if (error.status === 429) {
    // Switch to alternative provider
    const fallback = getFallbackProvider(provider);
    return aiService.sendMessage(message, fallback.name, fallback.defaultModel);
  }
};

The fallback mechanism shown here implements what software engineers call a “circuit breaker” pattern, where the system automatically routes around failures to maintain service continuity. The getFallbackProvider function is intelligent about which provider to choose next, considering factors like the user’s available API keys, the original provider that failed, and potentially even the type of request being made. This creates a resilient system where individual provider issues don’t translate into user-facing failures, but rather seamless transitions that users might not even notice.

2. Context Window Management

Managing conversation context across different model limits represents one of the most technically challenging aspects of building a multi-provider AI system. Each model has different token limits, and these limits directly impact both the quality of responses and the cost of API calls.

The optimization strategy implemented in Delight uses an approach that balances conversation continuity with practical constraints. By processing messages from newest to oldest, the system ensures that recent context, which is typically most relevant for response quality, is preserved in its original form. Older messages get compressed through techniques like summarization or key point extraction, maintaining their essential meaning while dramatically reducing their token footprint. The 80% threshold provides a safety buffer that accounts for token estimation inaccuracies while preventing requests from failing due to context overflow:

const optimizeContext = (messages: Message[], maxTokens: number) => {
  let totalTokens = 0;
  const optimized = [];
  
  // Keep recent messages, compress older ones
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const tokens = estimateTokens(message.content);
    
    if (totalTokens + tokens > maxTokens * 0.8) {
      // Compress older messages
      optimized.unshift(compressMessage(message));
    } else {
      optimized.unshift(message);
    }
    
    totalTokens += tokens;
  }
  
  return optimized;
};

3. Chrome Extension Limitations

Working within Chrome’s security model required creative solutions that balance functionality with the strict security constraints imposed by modern web browsers. Chrome extensions operate in a sandboxed environment with limited access to web page content and APIs:

// Content script for page interaction
const extractPageContent = () => {
  // Remove scripts, styles, and navigation
  const content = document.cloneNode(true) as Document;
  content.querySelectorAll('script, style, nav, header, footer')
    .forEach(el => el.remove());
  
  return {
    title: document.title,
    url: window.location.href,
    text: content.body?.innerText || '',
    favicon: getFavicon()
  };
};

The content extraction implementation shown here demonstrates several important techniques for working within these constraints. The document.cloneNode approach creates a safe copy of the page that can be modified without affecting the original page, while the selective removal of scripts, styles, and navigation elements ensures that only meaningful content is extracted. This filtering process is crucial because raw HTML content often contains large amounts of irrelevant markup that would waste tokens and potentially confuse AI models. The extraction focuses on the core textual content that users actually want to discuss, creating a clean, structured representation that AI models can process effectively while staying within Chrome’s security boundaries.
Key Takeaways

Building Delight taught me several valuable lessons:

1. Choose the right foundation: Vercel AI SDK’s unified interface didn’t just save development time — it provided a scalable backbone that kept the architecture clean and adaptable as new providers were added.

2. Streaming is essential: Real-time responses aren’t a “nice-to-have” — they define how natural and engaging the product feels. Without streaming, the whole experience would lose its immediacy.

3. Provider diversity matters: No single model is the best at everything. Tapping into multiple providers allowed Delight to play to each model’s strengths, whether that was reasoning, speed, or tone.

4. Performance from day one: Chrome extensions come with strict constraints on memory and storage, so optimization isn’t optional. Designing with these limits in mind ensured Delight stayed responsive.
Delight Is Shipping To The Chrome Webstore

I’ve submitted Delight to Google for review, and it will soon be available on the Chrome Web Store with 5 trial AI requests requiring no API key to start. This approach allows users to experience the power of having 6 major AI providers at their fingertips while browsing, removing the technical barriers that often prevent people from trying new AI tools. The free request system serves as both a user acquisition strategy and a product demonstration, allowing potential users to understand the value proposition before committing to the setup process.

The combination of Vercel AI SDK’s robust foundation and Chrome’s native integration creates something truly powerful: AI that feels like a natural part of your browsing experience rather than an external tool you need to switch to. This seamless integration represents the future of how AI will be consumed — not as destination applications, but as ambient intelligence that enhances existing workflows and browsing patterns.

The architectural decisions made in building Delight create a foundation that can evolve with the rapidly changing AI landscape. As new providers emerge, new model capabilities develop, and user needs evolve, the system’s flexible design ensures that these improvements can be integrated without fundamental restructuring. This extensibility positions Delight to grow with the AI ecosystem rather than being constrained by early architectural choices that assume a static technological environment.

Try out Delight here

What AI features would you want in your browser? Drop your thoughts in the comments — your feedback shapes where Delight goes next.
Chrome Extension
Vercel
AI
Vercel Ai Sdk
Chatbots

Andrews Kwesi Ankomahene
Written by Andrews Kwesi Ankomahene
1 follower
·
12 following
No responses yet

Write a response

What are your thoughts?
More from Andrews Kwesi Ankomahene
Building Complex Systems with Kiro: My Incremental Prompting Approach Behind Delight
Andrews Kwesi Ankomahene

Andrews Kwesi Ankomahene
Building Complex Systems with Kiro: My Incremental Prompting Approach Behind Delight
Every once in a while, a frustration pushes you to invent something better. Mine started with too many AI tabs.
Sep 15
How Amazon Q Transformed My Chrome Extension from Delisted to Feature-Rich
Andrews Kwesi Ankomahene

Andrews Kwesi Ankomahene
How Amazon Q Transformed My Chrome Extension from Delisted to Feature-Rich
It started innocently enough. I was bored with Brave browser’s default new tab backgrounds and decided to build something better. Being…
Aug 13
16
1
See all from Andrews Kwesi Ankomahene
Recommended from Medium
Build 7 Production-Ready Agentic AI Projects This Weekend (That Actually Land Jobs) 🚀
Towards AI

In

Towards AI

by

AbhinayaPinreddy
Build 7 Production-Ready Agentic AI Projects This Weekend (That Actually Land Jobs) 🚀
Stop reading about agentic AI. Start building it. 💪
6d ago
84
Anthropic Just Bought Bun
Joe Njenga

Joe Njenga
Anthropic Just Bought Bun — But the Real Story Isn’t About JavaScript
Anthropic has just acquired Bun just about time when Claude Code has hit the 1 billion milestone and seems this is just but a start.
4d ago
245
An example of a perfect, human designed dashboard interface for desktop and mobile phone
Michal Malewicz

Michal Malewicz
The End of Dashboards and Design Systems
Design is becoming quietly human again.
Nov 26
2K
78
The Best AI Tools for 2026
Artificial Corner

In

Artificial Corner

by

The PyCoach
The Best AI Tools for 2026
If you’re going to learn a new AI tool, make sure it’s one of these
6d ago
894
21
n8n:Why n8n is a “Dangerous” Future Force
Engr. Md. Hasan Monsur

Engr. Md. Hasan Monsur
n8n:Why n8n is a “Dangerous” Future Force
A clear guide to how n8n works, its expanding power in automation, and the potential security, data, and AI-driven dangers users should…
6d ago
39
Low-Code/No-Code vs CAPTCHA: is it possible to automate CAPTCHA solving without code?
Alexander

Alexander
Low-Code/No-Code vs CAPTCHA: is it possible to automate CAPTCHA solving without code?
CAPTCHA is an automated Turing test designed to distinguish bots from humans. Anyone who actively uses the Internet has encountered them…
Oct 1
50
See more recommendations

Help

Status

About

Careers

Press

Blog

Privacy

Rules

Terms

Text to speech
To make Medium work, we log user data. By using Medium, you agree to our Privacy Policy, including cookie policy.
