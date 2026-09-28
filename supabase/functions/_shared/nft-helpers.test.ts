import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getMintedRecipientsFromReceipt } from "./nft-helpers.ts";

type Receipt = Parameters<typeof getMintedRecipientsFromReceipt>[0];

const LOCK = "0x1B450deC32fA49a96650F434Cf87E8c5B5AE7B8a";
const OTHER_LOCK = "0x0000000000000000000000000000000000000abc";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (address: string) => "0x" + address.slice(2).toLowerCase().padStart(64, "0");
const ZERO = pad("0x0000000000000000000000000000000000000000");
const BUYER = "0xc1ea63e3596599d186d80f07a8099047fa49a901";
const SELLER = "0x00000000000000000000000000000000000000aa";

const transfer = (address: string, from: string, to: string, tokenId = 1) => ({
  address,
  topics: [TRANSFER, from, pad(to), "0x" + tokenId.toString(16).padStart(64, "0")],
});

Deno.test("returns one recipient per key minted by the lock", () => {
  const receipt = { logs: [transfer(LOCK, ZERO, BUYER, 1), transfer(LOCK, ZERO, BUYER, 2)] } as unknown as Receipt;
  assertEquals(getMintedRecipientsFromReceipt(receipt, LOCK.toLowerCase()), [BUYER, BUYER]);
});

Deno.test("ignores transfers between holders and logs from other contracts", () => {
  const receipt = {
    logs: [
      transfer(LOCK, pad(SELLER), BUYER),
      transfer(OTHER_LOCK, ZERO, BUYER),
      { address: LOCK, topics: [TRANSFER, ZERO, pad(BUYER)] },
    ],
  } as unknown as Receipt;
  assertEquals(getMintedRecipientsFromReceipt(receipt, LOCK), []);
});
