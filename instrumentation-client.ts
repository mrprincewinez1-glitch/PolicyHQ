import posthog from "posthog-js";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    disable_external_dependency_loading: true,
    debug: process.env.NODE_ENV === "development",
    loaded: () => {
      window.localStorage.removeItem("_postHogToolbarParams");
      window.sessionStorage.removeItem("toolbarParams");
    },
  });
}
