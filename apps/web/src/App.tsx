import {
  Check,
  ChevronRight,
  FolderOpen,
  ImageIcon,
  ImageOff,
  LoaderCircle,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Tags,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createLabelClassRequestSchema,
  labelClassColorSchema,
  labelClassNameSchema,
  projectNameSchema,
  type ImageDto,
  type LabelClassDto,
  type ProjectDto
} from "@cuslabel/shared";
import {
  ApiError,
  createLabelClass,
  createProject,
  deleteLabelClass,
  deleteProject,
  listProjectClasses,
  listProjectImages,
  listProjects,
  renameProject,
  updateLabelClass
} from "./api";

type LoadState = "idle" | "loading" | "ready";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const fileSizeFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${fileSizeFormatter.format(value / 1024)} KB`;
  }

  return `${fileSizeFormatter.format(value / (1024 * 1024))} MB`;
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

function annotationProgress(project: ProjectDto | null): number {
  if (!project || project.imageCount === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((project.annotationCount / project.imageCount) * 100)
  );
}

export function App() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [images, setImages] = useState<ImageDto[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [labelClasses, setLabelClasses] = useState<LabelClassDto[]>([]);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [galleryState, setGalleryState] = useState<LoadState>("idle");
  const [classesState, setClassesState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [className, setClassName] = useState("");
  const [classColor, setClassColor] = useState("#22c55e");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingClassColor, setEditingClassColor] = useState("#22c55e");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? null,
    [images, selectedImageId]
  );

  const activeClass = useMemo(
    () =>
      labelClasses.find((labelClass) => labelClass.id === activeClassId) ??
      null,
    [activeClassId, labelClasses]
  );

  const progress = annotationProgress(selectedProject);

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
        setSelectedImageId(null);
        setActiveClassId(null);
        setImages([]);
        setLabelClasses([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadState("ready");
    }
  }, [selectedProjectId]);

  const refreshImages = useCallback(async (projectId: string) => {
    setGalleryState("loading");
    setGalleryError(null);

    try {
      const nextImages = await listProjectImages(projectId);
      setImages(nextImages);
      setSelectedImageId((current) => {
        if (current && nextImages.some((image) => image.id === current)) {
          return current;
        }

        return nextImages[0]?.id ?? null;
      });
    } catch (err) {
      setImages([]);
      setSelectedImageId(null);
      setGalleryError(errorMessage(err));
    } finally {
      setGalleryState("ready");
    }
  }, []);

  const refreshClasses = useCallback(async (projectId: string) => {
    setClassesState("loading");
    setClassesError(null);

    try {
      const nextClasses = await listProjectClasses(projectId);
      setLabelClasses(nextClasses);
      setActiveClassId((current) => {
        if (
          current &&
          nextClasses.some((labelClass) => labelClass.id === current)
        ) {
          return current;
        }

        return nextClasses[0]?.id ?? null;
      });
    } catch (err) {
      setLabelClasses([]);
      setActiveClassId(null);
      setClassesError(errorMessage(err));
    } finally {
      setClassesState("ready");
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setImages([]);
      setSelectedImageId(null);
      setLabelClasses([]);
      setActiveClassId(null);
      setGalleryState("idle");
      setClassesState("idle");
      setGalleryError(null);
      setClassesError(null);
      return;
    }

    void refreshImages(selectedProjectId);
    void refreshClasses(selectedProjectId);
  }, [refreshClasses, refreshImages, selectedProjectId]);

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

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedImageId(null);
    setActiveClassId(null);
    setGalleryError(null);
    setClassesError(null);
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
        setSelectedImageId(null);
        setActiveClassId(null);
        setImages([]);
        setLabelClasses([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  function updateProjectCount(projectId: string, delta: number) {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              labelClassCount: Math.max(0, project.labelClassCount + delta)
            }
          : project
      )
    );
  }

  async function handleCreateClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createLabelClassRequestSchema.safeParse({
      name: className,
      color: classColor
    });

    if (!selectedProject || !parsed.success) {
      setClassesError(
        parsed.success
          ? "Open a project before creating classes."
          : (parsed.error.issues[0]?.message ?? "Invalid class.")
      );
      return;
    }

    setPendingAction("createClass");
    setClassesError(null);

    try {
      const labelClass = await createLabelClass(
        selectedProject.id,
        parsed.data
      );
      setLabelClasses((current) => [...current, labelClass]);
      setActiveClassId(labelClass.id);
      updateProjectCount(selectedProject.id, 1);
      setClassName("");
      setClassColor(labelClass.color);
    } catch (err) {
      setClassesError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  function beginEditClass(labelClass: LabelClassDto) {
    setEditingClassId(labelClass.id);
    setEditingClassName(labelClass.name);
    setEditingClassColor(labelClass.color);
    setClassesError(null);
  }

  function cancelEditClass() {
    setEditingClassId(null);
    setEditingClassName("");
    setEditingClassColor("#22c55e");
  }

  async function handleUpdateClass(labelClassId: string) {
    const parsedName = labelClassNameSchema.safeParse(editingClassName);
    const parsedColor = labelClassColorSchema.safeParse(editingClassColor);

    if (!parsedName.success) {
      setClassesError(parsedName.error.issues[0]?.message ?? "Invalid name.");
      return;
    }

    if (!parsedColor.success) {
      setClassesError(parsedColor.error.issues[0]?.message ?? "Invalid color.");
      return;
    }

    setPendingAction(`updateClass:${labelClassId}`);
    setClassesError(null);

    try {
      const labelClass = await updateLabelClass(labelClassId, {
        name: parsedName.data,
        color: parsedColor.data
      });
      setLabelClasses((current) =>
        current.map((item) => (item.id === labelClass.id ? labelClass : item))
      );
      cancelEditClass();
    } catch (err) {
      setClassesError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeleteClass(labelClass: LabelClassDto) {
    const confirmed = window.confirm(`Delete "${labelClass.name}"?`);

    if (!confirmed) {
      return;
    }

    setPendingAction(`deleteClass:${labelClass.id}`);
    setClassesError(null);

    try {
      await deleteLabelClass(labelClass.id);
      const nextClasses = labelClasses.filter(
        (item) => item.id !== labelClass.id
      );
      setLabelClasses(nextClasses);
      setActiveClassId((currentActive) =>
        currentActive === labelClass.id
          ? (nextClasses[0]?.id ?? null)
          : currentActive
      );
      updateProjectCount(labelClass.projectId, -1);
    } catch (err) {
      setClassesError(errorMessage(err));
    } finally {
      setPendingAction(null);
    }
  }

  const isCreating = pendingAction === "create";
  const isInitialLoading = loadState === "loading";
  const isGalleryLoading = galleryState === "loading";
  const isClassesLoading = classesState === "loading";
  const isCreatingClass = pendingAction === "createClass";

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

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
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
                      <div className="flex flex-col gap-4">
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

                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
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

                        <div className="flex flex-wrap gap-2">
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
                                onClick={() => openProject(project.id)}
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

          <div className="min-w-0 rounded-lg border border-stone-800 bg-stone-900 p-5">
            {selectedProject ? (
              <div className="flex h-full min-h-[34rem] flex-col gap-5">
                <div className="flex flex-col gap-4 border-b border-stone-800 pb-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
                      Image Gallery
                    </p>
                    <h2 className="mt-2 break-words text-2xl font-semibold text-white">
                      {selectedProject.name}
                    </h2>
                    <p className="mt-2 text-sm text-stone-400">
                      {selectedProject.imageCount} images /{" "}
                      {selectedProject.annotationCount} annotations
                    </p>
                  </div>

                  <div className="w-full max-w-sm">
                    <div className="flex items-center justify-between gap-3 text-xs text-stone-300">
                      <span>Annotation progress</span>
                      <span className="font-semibold text-white">
                        {progress}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-stone-800">
                      <div
                        className="h-2 rounded-full bg-emerald-400"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {galleryError ? (
                  <div className="rounded-md border border-rose-700 bg-rose-950/70 px-4 py-3 text-sm text-rose-100">
                    {galleryError}
                  </div>
                ) : null}

                <section className="rounded-lg border border-stone-800 bg-stone-950 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
                        <Tags aria-hidden="true" size={15} />
                        Class Manager
                      </p>
                      <p className="mt-2 text-sm text-stone-400">
                        {labelClasses.length} classes / active class{" "}
                        {activeClass ? activeClass.name : "none"}
                      </p>
                    </div>

                    <form
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_72px_auto]"
                      onSubmit={handleCreateClass}
                    >
                      <label className="sr-only" htmlFor="class-name">
                        Class name
                      </label>
                      <input
                        className="h-10 min-w-0 rounded-md border border-stone-700 bg-stone-900 px-3 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                        id="class-name"
                        maxLength={80}
                        onChange={(event) => setClassName(event.target.value)}
                        placeholder="New class"
                        value={className}
                      />
                      <label className="flex h-10 items-center rounded-md border border-stone-700 bg-stone-900 px-2">
                        <span className="sr-only">Class color</span>
                        <input
                          className="h-7 w-full cursor-pointer rounded border-0 bg-transparent p-0"
                          onChange={(event) =>
                            setClassColor(event.target.value)
                          }
                          type="color"
                          value={classColor}
                        />
                      </label>
                      <button
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isCreatingClass}
                        type="submit"
                      >
                        <Plus aria-hidden="true" size={16} />
                        Add
                      </button>
                    </form>
                  </div>

                  {classesError ? (
                    <div className="mt-4 rounded-md border border-rose-700 bg-rose-950/70 px-3 py-2 text-sm text-rose-100">
                      {classesError}
                    </div>
                  ) : null}

                  {isClassesLoading ? (
                    <div className="mt-4 flex min-h-24 items-center justify-center rounded-md border border-stone-800 bg-stone-900 text-sm text-stone-300">
                      <LoaderCircle
                        aria-hidden="true"
                        className="mr-2 animate-spin"
                        size={16}
                      />
                      Loading classes
                    </div>
                  ) : labelClasses.length === 0 ? (
                    <div className="mt-4 flex min-h-24 items-center justify-center rounded-md border border-dashed border-stone-700 bg-stone-900/60 px-4 text-center text-sm text-stone-400">
                      No classes
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                      {labelClasses.map((labelClass) => {
                        const isActiveClass = activeClassId === labelClass.id;
                        const isEditingClass = editingClassId === labelClass.id;
                        const isUpdatingClass =
                          pendingAction === `updateClass:${labelClass.id}`;
                        const isDeletingClass =
                          pendingAction === `deleteClass:${labelClass.id}`;

                        return (
                          <article
                            className={`rounded-md border p-3 transition ${
                              isActiveClass
                                ? "border-emerald-400 bg-emerald-400/10"
                                : "border-stone-800 bg-stone-900 hover:border-stone-600"
                            }`}
                            key={labelClass.id}
                          >
                            {isEditingClass ? (
                              <div className="grid gap-2">
                                <input
                                  className="h-9 min-w-0 rounded-md border border-stone-700 bg-stone-950 px-3 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                                  maxLength={80}
                                  onChange={(event) =>
                                    setEditingClassName(event.target.value)
                                  }
                                  value={editingClassName}
                                />
                                <div className="grid grid-cols-[56px_1fr] gap-2">
                                  <label className="flex h-9 items-center rounded-md border border-stone-700 bg-stone-950 px-2">
                                    <span className="sr-only">Edit color</span>
                                    <input
                                      className="h-6 w-full cursor-pointer rounded border-0 bg-transparent p-0"
                                      onChange={(event) =>
                                        setEditingClassColor(event.target.value)
                                      }
                                      type="color"
                                      value={editingClassColor}
                                    />
                                  </label>
                                  <input
                                    className="h-9 min-w-0 rounded-md border border-stone-700 bg-stone-950 px-3 font-mono text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                                    onChange={(event) =>
                                      setEditingClassColor(event.target.value)
                                    }
                                    value={editingClassColor}
                                  />
                                </div>
                              </div>
                            ) : (
                              <button
                                className="flex w-full min-w-0 items-center gap-3 text-left"
                                onClick={() => setActiveClassId(labelClass.id)}
                                type="button"
                              >
                                <span
                                  aria-hidden="true"
                                  className="h-8 w-8 shrink-0 rounded-md border border-white/20"
                                  style={{ backgroundColor: labelClass.color }}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-white">
                                    {labelClass.name}
                                  </span>
                                  <span className="mt-1 block truncate font-mono text-xs text-stone-400">
                                    {labelClass.color}
                                  </span>
                                </span>
                              </button>
                            )}

                            <div className="mt-3 flex gap-2">
                              {isEditingClass ? (
                                <>
                                  <button
                                    className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-medium text-stone-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isUpdatingClass}
                                    onClick={() =>
                                      void handleUpdateClass(labelClass.id)
                                    }
                                    title="Save class"
                                    type="button"
                                  >
                                    <Save aria-hidden="true" size={15} />
                                  </button>
                                  <button
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                    onClick={cancelEditClass}
                                    title="Cancel"
                                    type="button"
                                  >
                                    <X aria-hidden="true" size={15} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-amber-500 hover:text-amber-200"
                                    onClick={() => beginEditClass(labelClass)}
                                    title="Edit class"
                                    type="button"
                                  >
                                    <Palette aria-hidden="true" size={15} />
                                  </button>
                                  <button
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-stone-700 px-3 text-sm text-stone-200 transition hover:border-rose-500 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isDeletingClass}
                                    onClick={() =>
                                      void handleDeleteClass(labelClass)
                                    }
                                    title="Delete class"
                                    type="button"
                                  >
                                    <Trash2 aria-hidden="true" size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                {isGalleryLoading ? (
                  <div className="flex min-h-80 items-center justify-center rounded-md border border-stone-800 bg-stone-950 text-sm text-stone-300">
                    <LoaderCircle
                      aria-hidden="true"
                      className="mr-2 animate-spin"
                      size={18}
                    />
                    Loading images
                  </div>
                ) : images.length === 0 ? (
                  <div className="flex min-h-80 flex-col items-center justify-center rounded-md border border-dashed border-stone-700 bg-stone-950/50 px-5 text-center text-sm text-stone-400">
                    <ImageOff
                      aria-hidden="true"
                      className="mb-3 text-stone-500"
                      size={30}
                    />
                    No images
                  </div>
                ) : (
                  <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="grid content-start gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      {images.map((image) => {
                        const isSelectedImage = selectedImageId === image.id;

                        return (
                          <article
                            className={`overflow-hidden rounded-lg border bg-stone-950 transition ${
                              isSelectedImage
                                ? "border-emerald-400 shadow-[0_0_0_1px_rgba(52,211,153,0.28)]"
                                : "border-stone-800 hover:border-stone-600"
                            }`}
                            key={image.id}
                          >
                            <button
                              className="block aspect-[4/3] w-full bg-stone-900"
                              onClick={() => setSelectedImageId(image.id)}
                              type="button"
                            >
                              <img
                                alt={image.metadata.originalName}
                                className="h-full w-full object-contain"
                                src={image.url}
                              />
                            </button>
                            <div className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="truncate text-sm font-semibold text-white">
                                    {image.metadata.originalName}
                                  </h3>
                                  <p className="mt-1 text-xs text-stone-400">
                                    {image.width} x {image.height} /{" "}
                                    {formatBytes(image.metadata.size)}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200">
                                  Pending
                                </span>
                              </div>

                              <button
                                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-stone-700 text-sm text-stone-100 transition hover:border-emerald-500 hover:text-emerald-200"
                                onClick={() => setSelectedImageId(image.id)}
                                type="button"
                              >
                                Open to annotate
                                <ChevronRight aria-hidden="true" size={16} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <aside className="rounded-lg border border-stone-800 bg-stone-950 p-4">
                      {selectedImage ? (
                        <div className="flex h-full flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
                                Open Image
                              </p>
                              <h3 className="mt-2 break-words text-lg font-semibold text-white">
                                {selectedImage.metadata.originalName}
                              </h3>
                            </div>
                            <Check
                              aria-hidden="true"
                              className="mt-1 shrink-0 text-emerald-300"
                              size={20}
                            />
                          </div>

                          <div className="mt-4 overflow-hidden rounded-md border border-stone-800 bg-stone-900">
                            <img
                              alt={selectedImage.metadata.originalName}
                              className="aspect-[4/3] w-full object-contain"
                              src={selectedImage.url}
                            />
                          </div>

                          <dl className="mt-4 grid gap-3">
                            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                              <dt className="text-sm text-stone-400">
                                Active class
                              </dt>
                              <dd className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
                                {activeClass ? (
                                  <>
                                    <span
                                      aria-hidden="true"
                                      className="h-4 w-4 shrink-0 rounded border border-white/20"
                                      style={{
                                        backgroundColor: activeClass.color
                                      }}
                                    />
                                    <span className="truncate">
                                      {activeClass.name}
                                    </span>
                                  </>
                                ) : (
                                  "None"
                                )}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                              <dt className="text-sm text-stone-400">Status</dt>
                              <dd className="text-sm font-semibold text-amber-200">
                                Pending
                              </dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                              <dt className="text-sm text-stone-400">Size</dt>
                              <dd className="text-sm font-semibold text-white">
                                {selectedImage.width} x {selectedImage.height}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                              <dt className="text-sm text-stone-400">Type</dt>
                              <dd className="text-sm font-semibold text-white">
                                {selectedImage.metadata.imageType ??
                                  selectedImage.metadata.mimeType}
                              </dd>
                            </div>
                            <div className="flex flex-col gap-1 pt-1">
                              <dt className="text-sm text-stone-400">
                                Uploaded
                              </dt>
                              <dd className="text-sm font-medium text-white">
                                {formatDate(selectedImage.createdAt)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ) : (
                        <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-stone-700 px-5 text-center text-sm text-stone-400">
                          <ImageIcon
                            aria-hidden="true"
                            className="mb-3 text-stone-500"
                            size={28}
                          />
                          No image open
                        </div>
                      )}
                    </aside>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[34rem] items-center justify-center rounded-md border border-dashed border-stone-700 px-5 text-center text-sm text-stone-400">
                No project open
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
