/**
 * Schema to Fields Utility
 *
 * Derives manual tool field definitions from Zod schemas.
 * Used to generate input forms for manual tool invocation.
 */

import type { z, ZodTypeAny } from "zod";
import type { ManualToolFieldEvent } from "../ui-events.js";

export type FieldType = ManualToolFieldEvent["type"];

/**
 * Zod type names we recognize.
 */
type ZodTypeName =
  | "ZodString"
  | "ZodNumber"
  | "ZodBoolean"
  | "ZodEnum"
  | "ZodLiteral"
  | "ZodUnion"
  | "ZodOptional"
  | "ZodDefault"
  | "ZodObject";

/**
 * Get the Zod type name from a Zod type.
 */
function getZodTypeName(schema: ZodTypeAny): ZodTypeName | string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  if (def && def.typeName) {
    return def.typeName;
  }
  return "unknown";
}

/**
 * Get the description from a Zod type.
 */
function getDescription(schema: ZodTypeAny): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  return def?.description;
}

/**
 * Get the default value from a ZodDefault type.
 */
function getDefaultValue(schema: ZodTypeAny): unknown | undefined {
  const typeName = getZodTypeName(schema);
  if (typeName === "ZodDefault") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (schema as any)._def;
    if (def && typeof def.defaultValue === "function") {
      return def.defaultValue();
    }
    return def?.defaultValue;
  }
  return undefined;
}

/**
 * Unwrap optional and default types to get the inner type.
 */
function unwrapType(schema: ZodTypeAny): {
  inner: ZodTypeAny;
  optional: boolean;
  defaultValue?: unknown;
} {
  let current = schema;
  let optional = false;
  let defaultValue: unknown;

  // Unwrap ZodDefault first
  const typeName = getZodTypeName(current);
  if (typeName === "ZodDefault") {
    defaultValue = getDefaultValue(current);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current = (current as any)._def.innerType;
  }

  // Then unwrap ZodOptional
  const innerTypeName = getZodTypeName(current);
  if (innerTypeName === "ZodOptional") {
    optional = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current = (current as any)._def.innerType;
  }

  return { inner: current, optional: optional || defaultValue !== undefined, defaultValue };
}

/**
 * Determine the field type from a Zod type.
 */
function determineFieldType(schema: ZodTypeAny): { type: FieldType; options?: string[] } {
  const { inner } = unwrapType(schema);
  const typeName = getZodTypeName(inner);

  switch (typeName) {
    case "ZodString":
      return { type: "text" };

    case "ZodNumber":
      return { type: "number" };

    case "ZodBoolean":
      return { type: "boolean" };

    case "ZodEnum": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = (inner as any)._def.values as string[];
      return { type: "select", options: values };
    }

    case "ZodLiteral": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (inner as any)._def.value;
      if (typeof value === "string") {
        return { type: "select", options: [value] };
      }
      if (typeof value === "boolean") {
        return { type: "boolean" };
      }
      if (typeof value === "number") {
        return { type: "number" };
      }
      return { type: "text" };
    }

    case "ZodUnion": {
      // Check if it's a union of literals (select options)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = (inner as any)._def.options as ZodTypeAny[];
      const literalValues: string[] = [];
      let allLiterals = true;

      for (const option of options) {
        const optionTypeName = getZodTypeName(option);
        if (optionTypeName === "ZodLiteral") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = (option as any)._def.value;
          if (typeof v === "string") {
            literalValues.push(v);
          } else {
            allLiterals = false;
            break;
          }
        } else {
          allLiterals = false;
          break;
        }
      }

      if (allLiterals && literalValues.length > 0) {
        return { type: "select", options: literalValues };
      }

      return { type: "text" };
    }

    default:
      return { type: "text" };
  }
}

export function deriveFieldsFromSchema(schema: z.ZodObject<z.ZodRawShape>): ManualToolFieldEvent[] {
  const fields: ManualToolFieldEvent[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shape = (schema as any).shape;

  if (!shape || typeof shape !== "object") {
    return fields;
  }

  for (const [name, fieldSchema] of Object.entries(shape)) {
    const zodField = fieldSchema as ZodTypeAny;
    const { optional, defaultValue } = unwrapType(zodField);
    const { type, options } = determineFieldType(zodField);
    const description = getDescription(zodField) || "";

    const field: ManualToolFieldEvent = {
      name,
      description,
      type,
      required: !optional,
    };

    if (options) {
      field.options = options;
    }

    if (defaultValue !== undefined) {
      field.default = defaultValue;
    }

    fields.push(field);
  }

  return fields;
}

/**
 * Check if a schema is a Zod object schema.
 */
export function isZodObjectSchema(schema: unknown): schema is z.ZodObject<z.ZodRawShape> {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const typeName = getZodTypeName(schema as ZodTypeAny);
  return typeName === "ZodObject";
}

