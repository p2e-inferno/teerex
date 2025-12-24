import { wrapEip1193ProviderWithDivvi } from "../src/lib/divvi/eip1193";

describe("Divvi EIP-1193 wrapper (no wallet)", () => {
  it("appends referral tag to calldata and submits after confirmation", () => {
    const sent: any[] = [];
    const provider = {
      request: ({ method, params }: any) => {
        if (method === "eth_chainId") return Promise.resolve("0x1");
        if (method === "eth_sendTransaction") {
          sent.push(params[0]);
          return Promise.resolve("0xabc");
        }
        if (method === "eth_getTransactionReceipt") {
          return Promise.resolve({ status: "0x1", transactionHash: params[0] });
        }
        return Promise.reject(new Error(`unexpected method: ${method}`));
      },
    };

    const submitReferral = cy.stub().resolves({ ok: true });
    const wrapped = wrapEip1193ProviderWithDivvi(provider as any, {
      consumer: "0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb",
      getUserAddress: (tx) => tx.from,
      getReferralTag: () => "0xdeadbeef",
      submitReferral: submitReferral as any,
    });

    return cy
      .wrap(
        wrapped.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: "0x1111111111111111111111111111111111111111",
              to: "0x2222222222222222222222222222222222222222",
              data: "0x1234",
            },
          ],
        })
      )
      .then((txHash) => {
        expect(txHash).to.eq("0xabc");
        expect(sent[0].data).to.eq("0x1234deadbeef");
        return new Cypress.Promise((resolve) => setTimeout(resolve, 0));
      })
      .then(() => {
        expect(submitReferral).to.have.been.calledWith({
          txHash: "0xabc",
          chainId: 1,
        });
      });
  });
});

