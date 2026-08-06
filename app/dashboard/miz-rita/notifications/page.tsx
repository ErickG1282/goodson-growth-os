"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const filters = ["All", "Orders", "Kitchen", "Deliveries", "Inventory", "Payments", "Calendar"] as const;
type Filter = typeof filters[number];
type Notification = { id: string; user_id: string; notification_type: string; category: Exclude<Filter,"All">; customer_name: string | null; order_number: string | null; message: string; read_at: string | null; created_at: string };

export default function NotificationsPage() {
  const [items,setItems]=useState<Notification[]>([]);
  const [filter,setFilter]=useState<Filter>("All");
  const [userId,setUserId]=useState("");
  const [businessId,setBusinessId]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user){setError(authError?.message??"You must be signed in.");setLoading(false);return;}
    setUserId(user.id);
    const {data:business,error:businessError}=await supabase.from("gbgs_businesses").select("id").eq("slug","miz-ritas-kitchen").maybeSingle();
    if(businessError||!business){setError(businessError?.message??"Business not found.");setLoading(false);return;}
    setBusinessId(business.id);
    await supabase.rpc("gbgs_refresh_time_notifications",{p_business_id:business.id});
    const {data,error:notificationError}=await supabase.from("gbgs_notifications").select("id,user_id,notification_type,category,customer_name,order_number,message,read_at,created_at").eq("user_id",user.id).eq("business_id",business.id).order("created_at",{ascending:false}).limit(250);
    if(notificationError)setError(notificationError.message); else setItems((data??[]) as Notification[]);
    setLoading(false);
  },[]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!userId||!businessId)return;const channel=supabase.channel(`notification-center-${userId}`).on("postgres_changes",{event:"*",schema:"public",table:"gbgs_notifications",filter:`user_id=eq.${userId}`},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel);};},[businessId,load,userId]);

  const visible=useMemo(()=>filter==="All"?items:items.filter((item)=>item.category===filter),[filter,items]);
  const unread=items.filter((item)=>!item.read_at).length;
  const markRead=async(id:string)=>{const readAt=new Date().toISOString();setItems((current)=>current.map((item)=>item.id===id?{...item,read_at:item.read_at??readAt}:item));await supabase.from("gbgs_notifications").update({read_at:readAt}).eq("id",id).eq("user_id",userId).is("read_at",null);};
  const markAllRead=async()=>{const readAt=new Date().toISOString();setItems((current)=>current.map((item)=>({...item,read_at:item.read_at??readAt})));await supabase.from("gbgs_notifications").update({read_at:readAt}).eq("user_id",userId).is("read_at",null);};

  return <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
    <section className="rounded-3xl bg-[#081c35] p-7 text-white shadow-xl"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-[#d6a817]">Miz Rita HQ</p><h1 className="mt-2 text-3xl font-bold">Notification Center</h1><p className="mt-2 text-slate-300">Operational alerts from every part of the kitchen.</p></div><button disabled={!unread} onClick={()=>void markAllRead()} className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 font-bold disabled:opacity-40"><CheckCheck className="h-5 w-5" />Mark All Read</button></div></section>
    <div className="mt-6 flex flex-wrap gap-2">{filters.map((item)=><button key={item} onClick={()=>setFilter(item)} className={`rounded-xl px-4 py-2 text-sm font-bold ${filter===item?"bg-blue-600 text-white":"border border-slate-200 bg-white text-slate-700"}`}>{item}</button>)}</div>
    {error&&<p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>}
    <section className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="font-bold">{filter} Notifications</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">{unread} unread</span></div>
      {loading?<p className="p-8 text-center text-slate-400">Loading notifications...</p>:visible.map((item)=><button key={item.id} onClick={()=>void markRead(item.id)} className="flex w-full items-start gap-4 border-b px-5 py-4 text-left transition hover:bg-slate-50">
        <span className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.read_at?"bg-slate-100 text-slate-500":"bg-blue-100 text-blue-700"}`}><Bell className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-bold">{item.notification_type}</span>{!item.read_at&&<span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{item.category}</span></span><span className="mt-1 block text-sm text-slate-600">{[item.customer_name,item.order_number].filter(Boolean).join(" · ")||"Miz Rita HQ"}</span><span className="mt-1 block text-sm">{item.message}</span></span>
        <time className="shrink-0 text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time>
      </button>)}
      {!loading&&!visible.length&&<p className="p-10 text-center text-slate-400">No notifications in this category.</p>}
    </section>
  </main>;
}
