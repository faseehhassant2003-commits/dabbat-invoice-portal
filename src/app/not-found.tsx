import Link from "next/link";
export default function NotFound(){return <div className="error-state"><p className="eyebrow">404 · NOT FOUND</p><h1>A detail we couldn’t find.</h1><p>This order or page is unavailable. Head back to your workspace to continue.</p><Link className="button primary" href="/">Back to overview</Link></div>;}
