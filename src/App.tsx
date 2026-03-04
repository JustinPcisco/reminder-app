import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import { Auth } from "./Auth"
import type { Task, Note, AccountManager, TaskStatus } from "./types"

const accountManagers = [
  { value: "SE1", label: "Justin" },
  { value: "AM1", label: "Misha" },
] as const

const statusCard = {
  pending: "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900",
  in_progress: "border-yellow-200 bg-yellow-50 dark:border-yellow-500/30 dark:bg-yellow-500/10",
  completed: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
}

const statusBadge = {
  pending: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
  in_progress: "bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-100",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
}


type DbTask = {
  id: string
  team_id: string
  title: string
  description: string | null
  priority: number
  status: "pending" | "in_progress" | "completed"
  assigned_to: string
  due_date: string | null
  notes: Note[]
  created_at: string
  updated_at: string
  created_by: string
}

function dbTaskToUiTask(row: DbTask): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to as AccountManager,
    dueDate: row.due_date,
    notes: (row.notes ?? []) as Note[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function uiTaskToDbUpdate(task: Task) {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    assigned_to: task.assignedTo,
    due_date: task.dueDate,
    notes: task.notes,
  }
}

export default function App() {
  const [session, setSession] = useState<Awaited<
  ReturnType<typeof supabase.auth.getSession>
>["data"]["session"] | null>(null)

const [teamId, setTeamId] = useState<string | null>(null)
const [tasks, setTasks] = useState<Task[]>([])

// keep your existing filter/theme/editing states below this

  const [filter, setFilter] = useState<string>("all")
  const [editingId, setEditingId] = useState<string | null>(null)

  const [theme, setTheme] = useState<"light" | "dark">(() => {
  const saved = localStorage.getItem("theme")
  return saved === "dark" ? "dark" : "light"
})

useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    setSession(data.session)
  })

  const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
    setSession(newSession)
  })

  return () => {
    sub.subscription.unsubscribe()
  }
}, [])

  useEffect(() => {
  const root = document.documentElement
  if (theme === "dark") root.classList.add("dark")
  else root.classList.remove("dark")
  localStorage.setItem("theme", theme)
}, [theme])

useEffect(() => {
  if (!session?.user?.id) return

  ;(async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("team lookup error:", error)
      setTeamId(null)
      return
    }
    setTeamId(data?.team_id ?? null)
  })()
}, [session?.user?.id])

useEffect(() => {
  if (!teamId) return

  ;(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("fetch tasks error:", error)
      return
    }

    const rows = (data ?? []) as unknown as DbTask[]
    setTasks(rows.map(dbTaskToUiTask))
  })()
}, [teamId])

