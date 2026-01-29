export type ExtractParams<T extends string> =
  T extends `${infer _Start}{${infer Param}}${infer Rest}` ? Param | ExtractParams<Rest> : never;

export type ParamsFromPath<T extends string> =
  ExtractParams<T> extends never ? {} : { [K in ExtractParams<T>]: string };

export type HasParams<T extends string> = ExtractParams<T> extends never ? false : true;

function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`Expected string, got ${typeof value}`);
  }
  return value;
}

function validateParams(template: string, params: Record<string, string>): Record<string, string> {
  const expectedKeys = getParamNames(template);

  for (const key of expectedKeys) {
    if (!(key in params)) {
      throw new Error(`Missing param: ${key}`);
    }
    if (typeof params[key] !== "string") {
      throw new Error(`Param ${key} must be a string`);
    }
  }

  const result: Record<string, string> = {};
  for (const key of expectedKeys) {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing param value: ${key}`);
    }
    result[key] = value;
  }

  return result;
}

export function resolvePath<T extends string>(template: T, params: ParamsFromPath<T>): string {
  let result: string = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, assertString(value));
  }
  return result;
}

export function parsePath(template: string, resolved: string): Record<string, string> | null {
  const paramNames: string[] = [];
  let regexStr = "^";

  let remaining: string = template;
  while (remaining.length > 0) {
    const paramStart = remaining.indexOf("{");
    if (paramStart === -1) {
      regexStr += escapeRegex(remaining);
      break;
    }

    if (paramStart > 0) {
      regexStr += escapeRegex(remaining.slice(0, paramStart));
    }

    const paramEnd = remaining.indexOf("}", paramStart);
    if (paramEnd === -1) {
      return null;
    }

    const paramName = remaining.slice(paramStart + 1, paramEnd);
    paramNames.push(paramName);
    regexStr += "([^/]+)";

    remaining = remaining.slice(paramEnd + 1);
  }

  regexStr += "$";

  const regex = new RegExp(regexStr);
  const match = resolved.match(regex);

  if (!match) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    const name = paramNames[i];
    const value = match[i + 1];
    if (name === undefined || value === undefined) {
      return null;
    }
    params[name] = value;
  }

  return validateParams(template, params);
}

export function getParamNames(template: string): string[] {
  const names: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    const name = match[1];
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}

export function hasParams(template: string): boolean {
  return template.includes("{");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
