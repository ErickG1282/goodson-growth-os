"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { formatTime } from "@/lib/life-hq"

type WorkoutDay={id:string;record_date:string;workout_name:string;workout_time:string|null;workout_status:string;workout_notes:string}
type HistorySet={id:string;exercise_id:string;set_number:number;reps:number;weight_used:number|null;weight_unit:string;notes:string}
type HistoryExercise={id:string;exercise_name:string;sort_order:number;group_id:string|null;group_position:number|null;sets:HistorySet[]}
type HistoryGroup={id:string;group_type:string;group_name:string;sort_order:number}
type Detail={day:WorkoutDay|null;exercises:HistoryExercise[];groups:HistoryGroup[]}

const dateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`
const statusColor=(status:string)=>status==="Completed"?"bg-emerald-500":status==="Planned"?"bg-[#FBBF24]":status==="In Progress"?"bg-blue-500":"bg-slate-400"

export function WorkoutHistoryModal({open,onClose}:{open:boolean;onClose:()=>void}){
  const [month,setMonth]=useState(()=>{const now=new Date();return new Date(now.getFullYear(),now.getMonth(),1)})
  const [days,setDays]=useState<WorkoutDay[]>([])
  const [selectedDate,setSelectedDate]=useState<string|null>(null)
  const [detail,setDetail]=useState<Detail|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")
  const monthStart=dateKey(month),monthEnd=dateKey(new Date(month.getFullYear(),month.getMonth()+1,0))

  const loadMonth=useCallback(async()=>{
    if(!open)return
    setLoading(true);setError("")
    const{data:userData,error:userError}=await supabase.auth.getUser()
    if(userError||!userData.user){setError(userError?.message??"Sign in required.");setLoading(false);return}
    const result=await supabase.from("gbgs_life_daily_health").select("id,record_date,workout_name,workout_time,workout_status,workout_notes").eq("user_id",userData.user.id).gte("record_date",monthStart).lte("record_date",monthEnd).order("record_date")
    if(result.error)setError(result.error.message)
    setDays(((result.data??[])as WorkoutDay[]).filter(day=>day.workout_name.trim()))
    setLoading(false)
  },[open,monthStart,monthEnd])

  useEffect(()=>{void loadMonth()},[loadMonth])
  useEffect(()=>{if(!open){setSelectedDate(null);setDetail(null)}},[open])
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[open,onClose])

  const calendarDays=useMemo(()=>{const first=new Date(month.getFullYear(),month.getMonth(),1),last=new Date(month.getFullYear(),month.getMonth()+1,0),cells:(number|null)[]=Array(first.getDay()).fill(null);for(let day=1;day<=last.getDate();day++)cells.push(day);while(cells.length%7)cells.push(null);return cells},[month])
  const byDate=useMemo(()=>new Map(days.map(day=>[day.record_date,day])),[days])

  async function selectDay(key:string){
    setSelectedDate(key);setDetail(null);setError("")
    const day=byDate.get(key)??null
    if(!day){setDetail({day:null,exercises:[],groups:[]});return}
    setLoading(true)
    const{data:userData}=await supabase.auth.getUser()
    if(!userData.user){setError("Sign in required.");setLoading(false);return}
    const[exerciseResult,groupResult]=await Promise.all([
      supabase.from("gbgs_life_health_exercises").select("id,exercise_name,sort_order,group_id,group_position").eq("user_id",userData.user.id).eq("daily_health_id",day.id).order("sort_order"),
      supabase.from("gbgs_life_health_exercise_groups").select("id,group_type,group_name,sort_order").eq("user_id",userData.user.id).eq("daily_health_id",day.id).order("sort_order"),
    ])
    const queryError=exerciseResult.error??groupResult.error
    if(queryError){setError(queryError.message);setLoading(false);return}
    const exercises=(exerciseResult.data??[])as Omit<HistoryExercise,"sets">[]
    let sets:HistorySet[]=[]
    if(exercises.length){const setResult=await supabase.from("gbgs_life_health_exercise_sets").select("id,exercise_id,set_number,reps,weight_used,weight_unit,notes").eq("user_id",userData.user.id).in("exercise_id",exercises.map(item=>item.id)).order("set_number");if(setResult.error){setError(setResult.error.message);setLoading(false);return}sets=(setResult.data??[])as HistorySet[]}
    setDetail({day,groups:(groupResult.data??[])as HistoryGroup[],exercises:exercises.map(exercise=>({...exercise,sets:sets.filter(set=>set.exercise_id===exercise.id)}))})
    setLoading(false)
  }

  if(!open)return null
  const selectedLabel=selectedDate?new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}):""
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#071F3D]/60 p-4" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section role="dialog" aria-modal="true" aria-label="Workout history" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-[#071F3D] px-5 py-3 text-white"><h2 className="text-sm font-black uppercase tracking-wide text-[#FBBF24]">{selectedDate?`Workout History — ${selectedLabel}`:"Workout History"}</h2><button onClick={onClose} className="icon-button text-white" aria-label="Close workout history"><X className="h-5 w-5"/></button></header>
      <div className="p-4 sm:p-5">
        {error?<p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>:null}
        {selectedDate?<HistoryDetail detail={detail} loading={loading} onBack={()=>{setSelectedDate(null);setDetail(null)}}/>:<>
          <div className="mb-4 flex items-center justify-between"><button onClick={()=>setMonth(current=>new Date(current.getFullYear(),current.getMonth()-1,1))} className="quick-button" aria-label="Previous month"><ChevronLeft className="h-4 w-4"/></button><h3 className="text-lg font-black text-[#071F3D]">{month.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</h3><button onClick={()=>setMonth(current=>new Date(current.getFullYear(),current.getMonth()+1,1))} className="quick-button" aria-label="Next month"><ChevronRight className="h-4 w-4"/></button></div>
          <div className="grid grid-cols-7 border-b text-center text-[10px] font-black text-slate-500">{["SUN","MON","TUE","WED","THU","FRI","SAT"].map(label=><div key={label} className="py-2">{label}</div>)}</div>
          <div className="grid grid-cols-7">{calendarDays.map((number,index)=>{if(!number)return <div key={`blank-${index}`} className="min-h-16 border-b border-r border-slate-100"/>;const key=dateKey(new Date(month.getFullYear(),month.getMonth(),number)),workout=byDate.get(key);return <button key={key} onClick={()=>void selectDay(key)} className="min-h-16 border-b border-r border-slate-100 p-2 text-left hover:bg-blue-50"><span className="text-xs font-bold">{number}</span>{workout?<span className="mt-2 flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${statusColor(workout.workout_status)}`}/><span className="min-w-0 truncate text-[9px] font-semibold text-slate-600">{workout.workout_name}</span></span>:null}</button>})}</div>
          <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-bold text-slate-600">{[["Completed","bg-emerald-500"],["Planned","bg-[#FBBF24]"],["In Progress","bg-blue-500"],["Other","bg-slate-400"]].map(([label,color])=><span key={label} className="flex items-center gap-1"><i className={`h-2.5 w-2.5 rounded-full ${color}`}/>{label}</span>)}</div>
          {loading?<p className="mt-4 text-center text-sm text-slate-500">Loading workout history…</p>:null}
        </>}
        <div className="mt-5 flex justify-end"><button onClick={onClose} className="cancel-button life-form-cancel">Close</button></div>
      </div>
    </section>
  </div>
}

