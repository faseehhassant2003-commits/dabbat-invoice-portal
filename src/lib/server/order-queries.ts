// Read-only Admin API 2026-10. Customer fields are gated by approval in orders.ts.
export const taxFields = `
  title ratePercentage channelLiable source
  priceSet { shopMoney { amount currencyCode } }
`;
export const orderFields = `
  id name createdAt updatedAt edited cancelledAt currencyCode email
  displayFinancialStatus displayFulfillmentStatus paymentGatewayNames taxesIncluded estimatedTaxes
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalDiscountsSet { shopMoney { amount currencyCode } }
  totalPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  billingAddress { name address1 address2 city province zip country }
  shippingLines(first: 20) {
    nodes {
      discountedPriceSet { shopMoney { amount currencyCode } }
      taxLines { ${taxFields} }
    }
    pageInfo { hasNextPage }
  }
`;
export const lineFields = `
  id title variantTitle sku quantity
  originalUnitPriceSet { shopMoney { amount currencyCode } }
  originalTotalSet { shopMoney { amount currencyCode } }
  taxLines { ${taxFields} }
`;
export const recentOrdersQuery = `query PortalRecentOrders($search: String) {
  orders(first: 20, sortKey: CREATED_AT, reverse: true, query: $search) {
    nodes { ${orderFields}
      lineItems(first: 3) { nodes { ${lineFields} } pageInfo { hasNextPage endCursor } }
    }
  }
}`;
export const orderDetailQuery = `query PortalOrder($id: ID!, $after: String) {
  order(id: $id) { ${orderFields}
    lineItems(first: 100, after: $after) {
      nodes { ${lineFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
