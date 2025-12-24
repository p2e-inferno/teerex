import { isValidAttestationUid } from "@/utils/attestationUtils";

describe("isValidAttestationUid", () => {
  it("accepts valid 32-byte hex strings", () => {
    const uid = "0x" + "11".repeat(32);
    expect(isValidAttestationUid(uid)).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(isValidAttestationUid(undefined)).toBe(false);
    expect(isValidAttestationUid("0x123")).toBe(false);
    expect(isValidAttestationUid("not-hex")).toBe(false);
  });
});

