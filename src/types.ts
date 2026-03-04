export type TaskStatus = "pending" | "in_progress" | "completed"

export type AccountManager = "SE1" | "AM1"

export interface Note {
  id: string
  content: string
  timestamp: string
}

export interface Task {
  id: string
  title: string
  description: string
  priority: number
  status: TaskStatus
  assignedTo: AccountManager
  notes: Note[]
  dueDate: string | null
  createdAt: string
  updatedAt: string
}