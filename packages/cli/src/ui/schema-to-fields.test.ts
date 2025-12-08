/**
 * Schema to Fields Tests
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { deriveFieldsFromSchema, isZodObjectSchema } from "./schema-to-fields.js";

describe("isZodObjectSchema", () => {
  it("returns true for ZodObject", () => {
    const schema = z.object({ name: z.string() });
    expect(isZodObjectSchema(schema)).toBe(true);
  });

  it("returns false for non-objects", () => {
    expect(isZodObjectSchema(z.string())).toBe(false);
    expect(isZodObjectSchema(z.number())).toBe(false);
    expect(isZodObjectSchema(z.boolean())).toBe(false);
    expect(isZodObjectSchema(z.array(z.string()))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isZodObjectSchema(null)).toBe(false);
    expect(isZodObjectSchema(undefined)).toBe(false);
  });
});

describe("deriveFieldsFromSchema", () => {
  it("derives string fields", () => {
    const schema = z.object({
      name: z.string().describe("User name"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toEqual([
      {
        name: "name",
        description: "User name",
        type: "text",
        required: true,
      },
    ]);
  });

  it("derives number fields", () => {
    const schema = z.object({
      count: z.number().describe("Item count"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toEqual([
      {
        name: "count",
        description: "Item count",
        type: "number",
        required: true,
      },
    ]);
  });

  it("derives boolean fields", () => {
    const schema = z.object({
      enabled: z.boolean().describe("Is enabled"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toEqual([
      {
        name: "enabled",
        description: "Is enabled",
        type: "boolean",
        required: true,
      },
    ]);
  });

  it("derives enum fields as select", () => {
    const schema = z.object({
      color: z.enum(["red", "green", "blue"]).describe("Color choice"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toEqual([
      {
        name: "color",
        description: "Color choice",
        type: "select",
        required: true,
        options: ["red", "green", "blue"],
      },
    ]);
  });

  it("derives literal union as select", () => {
    const schema = z.object({
      size: z.union([
        z.literal("small"),
        z.literal("medium"),
        z.literal("large"),
      ]).describe("Size selection"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toEqual([
      {
        name: "size",
        description: "Size selection",
        type: "select",
        required: true,
        options: ["small", "medium", "large"],
      },
    ]);
  });

  it("handles optional fields", () => {
    const schema = z.object({
      name: z.string().describe("Name"),
      nickname: z.string().optional().describe("Optional nickname"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toHaveLength(2);
    expect(fields[0].required).toBe(true);
    expect(fields[1].required).toBe(false);
  });

  it("handles default values", () => {
    const schema = z.object({
      remote: z.enum(["origin", "upstream"]).default("origin").describe("Remote"),
      force: z.boolean().default(false).describe("Force push"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toHaveLength(2);

    expect(fields[0]).toEqual({
      name: "remote",
      description: "Remote",
      type: "select",
      required: false,
      options: ["origin", "upstream"],
      default: "origin",
    });

    expect(fields[1]).toEqual({
      name: "force",
      description: "Force push",
      type: "boolean",
      required: false,
      default: false,
    });
  });

  it("handles complex git push schema", () => {
    const schema = z.object({
      remote: z.enum(["origin", "upstream"]).default("origin"),
      branch: z.string().describe("Target branch"),
      force: z.boolean().default(false).describe("Force push"),
    });

    const fields = deriveFieldsFromSchema(schema);
    expect(fields).toHaveLength(3);

    expect(fields.find((f) => f.name === "branch")).toEqual({
      name: "branch",
      description: "Target branch",
      type: "text",
      required: true,
    });

    expect(fields.find((f) => f.name === "remote")?.required).toBe(false);
    expect(fields.find((f) => f.name === "force")?.required).toBe(false);
  });

  it("returns empty array for non-object", () => {
    // This shouldn't happen with type checking, but test the edge case
    // @ts-expect-error - intentionally passing wrong type for test
    const fields = deriveFieldsFromSchema({});
    expect(fields).toEqual([]);
  });
});
