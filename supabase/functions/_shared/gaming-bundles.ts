/* deno-lint-ignore-file no-explicit-any */
import { SchemaEncoder } from "https://esm.sh/@ethereum-attestation-service/eas-sdk@2.7.0";

export const ZERO_UID = "0x0000000000000000000000000000000000000000000000000000000000000000";

export const GAMING_BUNDLE_SCHEMA_DEFINITION =
  "address vendorAddress,address bundleAddress,string orderId,string paymentReference,string buyerDisplayName,address buyerAddress,string priceFiat,string fiatSymbol,string priceDg,uint256 quantityUnits,string unitLabel,string bundleType,uint256 chainId,uint256 issuedAt";

export type GamingBundleAttestationInput = {
  vendorAddress: string;
  bundleAddress: string;
  orderId: string;
  paymentReference: string;
  buyerDisplayName: string;
  buyerAddress: string;
  priceFiat: string;
  fiatSymbol: string;
  priceDg: string;
  quantityUnits: number;
  unitLabel: string;
  bundleType: string;
  chainId: number;
  issuedAt: number;
};

export function encodeGamingBundlePurchase(input: GamingBundleAttestationInput): string {
  const encoder = new SchemaEncoder(GAMING_BUNDLE_SCHEMA_DEFINITION);
  return encoder.encodeData([
    { name: "vendorAddress", value: input.vendorAddress, type: "address" },
    { name: "bundleAddress", value: input.bundleAddress, type: "address" },
    { name: "orderId", value: input.orderId, type: "string" },
    { name: "paymentReference", value: input.paymentReference, type: "string" },
    { name: "buyerDisplayName", value: input.buyerDisplayName, type: "string" },
    { name: "buyerAddress", value: input.buyerAddress, type: "address" },
    { name: "priceFiat", value: input.priceFiat, type: "string" },
    { name: "fiatSymbol", value: input.fiatSymbol, type: "string" },
    { name: "priceDg", value: input.priceDg, type: "string" },
    { name: "quantityUnits", value: input.quantityUnits, type: "uint256" },
    { name: "unitLabel", value: input.unitLabel, type: "string" },
    { name: "bundleType", value: input.bundleType, type: "string" },
    { name: "chainId", value: input.chainId, type: "uint256" },
    { name: "issuedAt", value: input.issuedAt, type: "uint256" },
  ]);
}

export function generateClaimCode(): string {
  // 16 bytes => 128 bits of entropy; safe even if only the hash leaks.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeClaimCode(input: string): string {
  return input.trim().replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}
