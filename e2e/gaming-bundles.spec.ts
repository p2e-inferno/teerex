describe("Gaming bundles happy path", () => {
  it("creates bundle, records offline sale, and redeems", () => {
    const bundle = {
      id: "bundle-1",
      title: "1 Hour PS5",
      description: "Playtime bundle",
      bundle_type: "TIME",
      quantity_units: 60,
      unit_label: "minutes",
      price_fiat: 5000,
      price_dg: 0,
      chain_id: 8453,
      bundle_address: "0x1234567890abcdef1234567890abcdef12345678",
      vendor_id: "vendor-1",
      vendor_address: "0xvendor",
      key_expiration_duration_seconds: 2592000,
      fiat_symbol: "NGN",
      game_title: null,
      image_url: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sold_count: 0,
    };

    cy.intercept("POST", "**/functions/v1/list-gaming-bundles", {
      ok: true,
      bundles: [bundle],
    }).as("listBundles");

    cy.intercept("POST", "**/functions/v1/create-gaming-bundle", {
      ok: true,
      bundle,
    }).as("createBundle");

    cy.intercept("POST", "**/functions/v1/record-gaming-bundle-sale", {
      ok: true,
      order: { id: "order-1" },
      claim_code: "ABC123",
      eas_uid: "0xattest",
    }).as("recordSale");

    cy.intercept("POST", "**/functions/v1/redeem-gaming-bundle", {
      ok: true,
      redemption: { order_id: "order-1", redeemed_at: new Date().toISOString() },
    }).as("redeem");

    cy.visit("/vendor/gaming-bundles");

    cy.contains(/title/i).parent().find("input").type("Test Bundle");
    cy.contains(/description/i).parent().find("textarea").type("Bundle description");
    cy.contains(/bundle lock address/i).parent().find("input").type(bundle.bundle_address);
    cy.contains(/create bundle/i).click();
    cy.wait("@createBundle");

    cy.visit("/vendor/bundles-pos");
    cy.contains(/record sale/i).click();
    cy.wait("@recordSale");
    cy.contains(/claim code/i).should("contain.text", "ABC123");

    cy.visit("/vendor/bundles-redeem");
    cy.contains(/order id/i).parent().find("input").type("order-1");
    cy.contains(/redeem/i).click();
    cy.wait("@redeem");
    cy.contains(/last redemption/i).should("exist");
  });
});
