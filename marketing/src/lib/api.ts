import { publicKnowledge } from "@/generated/public-knowledge";

export const DEFAULT_MARKETING_API_BASE_URL = publicKnowledge.company.apiUrl;

export function getMarketingApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return (configured || DEFAULT_MARKETING_API_BASE_URL).replace(/\/+$/, "");
}

export function marketingApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getMarketingApiBaseUrl()}${normalizedPath}`;
}
