type LogLevel = "info" | "warn" | "error";

type LogEvent = {
  action: string;
  area: string;
  status: "success" | "warning" | "error";
  message: string;
  metadata?: Record<string, unknown>;
};

function writeLog(level: LogLevel, event: LogEvent) {
  const payload = {
    timestamp: new Date().toISOString(),
    ...event,
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

export const appLogger = {
  info(event: LogEvent) {
    writeLog("info", event);
  },
  warn(event: LogEvent) {
    writeLog("warn", event);
  },
  error(event: LogEvent) {
    writeLog("error", event);
  },
};