useEffect(() => {
  if (!teamId) return

  console.log("Realtime subscribing for teamId:", teamId)

  const channel = supabase
    .channel(`tasks:${teamId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tasks",
        filter: `team_id=eq.${teamId}`,
      },
      payload => {
        console.log("Realtime payload:", payload)

        const newRow = payload.new as unknown as DbTask
        const oldRow = payload.old as unknown as DbTask

        setTasks(prev => {
          if (payload.eventType === "INSERT") {
            const t = dbTaskToUiTask(newRow)
            return [t, ...prev.filter(x => x.id !== t.id)]
          }

          if (payload.eventType === "UPDATE") {
            const t = dbTaskToUiTask(newRow)
            return prev.map(x => (x.id === t.id ? t : x))
          }

          if (payload.eventType === "DELETE") {
            return prev.filter(x => x.id !== oldRow.id)
          }

          return prev
        })
      }
    )
    .subscribe(status => {
      console.log("Realtime status:", status)
    })

  return () => {
    supabase.removeChannel(channel)
  }
}, [teamId])

  async function addTask(
  title: string,
  description: string,
  priority: number,
  assignedTo: AccountManager,
  dueDate: string | null
) {
  if (!teamId || !session?.user?.id) return

  const { error } = await supabase.from("tasks").insert({
    team_id: teamId,
    title,
    description,
    priority,
    status: "pending",
    assigned_to: assignedTo,
    due_date: dueDate,
    notes: [],
    created_by: session.user.id,
  })

  if (error) console.error("insert task error:", error)
  // do NOT setTasks here — realtime will update the UI
}

if (!session) return <Auth />

if (!teamId) {
  return (
    <div className="min-h-screen p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-xl mx-auto space-y-3">
        <h1 className="text-2xl font-semibold">Signed in</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Waiting for team membership...
        </p>
        <pre className="text-xs p-3 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-auto">
          user.id: {session.user.id}
        </pre>
        <button
          onClick={async () => await supabase.auth.signOut()}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
                     dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

  async function updateStatus(id: string, status: TaskStatus) {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id)
  if (error) console.error("update status error:", error)
}

  async function addNote(taskId: string, content: string) {
  const task = tasks.find(t => t.id === taskId)
  if (!task) return

  const newNote: Note = {
    id: crypto.randomUUID(),
    content,
    timestamp: new Date().toISOString(),
  }

  await updateTask({
    ...task,
    notes: [...task.notes, newNote],
  })
}

<div className="text-xs mb-4 p-2 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900">
  session: {session ? "yes" : "no"} | teamId: {teamId ?? "null"} | tasks: {tasks.length}
</div>

  const filteredTasks = tasks
  .filter(task => matchesFilter(task, filter))
  .sort((a, b) => b.priority - a.priority)

  function isOverdue(task: Task) {
    if (!task.dueDate) return false
    if (task.status === "completed") return false

  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  return task.dueDate < todayStr
}

function priorityLabel(p: number) {
  if (p >= 5) return "Critical"
  if (p === 4) return "High"
  if (p === 3) return "Medium"
  if (p === 2) return "Low"
  return "Backlog"
}

function matchesFilter(task: Task, filterKey: string) {
  if (filterKey === "archive") return task.status === "completed"

  // "all" should now mean "all OPEN tasks" (not completed)
  if (filterKey === "all") return task.status !== "completed"

  if (filterKey === "AM1" || filterKey === "SE1")
    return task.assignedTo === filterKey && task.status !== "completed"

  return task.status === filterKey
}

async function updateTask(updated: Task) {
  const { error } = await supabase
    .from("tasks")
    .update(uiTaskToDbUpdate(updated))
    .eq("id", updated.id)

  if (error) console.error("update task error:", error)
}

async function deleteTask(taskId: string) {
  const ok = window.confirm("Delete this task? This cannot be undone.")
  if (!ok) return

  const { error } = await supabase.from("tasks").delete().eq("id", taskId)
  if (error) console.error("delete task error:", error)
}

const filterDefs = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "AM1", label: "Misha Good" },
  { key: "SE1", label: "Justin Pizarro" },
  { key: "archive", label: "Archive" },
] as const

const filterCounts: Record<string, number> = Object.fromEntries(
  filterDefs.map(f => [f.key, tasks.filter(t => matchesFilter(t, f.key)).length])
)

//const total = tasks.length
const pendingCount = tasks.filter(t => t.status === "pending").length
const inProgressCount = tasks.filter(t => t.status === "in_progress").length
//const completedCount = tasks.filter(t => t.status === "completed").length
const overdueCount = tasks.filter(t => isOverdue(t)).length

const am1Open = tasks.filter(t => t.assignedTo === "AM1" && t.status !== "completed").length
const se1Open = tasks.filter(t => t.assignedTo === "SE1" && t.status !== "completed").length


  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 p-6 md:p-8">
  <div className="flex items-center justify-between mb-6">
    <div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Tasks</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Priority, due dates, notes, and AM assignment
      </p>
    </div>

    <button
      onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}
      className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
                 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>

    <button
  onClick={async () => await supabase.auth.signOut()}
  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
             dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
>
  Sign out
</button>

  </div>

<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
  <MetricCard label="Open" value={pendingCount + inProgressCount} />
  <MetricCard label="Overdue" value={overdueCount} accent="danger" />
  <MetricCard label="Misha Open Tasks" value={am1Open} />
  <MetricCard label="Justin Open Tasks" value={se1Open} />
</div>


      <TaskForm onAdd={addTask} />

      <div className="flex flex-wrap gap-2 my-6">
  {filterDefs.map(f => {
    const active = filter === f.key
    return (
      <button
        key={f.key}
        onClick={() => setFilter(f.key)}
        className={`px-3 py-2 rounded-full text-sm border transition flex items-center gap-2 ${
          active
            ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
            : "bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:hover:bg-slate-800"
        }`}
      >
        <span>{f.label}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            active
              ? "bg-white/20 text-white dark:bg-slate-900/10 dark:text-slate-900"
              : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
          }`}
        >
          {filterCounts[f.key] ?? 0}
        </span>
      </button>
    )
  })}
