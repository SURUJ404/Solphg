// Log parsers for Solana CPI traces and CU profiling.
//
// Extracted from index.ts so they can be unit-tested without spinning up
// an Express server. Both parsers are pure functions over a string /
// string[] input and produce structured trees.

export interface CpiNode {
  programId: string
  depth: number
  computeUnits?: string
  accounts: string[]
  success: boolean
  error?: string
  children: CpiNode[]
}

export interface CpuProfileNode {
  programId: string
  cuConsumed: number
  depth: number
  success: boolean
  error?: string
  children: CpuProfileNode[]
}

export function computeOwnCu(node: CpuProfileNode): { nodeCu: number; ownCu: number } {
  const childrenCu = node.children.reduce((sum, c) => sum + computeOwnCu(c).nodeCu, 0)
  return { nodeCu: node.cuConsumed, ownCu: node.cuConsumed - childrenCu }
}

export function enhanceProfileTree(nodes: CpuProfileNode[], totalCu: number): any[] {
  return nodes.map(n => {
    const { ownCu } = computeOwnCu(n)
    const pct = totalCu > 0 ? Math.round((n.cuConsumed / totalCu) * 10000) / 100 : 0
    return {
      programId: n.programId,
      cuConsumed: n.cuConsumed,
      ownCu,
      depth: n.depth,
      success: n.success,
      error: n.error,
      percentage: pct,
      isHotspot: pct > 20,
      children: enhanceProfileTree(n.children, totalCu),
    }
  })
}

export function parseCpuProfileLogs(logs: string[]): { tree: any[]; totalCu: number } {
  const roots: CpuProfileNode[] = []
  const stack: CpuProfileNode[] = []

  for (const line of logs) {
    const invokeMatch = line.match(/Program\s+(\w+)\s+invoke\s+\[(\d+)\]/)
    if (invokeMatch) {
      const node: CpuProfileNode = {
        programId: invokeMatch[1],
        cuConsumed: 0,
        depth: parseInt(invokeMatch[2]),
        success: false,
        children: [],
      }
      if (node.depth === 1) {
        roots.push(node)
        stack.length = 0
        stack.push(node)
      } else if (stack.length > 0) {
        stack[stack.length - 1].children.push(node)
        stack.push(node)
      }
      continue
    }

    const cuMatch = line.match(/Program\s+(\w+)\s+consumed\s+(\d+)\s+of\s+(\d+)/)
    if (cuMatch) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].programId === cuMatch[1]) {
          stack[i].cuConsumed = parseInt(cuMatch[2])
          break
        }
      }
      continue
    }

    const successMatch = line.match(/Program\s+(\w+)\s+success\b/)
    if (successMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === successMatch[1]) {
        stack[stack.length - 1].success = true
        stack.pop()
      }
      continue
    }

    const errMatch = line.match(/Program\s+(\w+)\s+failed:\s*(.+)/)
    if (errMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === errMatch[1]) {
        stack[stack.length - 1].success = false
        stack[stack.length - 1].error = errMatch[2].trim()
        stack.pop()
      }
      continue
    }
  }

  const totalCu = roots.reduce((sum, r) => sum + r.cuConsumed, 0)
  return { tree: enhanceProfileTree(roots, totalCu), totalCu }
}

export function parseCpiLogs(logs: string): CpiNode[] {
  const roots: CpiNode[] = []
  const stack: CpiNode[] = []
  const lines = logs.split('\n')

  for (const line of lines) {
    // Match: Program <id> invoke [<depth>]
    const invokeMatch = line.match(/Program\s+(\w+)\s+invoke\s+\[(\d+)\]/)
    if (invokeMatch) {
      const node: CpiNode = {
        programId: invokeMatch[1],
        depth: parseInt(invokeMatch[2]),
        accounts: [],
        success: false,
        children: [],
      }
      if (node.depth === 1) {
        roots.push(node)
        stack.length = 0
        stack.push(node)
      } else if (stack.length > 0) {
        stack[stack.length - 1].children.push(node)
        stack.push(node)
      }
      continue
    }

    // Match: Program consumption: Program <id> consumed <n> of <m>
    const cuMatch = line.match(/Program\s+(\w+)\s+consumed\s+(\d+)\s+of\s+(\d+)/)
    if (cuMatch) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].programId === cuMatch[1]) {
          stack[i].computeUnits = `${cuMatch[2]} / ${cuMatch[3]}`
          break
        }
      }
      continue
    }

    // Match: Program <id> success (always plain, no error message)
    const successMatch = line.match(/Program\s+(\w+)\s+success\b/)
    if (successMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === successMatch[1]) {
        stack[stack.length - 1].success = true
        stack.pop()
      }
      continue
    }

    // Match: Program <id> failed: <error message>
    const errMatch = line.match(/Program\s+(\w+)\s+failed:\s*(.+)/)
    if (errMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === errMatch[1]) {
        stack[stack.length - 1].success = false
        stack[stack.length - 1].error = errMatch[2].trim()
        stack.pop()
      }
      continue
    }
  }

  return roots
}
