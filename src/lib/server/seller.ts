import "server-only";
import type { GstSettings, Seller } from "@/lib/types";
import { defaultGstSettings } from "@/lib/gst";
export function getSeller(gst: GstSettings = defaultGstSettings()): Seller {
  return {
    name: process.env.SELLER_NAME || "Dabbat",
    email: process.env.SELLER_EMAIL || "support@dabbat.in",
    website: "dabbat.in",
    address: (process.env.SELLER_ADDRESS || "").split("|").map((line) => line.trim()).filter(Boolean),
    gst: structuredClone(gst),
  };
}
