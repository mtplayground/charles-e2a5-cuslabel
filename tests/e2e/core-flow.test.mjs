import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiPort = process.env.E2E_API_PORT ?? "18080";
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABQAAAAOCAYAAAAvxDzwAAAAOElEQVR4nGNk+M+ABzCC6ikoBiYGBgZGhoY/GdEfBsaC1H4YBAeDoMZ4MgxqjCfDoMZ4MggSAgDa4gIUMtR58AAAAABJRU5ErkJggg==",
  "base64"
);

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).replace(/^"|"$/g, "");
        return [key, value];
      })
  );
}

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const databaseUrlFile = resolve(repoRoot, ".database_url");

  if (!existsSync(databaseUrlFile)) {
    throw new Error("DATABASE_URL is required for E2E tests.");
  }

  return readFileSync(databaseUrlFile, "utf8").trim();
}

async function requestJson(path, init) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Request ${path} failed with ${response.status}: ${JSON.stringify(body)}`
    );
  }

  return body;
}

async function waitForApi(child, logs) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited early with ${child.exitCode}:\n${logs()}`);
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api`);

      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new Error(`Timed out waiting for API:\n${logs()}`);
}

async function startApi() {
  const env = {
    ...process.env,
    ...readEnvFile(resolve(repoRoot, ".env.production")),
    DATABASE_URL: readDatabaseUrl(),
    HOST: "127.0.0.1",
    PORT: apiPort
  };
  const child = spawn(process.execPath, ["apps/api/dist/index.js"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await waitForApi(child, () => output);

  return {
    stop: async () => {
      if (child.exitCode !== null) {
        return;
      }

      child.kill("SIGTERM");
      await new Promise((resolvePromise) => child.once("exit", resolvePromise));
    }
  };
}

async function createProject(name) {
  const body = await requestJson("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name })
  });

  return body.project;
}

async function createClass(projectId, name, color) {
  const body = await requestJson(`/api/projects/${projectId}/classes`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name, color })
  });

  return body.class;
}

async function uploadImage(projectId) {
  const form = new FormData();
  form.append(
    "images",
    new Blob([pngBytes], { type: "image/png" }),
    "core-flow.png"
  );

  const body = await requestJson(`/api/projects/${projectId}/images`, {
    method: "POST",
    body: form
  });

  return body.images[0];
}

async function createAnnotation(imageId, input) {
  const body = await requestJson(`/api/images/${imageId}/annotations`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return body.annotation;
}

async function deleteProject(projectId) {
  const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}`, {
    method: "DELETE"
  });

  assert.equal(response.status, 204);
}

async function assertValidationErrorsAreJson() {
  const malformedResponse = await fetch(`${apiBaseUrl}/api/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: '{"name":'
  });
  assert.equal(malformedResponse.status, 400);
  assert.match(malformedResponse.headers.get("content-type") ?? "", /json/);
  assert.deepEqual(await malformedResponse.json(), {
    error: "Malformed JSON request body.",
    status: 400
  });

  const missingRouteResponse = await fetch(`${apiBaseUrl}/api/not-a-route`);
  assert.equal(missingRouteResponse.status, 404);
  assert.match(missingRouteResponse.headers.get("content-type") ?? "", /json/);
  assert.deepEqual(await missingRouteResponse.json(), {
    error: "API route not found.",
    status: 404
  });
}

test("core flow creates data and exports COCO JSON", async () => {
  const api = await startApi();
  let projectId;

  try {
    await assertValidationErrorsAreJson();

    const project = await createProject(`E2E core flow ${Date.now()}`);
    projectId = project.id;

    const labelClass = await createClass(project.id, "Road sign", "#2563eb");
    const image = await uploadImage(project.id);

    assert.equal(image.width, 20);
    assert.equal(image.height, 14);
    assert.equal(image.metadata.originalName, "core-flow.png");

    const box = await createAnnotation(image.id, {
      type: "BOX",
      labelClassId: labelClass.id,
      geometry: {
        x: 2,
        y: 3,
        width: 8,
        height: 5
      }
    });
    const polyline = await createAnnotation(image.id, {
      type: "POLYLINE",
      labelClassId: labelClass.id,
      geometry: {
        points: [
          { x: 1, y: 1 },
          { x: 6, y: 4 },
          { x: 12, y: 8 }
        ]
      }
    });

    assert.equal(box.type, "BOX");
    assert.equal(polyline.type, "POLYLINE");

    const exportResponse = await fetch(
      `${apiBaseUrl}/api/projects/${project.id}/exports/coco`
    );
    assert.equal(exportResponse.status, 200);
    assert.match(
      exportResponse.headers.get("content-disposition") ?? "",
      /attachment/
    );
    assert.match(exportResponse.headers.get("content-type") ?? "", /json/);

    const coco = await exportResponse.json();
    assert.equal(coco.images.length, 1);
    assert.equal(coco.images[0].file_name, "core-flow.png");
    assert.equal(coco.images[0].width, 20);
    assert.equal(coco.images[0].height, 14);

    assert.equal(coco.categories.length, 1);
    assert.equal(coco.categories[0].name, "Road sign");
    assert.equal(coco.categories[0].color, "#2563eb");

    assert.equal(coco.annotations.length, 2);
    assert.deepEqual(coco.annotations[0].bbox, [2, 3, 8, 5]);
    assert.deepEqual(coco.annotations[0].segmentation, [
      [2, 3, 10, 3, 10, 8, 2, 8]
    ]);
    assert.equal(coco.annotations[0].type, "box");
    assert.deepEqual(coco.annotations[1].bbox, [1, 1, 11, 7]);
    assert.deepEqual(coco.annotations[1].points, [1, 1, 6, 4, 12, 8]);
    assert.equal(coco.annotations[1].type, "polyline");
  } finally {
    if (projectId) {
      await deleteProject(projectId);
    }

    await api.stop();
  }
});
