export async function register() {
  const { assertDeploymentConfig } = await import("./lib/clerk-config");
  assertDeploymentConfig();
}