</div>

      <div className="space-y-4">
        {filteredTasks.map(task => (
          <div
  key={task.id}
  className={`rounded-xl border p-4 shadow-sm transition ${
    isOverdue(task)
      ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10"
      : statusCard[task.status]
  }`}
>
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <h2 className="font-semibold text-lg leading-snug truncate">{task.title}</h2>

      {task.description && (
        <p className="text-sm mt-1 text-slate-600 dark:text-slate-300 line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className={`text-xs px-2 py-1 rounded-full ${statusBadge[task.status]}`}>
          {task.status.replace("_", " ")}
        </span>

        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {task.assignedTo}
        </span>

        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {priorityLabel(task.priority)} • {task.priority}
        </span>

        {task.dueDate && (
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              isOverdue(task)
                ? "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-100"
                : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
            }`}
          >
            Due {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>

    <div className="flex flex-col gap-2 shrink-0">
      <button
        onClick={() => updateStatus(task.id, "in_progress")}
        className="text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
                   dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        Start
      </button>

      <button
        onClick={() => updateStatus(task.id, "completed")}
        className="text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
      >
        Complete
      </button>

      <button
        onClick={() => updateStatus(task.id, "pending")}
        className="text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
                   dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        Reset
      </button>

      <button
  onClick={() => setEditingId(task.id)}
  className="text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
             dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
>
  Edit
</button>

<button
  onClick={() => deleteTask(task.id)}
  className="text-sm px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100
             dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
>
  Delete
</button>

{task.status !== "completed" ? (
  <>
    {/* Start / Complete / Reset */}
  </>
) : (
  <button
    onClick={() => updateStatus(task.id, "pending")}
    className="text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
               dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
  >
    Reopen
  </button>
)}

    </div>
  </div>

{editingId === task.id && (
  <TaskEditor
    task={task}
    onCancel={() => setEditingId(null)}
    onSave={(updated: Task) => {
      updateTask(updated)
      setEditingId(null)
    }}
  />
)}


  <NoteSection task={task} onAddNote={addNote} />
</div>
        ))}
      </div>
    </div>
  )
}

function TaskForm({ onAdd }: any) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState(3)
  const [assignedTo, setAssignedTo] = useState<AccountManager>("AM1")
  const [dueDate, setDueDate] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title) return
    onAdd(title, description, priority, assignedTo, dueDate || null)
    setTitle("")
    setDescription("")
    setDueDate("")
  }

  return (
    <form
  onSubmit={handleSubmit}
  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-4 rounded-xl shadow-sm space-y-3"
>
      <input
        className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 p-2 rounded-lg"
        placeholder="Task title"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />

      <input
        type="date"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 p-2 rounded-lg"
      />

      <textarea
        className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 p-2 rounded-lg"
        placeholder="Description"
        value={description}
        onChange={e => setDescription(e.target.value)}
      />

      <div className="flex gap-4">
        <select value={priority} onChange={e => setPriority(Number(e.target.value))} className="border p-2 rounded">
          {[1,2,3,4,5].map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value as AccountManager)} className="border p-2 rounded">
          {accountManagers.map(am => (
  <option key={am.value} value={am.value}>
    {am.label}
  </option>
))}
        </select>
      </div>

      <button className="bg-blue-500 text-white px-4 py-2 rounded">Add Task</button>
    </form>
  )
}

function NoteSection({ task, onAddNote }: any) {
  const [note, setNote] = useState("")
  
  return (
    <div className="mt-4">
      <div className="space-y-2">
        {task.notes.map((n: any) => (
          <div
            key={n.id}
            className="text-sm bg-white dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-white/10"
          >
            {n.content}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-2">
        <input
          className="border p-1 rounded flex-1"
          placeholder="Add note..."
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <button
          onClick={() => {
            if (!note) return
            onAddNote(task.id, note)
            setNote("")
          }}
          className="bg-slate-300 px-2 rounded"
        >
          Add
        </button>
      </div>
    </div>
  )  
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: "danger"
}) {
  const base =
    "rounded-xl border p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10"
  const danger =
    "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"

  return (
    <div className={`${base} ${accent === "danger" ? danger : ""}`}>
      <div className="text-xs text-slate-600 dark:text-slate-300">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  )
}


function TaskEditor({
  task,
  onCancel,
  onSave,
}: {
  task: Task
  onCancel: () => void
  onSave: (t: Task) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [priority, setPriority] = useState<number>(task.priority)
  const [assignedTo, setAssignedTo] = useState<AccountManager>(task.assignedTo)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [dueDate, setDueDate] = useState<string>(task.dueDate ?? "")

  return (
    <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 p-4 space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-300">Title</label>
          <input
            className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-2 rounded-lg"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-300">Due date</label>
          <input
            type="date"
            className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-2 rounded-lg"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-300">Priority</label>
          <select
            className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-2 rounded-lg"
            value={priority}
            onChange={e => setPriority(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-300">Assigned</label>
          <select
            className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-2 rounded-lg"
            value={assignedTo}
            onChange={e => setAssignedTo(e.target.value as AccountManager)}
          >
            {accountManagers.map(am => (
              <option key={am.value} value={am.value}>
                {am.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-slate-600 dark:text-slate-300">Status</label>
          <select
            className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-2 rounded-lg"
            value={status}
            onChange={e => setStatus(e.target.value as TaskStatus)}
          >
            <option value="pending">pending</option>
            <option value="in_progress">in progress</option>
            <option value="completed">completed</option>
          </select>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-slate-600 dark:text-slate-300">Description</label>
          <textarea
            className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-2 rounded-lg min-h-[90px]"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50
                     dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              ...task,
              title: title.trim() || task.title,
              description,
              priority,
              assignedTo,
              status,
              dueDate: dueDate || null,
            })
          }
          className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Save
        </button>
      </div>
    </div>
  )
}