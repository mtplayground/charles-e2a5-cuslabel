import type {
  CreateLabelClassRequest,
  CreateProjectRequest,
  ImageDto,
  LabelClassDto,
  ProjectDto,
  RenameProjectRequest,
  UpdateLabelClassRequest
} from "@cuslabel/shared";

interface ProjectsResponse {
  projects: ProjectDto[];
}

interface ProjectResponse {
  project: ProjectDto;
}

interface ImagesResponse {
  images: ImageDto[];
}

interface LabelClassesResponse {
  classes: LabelClassDto[];
}

interface LabelClassResponse {
  class: LabelClassDto;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    let details: unknown;

    try {
      const body = (await response.json()) as {
        error?: string;
        details?: unknown;
      };
      message = body.error ?? message;
      details = body.details;
    } catch {
      details = undefined;
    }

    throw new ApiError(response.status, message, details);
  }

  return (await response.json()) as T;
}

export async function listProjects(): Promise<ProjectDto[]> {
  const response = await requestJson<ProjectsResponse>("/api/projects");
  return response.projects;
}

export async function createProject(
  input: CreateProjectRequest
): Promise<ProjectDto> {
  const response = await requestJson<ProjectResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return response.project;
}

export async function renameProject(
  projectId: string,
  input: RenameProjectRequest
): Promise<ProjectDto> {
  const response = await requestJson<ProjectResponse>(
    `/api/projects/${projectId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  return response.project;
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    let details: unknown;

    try {
      const body = (await response.json()) as {
        error?: string;
        details?: unknown;
      };
      message = body.error ?? message;
      details = body.details;
    } catch {
      details = undefined;
    }

    throw new ApiError(response.status, message, details);
  }
}

export async function listProjectImages(
  projectId: string
): Promise<ImageDto[]> {
  const response = await requestJson<ImagesResponse>(
    `/api/projects/${projectId}/images`
  );
  return response.images;
}

export async function listProjectClasses(
  projectId: string
): Promise<LabelClassDto[]> {
  const response = await requestJson<LabelClassesResponse>(
    `/api/projects/${projectId}/classes`
  );
  return response.classes;
}

export async function createLabelClass(
  projectId: string,
  input: CreateLabelClassRequest
): Promise<LabelClassDto> {
  const response = await requestJson<LabelClassResponse>(
    `/api/projects/${projectId}/classes`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
  return response.class;
}

export async function updateLabelClass(
  labelClassId: string,
  input: UpdateLabelClassRequest
): Promise<LabelClassDto> {
  const response = await requestJson<LabelClassResponse>(
    `/api/classes/${labelClassId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  return response.class;
}

export async function deleteLabelClass(labelClassId: string): Promise<void> {
  const response = await fetch(`/api/classes/${labelClassId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    let details: unknown;

    try {
      const body = (await response.json()) as {
        error?: string;
        details?: unknown;
      };
      message = body.error ?? message;
      details = body.details;
    } catch {
      details = undefined;
    }

    throw new ApiError(response.status, message, details);
  }
}
