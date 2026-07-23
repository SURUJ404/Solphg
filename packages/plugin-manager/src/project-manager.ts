import type { SolpgProject, SolpgFile } from '@solshift/core'
import type { ProjectTemplate } from './templates.js'

const STORAGE_KEY = 'solpg_projects'

export class ProjectManager {
  private projects: SolpgProject[] = []

  constructor() {
    this.load()
  }

  createFromTemplate(template: ProjectTemplate): SolpgProject {
    const project: SolpgProject = {
      id: crypto.randomUUID(),
      name: template.name,
      files: template.files.map(f => ({ ...f })),
      framework: template.framework,
    }
    this.projects.push(project)
    this.save()
    return project
  }

  create(name: string, framework: 'anchor' | 'native'): SolpgProject {
    const project: SolpgProject = {
      id: crypto.randomUUID(),
      name,
      files: [],
      framework,
    }
    this.projects.push(project)
    this.save()
    return project
  }

  get(id: string): SolpgProject | undefined {
    return this.projects.find(p => p.id === id)
  }

  getAll(): SolpgProject[] {
    return this.projects
  }

  updateFile(projectId: string, filePath: string, content: string): boolean {
    const project = this.get(projectId)
    if (!project) return false
    const file = project.files.find(f => f.path === filePath)
    if (!file) return false
    file.content = content
    this.save()
    return true
  }

  addFile(projectId: string, file: SolpgFile): boolean {
    const project = this.get(projectId)
    if (!project) return false
    project.files.push(file)
    this.save()
    return true
  }

  removeFile(projectId: string, filePath: string): boolean {
    const project = this.get(projectId)
    if (!project) return false
    const idx = project.files.findIndex(f => f.path === filePath)
    if (idx === -1) return false
    project.files.splice(idx, 1)
    this.save()
    return true
  }

  delete(id: string): boolean {
    const idx = this.projects.findIndex(p => p.id === id)
    if (idx === -1) return false
    this.projects.splice(idx, 1)
    this.save()
    return true
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) this.projects = JSON.parse(raw)
    } catch {
      this.projects = []
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.projects))
    } catch {
      // localStorage unavailable (SSR, private browsing, extension blocking)
    }
  }
}
