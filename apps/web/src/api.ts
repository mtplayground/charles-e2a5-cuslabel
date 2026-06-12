import type {
  AnnotationDto,
  CreateAnnotationRequest,
  CreateLabelClassRequest,
  CreateProjectRequest,
  ImageDto,
  LabelClassDto,
  ProjectDto,
  RenameProjectRequest,
  UpdateAnnotationRequest,
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

interface AnnotationsResponse {
  annotations: AnnotationDto[];
}

interface AnnotationResponse {
  annotation: AnnotationDto;
}

interface ErrorResponse {
  error?: string;
  details?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);

      if (found) {
        return found;
      }
    }
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const found = firstString(item);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function readErrorResponse(
  response: Response
): Promise<{ message: string; details: unknown }> {
  const fallback = `Request failed with status ${response.status}.`;

  try {
    const body = (await response.json()) as ErrorResponse;
    const message = body.error ?? fallback;
    const detailMessage = firstString(body.details);

    return {
      message: detailMessage ? `${message} ${detailMessage}` : message,
      details: body.details
    };
  } catch {
    return {
      message: fallback,
      details: undefined
    };
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
    const { message, details } = await readErrorResponse(response);

    throw new ApiError(response.status, message, details);
  }

  return (await response.json()) as T;
}

async function requestNoContent(
  path: string,
  init?: RequestInit
): Promise<void> {
  const response = await fetch(path, init);

  if (!response.ok) {
    const { message, details } = await readErrorResponse(response);

    throw new ApiError(response.status, message, details);
  }
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
  await requestNoContent(`/api/projects/${projectId}`, {
    method: "DELETE"
  });
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
  await requestNoContent(`/api/classes/${labelClassId}`, {
    method: "DELETE"
  });
}

export async function listImageAnnotations(
  imageId: string
): Promise<AnnotationDto[]> {
  const response = await requestJson<AnnotationsResponse>(
    `/api/images/${imageId}/annotations`
  );
  return response.annotations;
}

export async function createAnnotation(
  imageId: string,
  input: CreateAnnotationRequest
): Promise<AnnotationDto> {
  const response = await requestJson<AnnotationResponse>(
    `/api/images/${imageId}/annotations`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
  return response.annotation;
}

export async function updateAnnotation(
  annotationId: string,
  input: UpdateAnnotationRequest
): Promise<AnnotationDto> {
  const response = await requestJson<AnnotationResponse>(
    `/api/annotations/${annotationId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  return response.annotation;
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  await requestNoContent(`/api/annotations/${annotationId}`, {
    method: "DELETE"
  });
}
