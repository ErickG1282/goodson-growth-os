"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Notification = { id: string; notification_type: string; customer_name: string | null; order_number: string | null; message: string; read_at: string | null; created_at: string };
const important = new Set(["Production Started", "Production Paused", "Production Resumed", "Packaging", "Ready for Pickup", "Out for Delivery", "Delivered"]);

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const [userId, setUserId] = useState("");
  const [businessId, setBusinessId] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: business } = await supabase.from("gbgs_businesses").select("id").eq("slug", "miz-ritas-kitchen").maybeSingle();
    if (!business) return;
    setBusinessId(business.id);
    await supabase.rpc("gbgs_refresh_time_notifications", { p_business_id: business.id });
    const [listResult, countResult] = await Promise.all([
      supabase.from("gbgs_notifications").select("id,notification_type,customer_name,order_number,message,read_at,created_at").eq("user_id", user.id).eq("business_id", business.id).order("created_at", { ascending: false }).limit(8),
      supabase.from("gbgs_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("business_id", business.id).is("read_at", null),
    ]);
    setItems((listResult.data ?? []) as Notification[]);
    setUnread(countResult.count ?? 0);
  }, []);

  useEffect(() => { void load(); const timer=window.setInterval(() => void load(),60000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    if (!userId || !businessId) return;
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gbgs_notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const incoming = payload.new as Notification | undefined;
        if (payload.eventType === "INSERT" && incoming && important.has(incoming.notification_type)) setToast(incoming);
        void load();
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, load, userId]);
  useEffect(() => { if (!toast) return; const timer=window.setTimeout(() => setToast(null), 5000); return () => window.clearTimeout(timer); }, [toast]);

  const markRead = async (id: string) => { if (items.find((item) => item.id===id)?.read_at) return; const readAt=new Date().toISOString(); setItems((current) => current.map((item) => item.id===id ? {...item,read_at:readAt} : item)); setUnread((current) => Math.max(0,current-1)); await supabase.from("gbgs_notifications").update({ read_at: readAt }).eq("id", id).eq("user_id", userId).is("read_at", null); };

  return <>
    <div className="relative">
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((value) => !value)} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:bg-slate-50">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3"><div><p className="font-bold text-slate-900">Notification Center</p><p className="text-xs text-slate-500">{unread} unread</p></div><button onClick={() => setOpen(false)} aria-label="Close notifications"><X className="h-4 w-4" /></button></div>
        <div className="max-h-96 overflow-y-auto">{items.map((item) => <button key={item.id} onClick={() => void markRead(item.id)} className="flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-slate-50">{!item.read_at ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" /> : <span className="w-2.5" />}<span><span className="block text-sm font-bold">{item.notification_type}</span><span className="block text-sm text-slate-600">{[item.customer_name,item.order_number].filter(Boolean).join(" · ")}</span><span className="block text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</span></span></button>)}{!items.length && <p className="p-6 text-center text-sm text-slate-400">No notifications yet.</p>}</div>
        <Link href="/dashboard/miz-rita/notifications" onClick={() => setOpen(false)} className="block bg-slate-50 px-4 py-3 text-center text-sm font-bold text-blue-700">View all notifications</Link>
      </div>}
    </div>
    {toast && <div className="fixed bottom-5 right-5 z-[100] max-w-sm rounded-2xl border-l-4 border-blue-600 bg-white p-4 shadow-2xl"><div className="flex gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><p className="font-bold">{toast.notification_type}</p><p className="text-sm text-slate-600">{[toast.customer_name,toast.order_number].filter(Boolean).join(" · ")}</p><p className="mt-1 text-sm">{toast.message}</p></div><button onClick={() => setToast(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button></div></div>}
  </>;
}
