import type { RecordedTaxData, RecordedTaxLine } from "./types";
import { toMinorUnits } from "./invoice-core";
import { gstComponent } from "./gst";

export type ShopifyTaxLine = {
  title: string; ratePercentage: number | null; channelLiable: boolean | null; source?: string | null;
  priceSet: { shopMoney: { amount: string; currencyCode: string } };
};
type TaxContainer = { taxLines?: ShopifyTaxLine[] | null };

/** Record authenticated Shopify values verbatim; never derive tax from a rate. */
export function recordShopifyTaxData(input: { currency: string; complete: boolean; estimated?: boolean; edited?: boolean; cancelledAt?: string | null; products: TaxContainer[]; shipping: TaxContainer[] }, now = new Date()): RecordedTaxData {
  let complete = input.complete;
  const collect = (containers: TaxContainer[], kind: RecordedTaxLine["kind"]): RecordedTaxLine[] => containers.flatMap((container) => {
    if (!Array.isArray(container.taxLines)) { complete = false; return []; }
    return container.taxLines.map((line) => {
      if (line.priceSet.shopMoney.currencyCode !== input.currency) throw new Error("Shopify tax amounts use a different currency from the order.");
      return {
        title: line.title,
        ratePercentage: typeof line.ratePercentage === "number" && Number.isFinite(line.ratePercentage) ? line.ratePercentage : null,
        amount: toMinorUnits(line.priceSet.shopMoney.amount, input.currency),
        component: gstComponent(line.title),
        channelLiable: typeof line.channelLiable === "boolean" ? line.channelLiable : null,
        kind, source: typeof line.source === "string" ? line.source : null,
      };
    });
  });
  const lines = [...collect(input.products, "product"), ...collect(input.shipping, "shipping")];
  return { source: "shopify", complete, estimated: input.estimated !== false, edited: input.edited !== false, cancelledAt: input.cancelledAt ?? null, collectedAt: now.toISOString(), lines };
}
