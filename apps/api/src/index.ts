import cors from "cors";
import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import { checkDatabaseConnection, requireDatabaseUrl } from "@cuslabel/db";
import { createHealthPayload } from "@cuslabel/shared";
import {
  checkObjectStorageConnection,
  requireObjectStorageConfig
} from "@cuslabel/storage";

requireDatabaseUrl();
requireObjectStorageConfig();

const app = express();
const port = Number(process.env.PORT ?? "8080");
const host = process.env.HOST ?? "0.0.0.0";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res, next) => {
  try {
    await checkDatabaseConnection();
    await checkObjectStorageConnection();

    res.json({
      ...createHealthPayload("api"),
      database: "ok",
      storage: "ok"
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api", (_req, res) => {
  res.json({
    service: "api",
    status: "ok"
  });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("Unhandled API error", {
    name: err instanceof Error ? err.name : "UnknownError",
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });

  res.status(500).json({
    error: "Internal server error"
  });
};

app.use(errorHandler);

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
