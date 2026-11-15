import { listInvoices } from "@/lib/server/invoices";
import { PageHeading } from "@/components/ui";
import { InvoiceHistory } from "@/components/invoice-history";
import { isDemoMode } from "@/lib/server/config";
import { requirePortalSession } from "@/lib/server/auth";
import { ConnectionRequired } from "@/components/connection-required";
export const metadata={title:"Invoice history"};
export default async function InvoicesPage(){const heading=<PageHeading eyebrow="EVERY DETAIL, FILED" title="Invoice history" description="A home for every invoice. Find it, download it, keep things moving."/>;if(!isDemoMode()){await requirePortalSession();if(process.env.SHOPIFY_CUSTOMER_DATA_APPROVED!=="true")return <>{heading}<ConnectionRequired customerAccess/></>;}const invoices=await listInvoices();return <>{heading}<InvoiceHistory invoices={invoices}/></>;}
