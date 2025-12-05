/**
 * Experiment 1.1: Basic Tool Execution with Lemmy
 *
 * This demonstrates:
 * 1. Defining a tool with Zod schema
 * 2. Adding it to a Context
 * 3. Making an LLM call that uses the tool
 * 4. Manual tool execution (the key for approval interception)
 * 5. Sending results back to LLM
 */

import { lemmy, Context, defineTool, toToolResults } from "@mariozechner/lemmy";
import { z } from "zod";

// Define a simple tool
const getWeatherTool = defineTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("The city to get weather for"),
  }),
  execute: async (args) => {
    // Simulate weather API
    console.log(`[Tool] Getting weather for: ${args.city}`);
    return {
      city: args.city,
      temperature: 22,
      conditions: "sunny",
      humidity: 45,
    };
  },
});

// Define another tool to show multiple tools work
const getTimeTool = defineTool({
  name: "get_time",
  description: "Get the current time in a timezone",
  schema: z.object({
    timezone: z.string().describe("Timezone like 'America/New_York' or 'Europe/London'"),
  }),
  execute: async (args) => {
    console.log(`[Tool] Getting time for: ${args.timezone}`);
    return {
      timezone: args.timezone,
      time: new Date().toLocaleTimeString("en-US", { timeZone: args.timezone }),
    };
  },
});

async function main() {
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Please set ANTHROPIC_API_KEY environment variable");
    process.exit(1);
  }

  // Create client
  const client = lemmy.anthropic({
    apiKey,
    model: "claude-sonnet-4-20250514",
  });

  // Create context with tools
  const context = new Context();
  context.setSystemMessage("You are a helpful assistant. Use the available tools to answer questions.");
  context.addTool(getWeatherTool);
  context.addTool(getTimeTool);

  console.log("=== Experiment 1.1: Basic Tool Execution ===\n");
  console.log("Asking: What's the weather in Paris and what time is it in Tokyo?\n");

  // Make initial request
  let result = await client.ask(
    "What's the weather in Paris and what time is it in Tokyo?",
    { context }
  );

  // Tool execution loop
  let iterations = 0;
  const maxIterations = 5;

  while (
    result.type === "success" &&
    result.message.toolCalls?.length &&
    iterations < maxIterations
  ) {
    iterations++;
    console.log(`\n--- Iteration ${iterations}: Tool calls received ---`);

    for (const toolCall of result.message.toolCalls) {
      console.log(`Tool: ${toolCall.name}`);
      console.log(`Args: ${JSON.stringify(toolCall.arguments)}`);
    }

    // ⭐ KEY POINT: Manual tool execution
    // This is where we can intercept for approvals!
    console.log("\n[Executing tools...]");
    const toolResults = await context.executeTools(result.message.toolCalls);

    // Log results
    for (const tr of toolResults) {
      if (tr.success) {
        console.log(`[Result] ${JSON.stringify(tr.result)}`);
      } else {
        console.log(`[Error] ${tr.error.message}`);
      }
    }

    // Send results back to LLM
    result = await client.ask(
      { toolResults: toToolResults(toolResults) },
      { context }
    );
  }

  // Final response
  if (result.type === "success") {
    console.log("\n=== Final Response ===");
    console.log(result.message.content);
    console.log(`\nTokens: ${result.tokens.input} in, ${result.tokens.output} out`);
  } else {
    console.error("Error:", result.error);
  }
}

main().catch(console.error);
