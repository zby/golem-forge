# Experiment 1.1: Basic Tool Execution

## Goal

Validate that lemmy's tool system works for our needs and demonstrate the approval interception point.

## Files

- `main.ts` - Full example with real LLM calls (requires `ANTHROPIC_API_KEY`)
- `main-mock.ts` - Mock example showing approval flow without API calls

## Running

```bash
# Install dependencies
npm install

# Run mock version (no API key needed)
npm run start:mock

# Run with real LLM (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... npm run start
```

## Key Concepts Demonstrated

### 1. Tool Definition with Zod

```typescript
const getWeatherTool = defineTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("The city to get weather for"),
  }),
  execute: async (args) => {
    return { city: args.city, temperature: 22 };
  },
});
```

### 2. Manual Tool Execution Loop

```typescript
// LLM returns tool calls, we execute them manually
while (result.message.toolCalls?.length) {
  // ⭐ INTERCEPTION POINT - check approval here!
  const toolResults = await context.executeTools(result.message.toolCalls);
  result = await client.ask({ toolResults: toToolResults(toolResults) }, { context });
}
```

### 3. Approval Interception Pattern

```typescript
async function executeToolsWithApproval(context, toolCalls) {
  for (const toolCall of toolCalls) {
    // 1. Check if approval needed
    const approval = checkApproval(toolCall.name, toolCall.arguments);

    if (approval.status === "blocked") {
      // Return error to LLM
      continue;
    }

    if (approval.status === "needs_approval") {
      // 2. Request approval via callback (runtime-specific)
      const approved = await approvalCallback(toolCall);
      if (!approved) {
        // Return denial to LLM
        continue;
      }
    }

    // 3. Execute the tool
    const result = await context.executeTool(toolCall);
  }
}
```

## Success Criteria

- [x] Tool definition with Zod schema works
- [x] Tool execution through Context works
- [x] Manual tool execution loop demonstrated
- [x] Approval interception point identified and demonstrated
- [x] Error handling works (blocked/denied tools return errors to LLM)

## Conclusion

Lemmy's design is ideal for our approval system. The manual tool handling gives us full control over execution, with a clean interception point for approval checks.

## Next Steps

→ Experiment 1.2: Port the approval system core types from Python
