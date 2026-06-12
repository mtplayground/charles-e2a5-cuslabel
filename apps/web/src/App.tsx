import {
  Check,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { projectNameSchema, type ProjectDto } from "@cuslabel/shared";
import {
  ApiError,
  createProject,
  deleteProject,
  listProjects,
  renameProject
} from "./api";

type LoadState = "idle" | "loading" | "ready";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
}

export function App() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const refreshProjects = useCallback(async () => {
    setLoadState((current) => (current === "idle" ? "loading" : current));
    setError(null);

    try {
      const nextProjects = await listProjects();
      setProjects(nextProjects);

      if (
        selectedProjectId &&
        !nextProjects.some((project) => project.id === selectedProjectId)
      ) {
        setSelectedProjectId(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadState("ready");
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = projectNameSchema.safeParse(createName);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid project name.");
      return;
    }

    setPendingAction("create");
    setError(null);

    try {
      const project = await createProject({ name: parsed.data });
      setProjects((current) => [project, ...current]);
      setSelectedProjectId(project.id);
      setCreateName("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  function beginRename(project: ProjectDto) {
    setEditingProjectId(project.id);
    setEditingName(project.name);
    setError(null);
  }

  function cancelRename() {
    setEditingProjectId(null);
    setEditingName("");
  }

  async function handleRename(projectId: string) {
    const parsed = projectNameSchema.safeParse(editingName);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid project name.");
      return;
    }

    setPendingAction(`rename:${projectId}`);
    setError(null);

    try {
      const project = await renameProject(projectId, { name: parsed.data });
      setProjects((current) =>
        current.map((item) => (item.id === project.id ? project : item))
      );
      cancelRename();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(project: ProjectDto) {
    const confirmed = window.confirm(`Delete "${project.name}"?`);

    if (!confirmed) {
      return;
    }

    setPendingAction(`delete:${project.id}`);
    setError(null);

    try {
      await deleteProject(project.id);
      setProjects((current) =>
        current.filter((item) => item.id !== project.id)
      );

      if (selectedProjectId === project.id) {
        setSelectedProjectId(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  const isCreating = pendingAction === "create";
  const isInitialLoading = loadState === "loading";

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
              Projects
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">
              Dashboard
            </h1>
          </div>

          <form
            className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl"
            onSubmit={handleCreateProject}
          >
            <label className="sr-only" htmlFor="project-name">
              Project name
            </label>
            <input
              className="h-11 min-w-0 flex-1 rounded-md border border-stone-700 bg-stone-900 px-3 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              id="project-name"
              maxLength={120}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="New project"
              value={createName}
            />
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCreating}
              type="submit"
            >
              <Plus aria-hidden="true" size={18} />
              Create
            </button>
          </form>
        </header>

        {error ? (
          <div className="mt-4 rounded-md border border-rose-700 bg-rose-950/70 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-400">
                Project List
              </h2>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-stone-500 hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isInitialLoading}
                onClick={() => void refreshProjects()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} />
                Refresh
              </button>
            </div>

            {isInitialLoading ? (
              <div className="rounded-lg border border-stone-800 bg-stone-900 p-5 text-sm text-stone-300">
                Loading projects
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-700 bg-stone-900/60 p-8 text-center text-sm text-stone-300">
                No projects
              </div>
            ) : (
              <div className="grid gap-3">
                {projects.map((project) => {
                  const isSelected = selectedProjectId === project.id;
                  const isEditing = editingProjectId === project.id;
                  const isRenaming = pendingAction === `rename:${project.id}`;
                  const isDeleting = pendingAction === `delete:${project.id}`;

                  return (
                    <article
                      className={`rounded-lg border bg-stone-900 p-4 transition ${
                        isSelected
                          ? "border-emerald-400 shadow-[0_0_0_1px_rgba(52,211,153,0.28)]"
                          : "border-stone-800 hover:border-stone-600"
                      }`}
                      key={project.id}
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <label className="block">
                              <span className="sr-only">Rename project</span>
                              <input
                                className="h-10 w-full rounded-md border border-stone-700 bg-stone-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                                maxLength={120}
                                onChange={(event) =>
                                  setEditingName(event.target.value)
                                }
                                value={editingName}
                              />
                            </label>
                          ) : (
                            <h3 className="truncate text-base font-semibold text-white">
                              {project.name}
                            </h3>
                          )}
                          <p className="mt-1 text-xs text-stone-400">
                            Updated {formatDate(project.updatedAt)}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:w-72">
                          <span className="rounded-md bg-stone-950 px-2 py-2 text-stone-300">
                            {project.imageCount} Images
                          </span>
                          <span className="rounded-md bg-stone-950 px-2 py-2 text-stone-300">
                            {project.labelClassCount} Classes
                          </span>
                          <span className="rounded-md bg-stone-950 px-2 py-2 text-stone-300">
                            {project.annotationCount} Labels
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          {isEditing ? (
                            <>
                              <button
                                className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-medium text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isRenaming}
                                onClick={() => void handleRename(project.id)}
                                title="Save"
                                type="button"
                              >
                                <Save aria-hidden="true" size={16} />
                              </button>
                              <button
                                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                onClick={cancelRename}
                                title="Cancel"
                                type="button"
                              >
                                <X aria-hidden="true" size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-emerald-500 hover:text-emerald-200"
                                onClick={() => setSelectedProjectId(project.id)}
                                type="button"
                              >
                                <FolderOpen aria-hidden="true" size={16} />
                                Open
                              </button>
                              <button
                                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-amber-500 hover:text-amber-200"
                                onClick={() => beginRename(project)}
                                title="Rename"
                                type="button"
                              >
                                <Pencil aria-hidden="true" size={16} />
                              </button>
                              <button
                                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-rose-500 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isDeleting}
                                onClick={() => void handleDelete(project)}
                                title="Delete"
                                type="button"
                              >
                                <Trash2 aria-hidden="true" size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-stone-800 bg-stone-900 p-5">
            {selectedProject ? (
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
                      Open Project
                    </p>
                    <h2 className="mt-2 break-words text-2xl font-semibold text-white">
                      {selectedProject.name}
                    </h2>
                  </div>
                  <Check
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-emerald-300"
                    size={22}
                  />
                </div>

                <dl className="mt-6 grid gap-3">
                  <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                    <dt className="text-sm text-stone-400">Images</dt>
                    <dd className="text-sm font-semibold text-white">
                      {selectedProject.imageCount}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                    <dt className="text-sm text-stone-400">Classes</dt>
                    <dd className="text-sm font-semibold text-white">
                      {selectedProject.labelClassCount}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                    <dt className="text-sm text-stone-400">Annotations</dt>
                    <dd className="text-sm font-semibold text-white">
                      {selectedProject.annotationCount}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 pt-1">
                    <dt className="text-sm text-stone-400">Created</dt>
                    <dd className="text-sm font-medium text-white">
                      {formatDate(selectedProject.createdAt)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-stone-700 px-5 text-center text-sm text-stone-400">
                No project open
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
