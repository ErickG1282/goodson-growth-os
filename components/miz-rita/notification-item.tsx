"use client";

import { AlertTriangle, Bell, CircleCheck, DollarSign, Package, Pause, Play, ShoppingBag, Truck } from "lucide-react";

export type NotificationData={id:string;category:string;title:string;message:string;severity:string;is_read:boolean;created_at:string;related_order:{order_number:string;meal_count?:number|null;delivery_method?:string|null}|null;related_customer:{first_name:string;last_name:string|null}|null};

export function relativeTime(value:string){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<60)return "Just now";const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes} minute${minutes===1?"":"s"} ago`;const hours=Math.floor(minutes/60);if(hours<24)return `${hours} hour${hours===1?"":"s"} ago`;const days=Math.floor(hours/24);return `${days} day${days===1?"":"s"} ago`;}
export function customerName(item:NotificationData){return item.related_customer?`${item.related_customer.first_name} ${item.related_customer.last_name??""}`.trim():"Miz Rita HQ";}

function visual(item:NotificationData){
  if(item.title==="Inventory Low"||item.title==="Production Stopped"||item.title.includes("Overdue")||item.title.includes("Late"))return {Icon:AlertTriangle,style:"bg-red-100 text-red-700"};
  if(item.title==="Production Completed"||item.title==="Payment Received"||item.title==="Delivery Completed"||item.title.startsWith("Ready for"))return {Icon:item.title==="Payment Received"?DollarSign:item.title.startsWith("Ready")?Truck:CircleCheck,style:"bg-emerald-100 text-emerald-700"};
  if(item.title==="Production Paused"||item.title==="Packaging Ready"||item.title==="Driver Assigned")return {Icon:item.title==="Production Paused"?Pause:item.title==="Packaging Ready"?Package:Truck,style:"bg-amber-100 text-amber-700"};
  if(item.title==="New Order")return {Icon:ShoppingBag,style:"bg-blue-100 text-blue-700"};
  if(item.title.startsWith("Production"))return {Icon:Play,style:"bg-blue-100 text-blue-700"};
  return {Icon:Bell,style:"bg-slate-100 text-slate-700"};
}

export function NotificationItem({item,compact=false}:{item:NotificationData;compact?:boolean}){const {Icon,style}=visual(item);return <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{customerName(item)}</span>{item.related_order&&<span className="block text-xs font-semibold text-slate-500">Order {item.related_order.order_number}</span>}<span className="mt-1 block text-sm font-semibold text-slate-700">{item.title}</span>{!compact&&<span className="mt-1 block text-sm text-slate-600">{item.message}</span>}<span className="mt-1 block text-xs text-slate-400">{relativeTime(item.created_at)}</span></span>{!item.is_read&&<span aria-label="Unread" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />}</div>}
