"use client";
import { AlertCircle, RotateCcw } from "lucide-react";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <div className="error-state"><AlertCircle size={32}/><h1>The workspace needs a moment.</h1><p>Check your connection and secure setup, then try again. Live order access also requires approved customer data permissions.</p><button className="button primary" onClick={reset}><RotateCcw size={16}/>Try again</button><a href="/settings" className="text-link">Open settings</a></div>;}