function HistoryDetail({detail,loading,onBack}:{detail:Detail|null;loading:boolean;onBack:()=>void}){
  if(loading)return <><button onClick={onBack} className="quick-button"><ChevronLeft className="h-4 w-4"/>Back to Calendar</button><p className="p-8 text-center text-sm text-slate-500">Loading workout…</p></>
  if(!detail?.day)return <><button onClick={onBack} className="quick-button"><ChevronLeft className="h-4 w-4"/>Back to Calendar</button><p className="my-8 text-center text-sm text-slate-500">No workout recorded for this date.</p></>
  const day=detail.day,grouped=new Set(detail.groups.map(group=>group.id)),ungrouped=detail.exercises.filter(exercise=>!exercise.group_id||!grouped.has(exercise.group_id))
  return <><button onClick={onBack} className="quick-button"><ChevronLeft className="h-4 w-4"/>Back to Calendar</button><div className="mt-4 grid gap-3 rounded-xl border border-[#FBBF24]/60 bg-blue-50 p-4 sm:grid-cols-2"><Info label="Workout" value={day.workout_name}/><Info label="Status" value={day.workout_status}/><Info label="Scheduled time" value={day.workout_time?formatTime(day.workout_time):"Anytime"}/><Info label="Workout notes" value={day.workout_notes||"No notes."}/></div><div className="mt-4 space-y-4">{detail.groups.map((group,index)=>{const members=detail.exercises.filter(exercise=>exercise.group_id===group.id).sort((a,b)=>(a.group_position??0)-(b.group_position??0));return <section key={group.id} className="rounded-xl border border-[#FBBF24] p-3"><h3 className="text-xs font-black uppercase text-[#071F3D]">{group.group_name||`${group.group_type} ${index+1}`}</h3><div className="mt-2 space-y-3">{members.map((exercise,position)=><ExerciseHistory key={exercise.id} exercise={exercise} prefix={`A${position+1}`}/>)}</div></section>})}{ungrouped.map(exercise=><ExerciseHistory key={exercise.id} exercise={exercise}/>)}</div></>
}

function Info({label,value}:{label:string;value:string}){return <div><p className="text-[10px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-[#071F3D]">{value}</p></div>}
function ExerciseHistory({exercise,prefix}:{exercise:HistoryExercise;prefix?:string}){return <section className="rounded-xl border border-slate-200 bg-white p-3"><h4 className="text-xs font-black uppercase text-[#071F3D]">{prefix?`${prefix} — `:""}{exercise.exercise_name}</h4><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[10px]"><thead><tr className="border-b text-slate-500"><th className="py-1">SET</th><th>REPS</th><th>WEIGHT</th><th>UNIT</th><th>NOTES</th></tr></thead><tbody>{exercise.sets.length?exercise.sets.map(set=><tr key={set.id} className="border-b border-slate-100"><td className="py-1.5">{set.set_number}</td><td>{set.reps}</td><td>{set.weight_used??"—"}</td><td>{set.weight_unit||"—"}</td><td>{set.notes||"—"}</td></tr>):<tr><td colSpan={5} className="py-3 text-center text-slate-400">No sets recorded.</td></tr>}</tbody></table></div></section>}
