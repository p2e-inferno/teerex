describe("Wallet connection (Privy + MetaMask)", () => {
  it("connects wallet through Privy modal", () => {
    const hasSeed =
      Boolean(Cypress.env("SECRET_WORDS")) ||
      Boolean(Cypress.env("SEED_PHRASE"));

    cy.visit("/");
    cy.contains(/connect wallet/i).first().click();

    if (!hasSeed) {
      cy.log("No MetaMask seed configured; smoke-only check.");
      cy.contains(/connect wallet/i).should("exist");
      return;
    }

    cy.get("body").then(($body) => {
      if ($body.text().match(/metamask/i)) {
        cy.contains(/metamask/i).click({ force: true });
      }
    });

    cy.acceptMetamaskAccess();

    cy.contains(/connect wallet/i, { timeout: 15000 }).should("not.exist");
  });
});
