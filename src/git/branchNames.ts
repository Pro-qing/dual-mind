import type { TaskGitWorkspace } from '../shared/execution';

/** Immutable managed-branch identity; task display-name edits never rename a binding. */
export function taskBranchSlug(name: string): string {
  const normalized = name
    .normalize('NFKC')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return [...normalized].slice(0, 48).join('').replace(/-+$/g, '') || 'task';
}
export const branchSuffixLengths = [8, 12, 32] as const;
export function taskBranchName(taskId: string, slug: string, suffixLength: number) {
  return `dualmind/${slug}-${taskId.replaceAll('-', '').toLowerCase().slice(0, suffixLength)}`;
}
export function validManagedBranch(entry: TaskGitWorkspace): boolean {
  if (entry.branchNaming === undefined) {
    return entry.branch === `dualmind/task/${entry.taskId}/worker`;
  }
  const naming = entry.branchNaming;
  return Boolean(
    naming &&
    naming.version === 2 &&
    typeof naming.slug === 'string' &&
    naming.slug === taskBranchSlug(naming.slug) &&
    branchSuffixLengths.some((length) => length === naming.suffixLength) &&
    entry.branch === taskBranchName(entry.taskId, naming.slug, naming.suffixLength),
  );
}
