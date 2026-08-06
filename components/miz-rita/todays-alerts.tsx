"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NotificationItem, type NotificationData } from "@/components/miz-rita/notification-item";
import { supabase } from "@/lib/supabase";

export function TodaysAlerts(){
  const [items,setItems]=useState<NotificationData[]>([]);const [businessId,setBusinessId]=useState("");
  const load=useCallback(async()=>{const {data:business}=await supabase.from("gbgs_businesses").select("id").eq("slug","miz-ritas-kitchen").maybeSingle();if(!business)return;setBusinessId(business.id);const today=new Date();today.setHours(0,0,0,0);const {data}=await supabase.from("gbgs_notifications").select("id,category,title,message,severity,is_read,created_at,related_order:gbgs_orders!related_order_id(order_number,meal_count,delivery_method),related_customer:gbgs_customers!related_customer_id(first_name,last_name)").eq("business_id",business.id).gte("created_at",today.toISOString()).order("created_at",{ascending:false}).limit(5);setItems((data??[]) as unknown as NotificationData[]);},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!businessId)return;const channel=supabase.channel(`dashboard-alerts-${businessId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"gbgs_notifications",filter:`business_id=eq.${businessId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel);};},[businessId,load]);
  return <section className="mt-6 rounded-3xl bg-white p-6 shadow-lg"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold text-[#081c35]">Today&apos;s Alerts</h2><Link href="/dashboard/miz-rita/notifications" className="text-sm font-bold text-blue-700">View All</Link></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{items.map((item)=><Link key={item.id} href="/dashboard/miz-rita/notifications" className="rounded-2xl border border-slate-200 p-3 transition hover:bg-slate-50"><NotificationItem item={item} compact /></Link>)}{!items.length&&<p className="text-sm text-slate-400">No alerts today.</p>}</div></section>;
}
