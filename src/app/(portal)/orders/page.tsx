import { listOrders } from "@/lib/server/orders";
import { PageHeading } from "@/components/ui";
import { OrderBrowser } from "@/components/order-browser";
import { getIntegrationStatus, isDemoMode } from "@/lib/server/config";
import { ConnectionRequired } from "@/components/connection-required";
import { getOrderEmailIndicators } from "@/lib/server/email";
export const metadata = { title: "Orders" };
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { const heading=<PageHeading eyebrow="THE ORDER BOOK" title="Orders" description="Find an order, check the details, and make it official."/>; if(!isDemoMode()){const status=await getIntegrationStatus();if(!status.connected || process.env.SHOPIFY_CUSTOMER_DATA_APPROVED!=="true") return <>{heading}<ConnectionRequired customerAccess={status.connected}/></>;} const {q} = await searchParams; const orders=await listOrders(q); const emailIndicators=await getOrderEmailIndicators(orders.map(order=>order.id)); return <>{heading}<OrderBrowser orders={orders} emailIndicators={emailIndicators} initialSearch={q ?? ""}/></>; }
