import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readRewardPositions } from "./reward-pools.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

Deno.test("readRewardPositions reads the current position shape", async () => {
  const controller = {
    positions: () => ({
      amount: 2000000n,
      winner: "0x0000000000000000000000000000000000000001",
      assignedAt: 10n,
      holdUntil: 20n,
      claimed: true,
      reclaimed: false,
      claimedAt: 30n,
    }),
  };

  const positions = await readRewardPositions(controller as any, 1, 1);

  assertEquals(positions, [{
    placement: 1,
    amountWei: "2000000",
    winner: "0x0000000000000000000000000000000000000001",
    assignedAt: 10,
    holdUntil: 20,
    claimed: true,
    reclaimed: false,
    claimedAt: 30,
  }]);
});

Deno.test("readRewardPositions falls back to the legacy position shape", async () => {
  const controller = {
    positions: () => {
      throw new Error("could not decode result data");
    },
  };
  const legacyController = {
    positions: () => ({
      amount: 1500000n,
      winner: ZERO,
      assignedAt: 0n,
      holdUntil: 0n,
      claimed: false,
      claimedAt: 0n,
    }),
  };

  const positions = await readRewardPositions(controller as any, 1, 1, legacyController as any);

  assertEquals(positions, [{
    placement: 1,
    amountWei: "1500000",
    winner: null,
    assignedAt: 0,
    holdUntil: 0,
    claimed: false,
    reclaimed: false,
    claimedAt: 0,
  }]);
});
