"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NotificationItem, type NotificationData } from "@/components/miz-rita/notification-item";
import { supabase } from "@/lib/supabase";

const important=new Set(["Production Started","Production Paused","Production Resumed","Production Stopped","Production Completed","Production Reopened","Packaging Ready"]);

export function NotificationBell(){
  const [items,setItems]=useState<NotificationData[]>([]);const [unread,setUnread]=useState(0);const [open,setOpen]=useState(false);const [toast,setToast]=useState<NotificationData|null>(null);const [businessId,setBusinessId]=useState("");
  const load=useCallback(async()=>{const {data:business}=await supabase.from("gbgs_businesses").select("id").eq("slug","miz-ritas-kitchen").maybeSingle();if(!business)return;setBusinessId(business.id);const [list,count]=await Promise.all([
    supabase.from("gbgs_notifications").select("id,category,title,message,severity,is_read,created_at,related_order:gbgs_orders!related_order_id(order_number,meal_count,delivery_method),related_customer:gbgs_customers!related_customer_id(first_name,last_name)").eq("business_id",business.id).order("created_at",{ascending:false}).limit(5),
    supabase.from("gbgs_notifications").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("is_read",false),
  ]);setItems((list.data??[]) as unknown as NotificationData[]);setUnread(count.count??0);},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!businessId)return;const channel=supabase.channel(`notifications-${businessId}`).on("postgres_changes",{event:"*",schema:"public",table:"gbgs_notifications",filter:`business_id=eq.${businessId}`},(payload)=>{const row=payload.new as Omit<NotificationData,"related_order"|"related_customer">|undefined;if(payload.eventType==="INSERT"&&row&&important.has(row.title))setToast({...row,related_order:null,related_customer:null});void load();}).subscribe();return()=>{void supabase.removeChannel(channel);};},[businessId,load]);
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(null),5000);return()=>window.clearTimeout(timer);},[toast]);
  const markRead=async(item:NotificationData)=>{if(item.is_read)return;setItems((current)=>current.map((entry)=>entry.id===item.id?{...entry,is_read:true}:entry));setUnread((current)=>Math.max(0,current-1));await supabase.from("gbgs_notifications").update({is_read:true}).eq("id",item.id).eq("business_id",businessId).eq("is_read",false);};
  return <><div className="relative"><button type="button" aria-label={`Notifications${unread?`, ${unread} unread`:""}`} onClick={()=>setOpen((value)=>!value)} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:bg-slate-50"><Bell className="h-5 w-5" />{unread>0&&<span className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white">{unread>99?"99+":unread}</span>}</button>
  {open&&<div className="absolute right-0 z-50 mt-2 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><p className="font-bold text-slate-900">Notification Center</p><p className="text-xs text-slate-500">{unread} unread</p></div><button onClick={()=>setOpen(false)} aria-label="Close notifications"><X className="h-4 w-4" /></button></div><div className="max-h-[28rem] overflow-y-auto">{items.map((item)=><button key={item.id} onClick={()=>void markRead(item)} className="block w-full border-b px-4 py-3 text-left hover:bg-slate-50"><NotificationItem item={item} compact /></button>)}{!items.length&&<p className="p-6 text-center text-sm text-slate-400">No notifications yet.</p>}</div><Link href="/dashboard/miz-rita/notifications" onClick={()=>setOpen(false)} className="block bg-slate-50 px-4 py-3 text-center text-sm font-bold text-blue-700">View All Notifications</Link></div>}</div>
  {toast&&<div className="fixed bottom-5 right-5 z-[100] max-w-sm rounded-2xl border-l-4 border-blue-600 bg-white p-4 shadow-2xl"><div className="flex gap-3"><NotificationItem item={toast} compact /><button onClick={()=>setToast(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button></div></div>}</>;
}
