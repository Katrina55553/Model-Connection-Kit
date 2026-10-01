import type { AdapterErrorCategory } from "./types";

export class AdapterError extends Error {
  readonly category: AdapterErrorCategory;

  constructor(category: AdapterErrorCategory, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdapterError";
    this.category = category;
  }
}

export function isAdapterError(error: unknown): error is AdapterError {
  return error instanceof AdapterError;
}
